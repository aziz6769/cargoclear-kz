import { isUuid } from './ids.js';
import { BUCKET, dataUrlToBlob, storagePathFor } from './files.js';
import { COLLECTIONS, READ_ORDER, TABLE, WRITE_ORDER, cloudSettings, fromRow, hasPendingFile, toRow } from './mappers.js';

const OUTBOX = 'sync.outbox';
const SEQ = 'sync.seq';
const LAST_PULL = 'sync.lastPull';
const SETTINGS = '@settings';

export class SyncError extends Error {
  constructor(kind, message, cause) {
    super(message);
    this.kind = kind; // network | auth | rejected
    this.cause = cause;
  }
}

/** network: retry later and keep the change queued. auth: the session is gone. rejected: the server refused it (constraint / RLS). */
export function classifyError(err, online = true) {
  const msg = String(err?.message ?? err ?? '');
  const status = err?.status ?? err?.statusCode;
  if (!online || status === 0 || /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|fetch failed|ECONN|ENOTFOUND/i.test(msg) || err?.name === 'AuthRetryableFetchError') return 'network';
  if (status === 401 || /jwt|not authenticated|invalid.*token|session.*expired/i.test(msg) || err?.code === 'PGRST301') return 'auth';
  if (status >= 500) return 'network';
  return 'rejected';
}

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Cloud-backed storage adapter with the same contract as the memory/Dexie adapters, so the repository and the whole
 * domain engine run unchanged on top of it.
 *
 *   reads  -> from the local cache (fast, works offline)
 *   writes -> to the cache first, plus an entry in a persistent outbox; the outbox is pushed to Supabase in order
 *   pull() -> replaces non-pending cached records with the cloud state
 *
 * A change is "synced" only after Supabase confirmed it. Until then it is counted as pending; a change the server
 * rejects stays in the outbox (status "error") until the user retries or discards it. Nothing is dropped silently.
 */
export function createCloudAdapter({ client, userId, cache, isOnline = () => globalThis.navigator?.onLine !== false, pageSize = 1000, batchSize = 50, flushDelayMs = 30 }) {
  if (!client) throw new Error('createCloudAdapter: client is required');
  if (!isUuid(userId)) throw new Error('createCloudAdapter: userId must be a UUID');

  let rev = 0; // bumped on every local mutation / confirmed push; lets pull() detect concurrent writes
  let lock = Promise.resolve();
  const locked = (fn) => {
    const run = lock.then(fn, fn);
    lock = run.catch(() => {});
    return run;
  };
  const inflight = new Set();
  let flushing = null;
  let timer = null;
  let state = { phase: 'synced', error: null, lastSyncAt: null, pulling: false };
  const listeners = new Set();
  let cachedPending = 0;

  const emit = () => listeners.forEach((l) => l(status()));
  const setState = (patch) => {
    state = { ...state, ...patch };
    emit();
  };

  async function readOutbox() {
    return (await cache.getMeta(OUTBOX)) ?? [];
  }
  async function writeOutbox(ob) {
    await cache.setMeta(OUTBOX, ob);
    cachedPending = ob.length;
  }
  async function nextSeq() {
    const n = ((await cache.getMeta(SEQ)) ?? 0) + 1;
    await cache.setMeta(SEQ, n);
    return n;
  }

  function status() {
    let phase = state.phase;
    if ((phase === 'synced' || phase === 'offline') && cachedPending > 0) phase = 'pending'; // unsynchronised changes are never shown as saved
    if ((state.pulling || flushing) && (phase === 'synced' || phase === 'pending')) phase = 'syncing';
    return { state: phase, pending: cachedPending, error: state.error, lastSyncAt: state.lastSyncAt };
  }

  // ---------------------------------------------------------------- queueing (local, instant)
  async function enqueue(coll, id, op, extra = {}) {
    let ob = await readOutbox();
    if (op === 'put') {
      // keep the original queue position (parents before children) unless that entry is already being sent
      if (ob.some((o) => o.coll === coll && o.id === id && o.op === 'put' && !inflight.has(o.seq) && !o.failed)) {
        rev++;
        return;
      }
      ob = ob.filter((o) => !(o.coll === coll && o.id === id && o.op === 'remove' && !inflight.has(o.seq)));
    } else if (op === 'remove') {
      ob = ob.filter((o) => !(o.coll === coll && o.id === id && o.op === 'put' && !inflight.has(o.seq)));
    }
    ob.push({ seq: await nextSeq(), coll, id, op, ...extra });
    await writeOutbox(ob);
    rev++;
  }

  function scheduleFlush() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush().catch(() => {});
    }, flushDelayMs);
  }

  // ---------------------------------------------------------------- adapter contract
  const adapter = {
    getAll: (c) => cache.getAll(c),
    get: (c, id) => cache.get(c, id),

    async put(c, item) {
      if (!COLLECTIONS.includes(c)) throw new Error(`unknown collection ${c}`);
      if (!isUuid(item?.id)) throw new SyncError('rejected', `${c}: id must be a UUID`);
      await locked(async () => {
        const prev = c === 'documents' ? await cache.get(c, item.id) : null;
        await cache.put(c, item);
        await enqueue(c, item.id, 'put');
        const oldPath = prev?.file?.storagePath;
        // the previous object is removed after the put, unless the new upload will overwrite the very same path
        const newPath = hasPendingFile(item) ? storagePathFor(userId, item.id, item.file.name) : item.file?.storagePath;
        if (oldPath && oldPath !== newPath) await enqueue('documents', `file:${oldPath}`, 'rmfile', { path: oldPath });
      });
      setState({});
      scheduleFlush();
    },

    async bulkPut(c, items) {
      for (const i of items) await adapter.put(c, i);
    },

    async remove(c, id) {
      await locked(async () => {
        const prev = c === 'documents' ? await cache.get(c, id) : null;
        await cache.remove(c, id);
        await enqueue(c, id, 'remove', prev?.file?.storagePath ? { path: prev.file.storagePath } : {});
      });
      setState({});
      scheduleFlush();
    },

    /** Explicit "delete all my data": removes the user's rows and files in the cloud, then the cache. */
    async clearAll() {
      await flush().catch(() => {});
      const docs = await cache.getAll('documents');
      const paths = docs.map((d) => d.file?.storagePath).filter(Boolean);
      if (paths.length) await check(client.storage.from(BUCKET).remove(paths));
      for (const c of [...WRITE_ORDER].reverse()) await check(client.from(TABLE[c]).delete().eq('user_id', userId));
      await locked(async () => {
        const lp = await cache.getMeta(LAST_PULL);
        await cache.clearAll();
        if (lp) await cache.setMeta(LAST_PULL, lp);
        cachedPending = 0;
        rev++;
      });
      setState({ phase: 'synced', error: null });
    },

    getMeta: (k) => cache.getMeta(k),
    async setMeta(k, v) {
      await locked(async () => {
        await cache.setMeta(k, v);
        // Settings go to the profile, but only once the cloud state is known: a blind write from a fresh,
        // never-pulled device would overwrite real cloud settings with defaults.
        if (k === 'settings' && (await cache.getMeta(LAST_PULL))) await enqueue(SETTINGS, 'settings', 'put');
      });
      if (k === 'settings') {
        setState({});
        scheduleFlush();
      }
    },
  };

  // ---------------------------------------------------------------- talking to Supabase
  async function check(promise) {
    let res;
    try {
      res = await promise;
    } catch (e) {
      throw new SyncError(classifyError(e, isOnline()), String(e?.message ?? e), e);
    }
    if (res?.error) throw new SyncError(classifyError(res.error, isOnline()), String(res.error.message ?? res.error), res.error);
    return res;
  }

  async function execute(group) {
    const { coll, op } = group[0];
    if (coll === SETTINGS) {
      const s = (await cache.getMeta('settings')) ?? {};
      const patch = { settings: cloudSettings(s) };
      if (['ru', 'kk', 'en'].includes(s.language)) patch.preferred_language = s.language;
      await check(client.from('profiles').update(patch).eq('id', userId));
      return;
    }
    if (op === 'rmfile') {
      await check(client.storage.from(BUCKET).remove([group[0].path]));
      return;
    }
    if (op === 'remove') {
      const paths = group.map((g) => g.path).filter(Boolean);
      if (paths.length) await check(client.storage.from(BUCKET).remove(paths));
      await check(client.from(TABLE[coll]).delete().in('id', group.map((g) => g.id)));
      return;
    }
    // put
    const recs = (await Promise.all(group.map((g) => cache.get(coll, g.id)))).filter(Boolean);
    if (!recs.length) return; // deleted locally after it was queued; the matching remove is queued too
    if (coll === 'documents') {
      for (const rec of recs) await pushDocument(rec);
      return;
    }
    await check(client.from(TABLE[coll]).upsert(recs.map((r) => toRow(coll, r, userId)), { onConflict: 'id' }));
    if (coll === 'comparisons') {
      for (const c of recs) if (c.offerIds?.length) await check(client.from('offers').update({ comparison_id: c.id }).in('id', c.offerIds));
    }
  }

  async function pushDocument(rec) {
    let out = rec;
    if (hasPendingFile(rec)) {
      const path = storagePathFor(userId, rec.id, rec.file.name);
      const blob = dataUrlToBlob(rec.file.dataUrl);
      await check(client.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: rec.file.type || blob.type }));
      out = { ...rec, file: { name: rec.file.name, size: rec.file.size, type: rec.file.type, storagePath: path } };
    }
    await check(client.from('documents').upsert([toRow('documents', out, userId)], { onConflict: 'id' }));
    if (out !== rec) {
      await locked(async () => {
        const cur = await cache.get('documents', rec.id);
        if (cur?.file?.dataUrl === rec.file.dataUrl) await cache.put('documents', out); // file is now in the cloud; drop the local copy of its bytes
      });
    }
  }

  function takeGroup(ob) {
    const first = ob[0];
    if (first.op !== 'put' || first.coll === 'documents' || first.coll === SETTINGS) return [first];
    const group = [first];
    for (const o of ob.slice(1)) {
      if (group.length >= batchSize || o.op !== 'put' || o.coll !== first.coll) break;
      group.push(o);
    }
    return group;
  }

  // ---------------------------------------------------------------- flush (local -> cloud)
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      try {
        for (;;) {
          const ob = (await readOutbox()).sort((a, b) => a.seq - b.seq);
          cachedPending = ob.length;
          if (!ob.length) {
            setState({ phase: 'synced', error: null, lastSyncAt: new Date().toISOString() });
            return status();
          }
          if (ob[0].failed) {
            setState({ phase: 'error', error: ob[0].failed });
            return status();
          }
          if (!isOnline()) {
            setState({ phase: 'pending', error: { kind: 'network', message: 'offline' } });
            return status();
          }
          const group = takeGroup(ob);
          group.forEach((g) => inflight.add(g.seq));
          try {
            await execute(group);
          } catch (e) {
            const kind = e instanceof SyncError ? e.kind : classifyError(e, isOnline());
            const message = String(e?.message ?? e);
            if (kind === 'rejected') {
              await locked(async () => {
                const cur = await readOutbox();
                const hit = cur.find((o) => o.seq === group[0].seq);
                if (hit) hit.failed = { kind, message, coll: hit.coll, id: hit.id };
                await writeOutbox(cur);
              });
              setState({ phase: 'error', error: { kind, message, coll: group[0].coll, id: group[0].id } });
            } else {
              setState({ phase: kind === 'auth' ? 'auth' : 'pending', error: { kind, message } });
            }
            return status();
          } finally {
            group.forEach((g) => inflight.delete(g.seq));
          }
          await locked(async () => {
            const done = new Set(group.map((g) => g.seq));
            await writeOutbox((await readOutbox()).filter((o) => !done.has(o.seq)));
            rev++;
          });
          setState({ phase: 'syncing', error: null });
        }
      } finally {
        flushing = null;
        emit();
      }
    })();
    emit();
    return flushing;
  }

  // ---------------------------------------------------------------- pull (cloud -> cache)
  async function fetchAll(coll) {
    const out = [];
    for (let from = 0; ; from += pageSize) {
      const { data } = await check(client.from(TABLE[coll]).select('*').order('id', { ascending: true }).range(from, from + pageSize - 1));
      out.push(...(data ?? []));
      if ((data ?? []).length < pageSize) break;
    }
    return out.map((r) => fromRow(coll, r));
  }

  async function pull() {
    if (!isOnline()) {
      setState({ phase: cachedPending ? 'pending' : 'offline', error: { kind: 'network', message: 'offline' } });
      return { ok: false, reason: 'offline' };
    }
    setState({ pulling: true });
    const startRev = rev;
    let fetched;
    let profile;
    try {
      fetched = {};
      for (const c of READ_ORDER) fetched[c] = await fetchAll(c);
      ({ data: profile } = await check(client.from('profiles').select('*').eq('id', userId).maybeSingle()));
    } catch (e) {
      const kind = e instanceof SyncError ? e.kind : classifyError(e, isOnline());
      setState({ pulling: false, phase: kind === 'auth' ? 'auth' : cachedPending ? 'pending' : kind === 'network' ? 'offline' : 'error', error: { kind, message: String(e?.message ?? e) } });
      return { ok: false, reason: kind };
    }
    await locked(async () => {
      const ob = await readOutbox();
      const dirty = new Set(ob.map((o) => `${o.coll}:${o.id}`));
      const safeDelete = rev === startRev; // nothing changed locally while we were fetching
      for (const c of COLLECTIONS) {
        const local = await cache.getAll(c);
        const localById = new Map(local.map((r) => [r.id, r]));
        const cloudIds = new Set();
        for (const rec of fetched[c]) {
          cloudIds.add(rec.id);
          if (dirty.has(`${c}:${rec.id}`)) continue; // an unsynchronised local change wins until it is pushed
          const cur = localById.get(rec.id);
          // a document whose bytes are still only local keeps them
          const keep = c === 'documents' && hasPendingFile(cur) ? cur : null;
          if (keep) continue;
          if (!cur || !same(cur, rec)) await cache.put(c, rec);
        }
        if (safeDelete) {
          for (const l of local) if (!cloudIds.has(l.id) && !dirty.has(`${c}:${l.id}`)) await cache.remove(c, l.id);
        }
      }
      if (profile && !dirty.has(`${SETTINGS}:settings`)) {
        const cur = (await cache.getMeta('settings')) ?? null;
        const remote = profile.settings && typeof profile.settings === 'object' ? profile.settings : {};
        if (Object.keys(remote).length) await cache.setMeta('settings', { ...(cur ?? {}), ...remote, ...(cur?.assistantEndpoint ? { assistantEndpoint: cur.assistantEndpoint } : {}) });
      }
      await cache.setMeta(LAST_PULL, new Date().toISOString());
      cachedPending = ob.length;
    });
    setState({ pulling: false, phase: cachedPending ? 'pending' : 'synced', error: null, lastSyncAt: new Date().toISOString() });
    return { ok: true };
  }

  async function sync() {
    const f = await flush();
    if (f.state === 'error' || f.state === 'auth') return f;
    await pull();
    if (cachedPending) await flush();
    return status();
  }

  // ---------------------------------------------------------------- failed-change handling and helpers
  async function retryFailed() {
    await locked(async () => {
      const ob = await readOutbox();
      ob.forEach((o) => delete o.failed);
      await writeOutbox(ob);
    });
    setState({ phase: 'pending', error: null });
    return flush();
  }
  /** Drops the rejected change(s) from the queue; the next pull restores the cloud version of those records. */
  async function discardFailed() {
    let dropped = [];
    await locked(async () => {
      const ob = await readOutbox();
      dropped = ob.filter((o) => o.failed);
      await writeOutbox(ob.filter((o) => !o.failed));
      rev++;
    });
    setState({ phase: 'pending', error: null });
    await flush();
    await pull();
    return dropped;
  }
  async function pendingChanges() {
    return (await readOutbox()).map(({ seq, coll, id, op, failed }) => ({ seq, coll, id, op, failed: failed ?? null }));
  }
  /** Resolves when the queue is empty or after `ms` (whichever first); returns the status. */
  async function settled(ms = 8000) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      flush().catch(() => {});
    }
    if (!flushing) return status();
    await Promise.race([flushing.catch(() => {}), new Promise((r) => setTimeout(r, ms))]);
    return status();
  }

  /** Short-lived signed URL for a private document. Public URLs are never created. */
  async function signedUrl(path, seconds = 60) {
    const { data } = await check(client.storage.from(BUCKET).createSignedUrl(path, seconds));
    return data.signedUrl;
  }

  async function init() {
    cachedPending = (await readOutbox()).length;
    if (cachedPending) setState({ phase: 'pending' });
  }

  return Object.assign(adapter, {
    kind: 'cloud',
    userId,
    status,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    init,
    flush,
    pull,
    sync,
    settled,
    retryFailed,
    discardFailed,
    pendingChanges,
    signedUrl,
    // low-level helpers used by the IndexedDB migration (bypass the cache and the outbox on purpose)
    _push: { toRow, check, client, userId },
  });
}
