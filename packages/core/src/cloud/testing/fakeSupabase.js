/**
 * In-memory stand-in for the parts of supabase-js that CargoClear uses (PostgREST tables, Storage, Auth).
 * It imitates the server rules that matter for tests: rows are scoped to the signed-in user, composite parents must
 * exist for the same user, delete restrictions, and switchable network failure. It is NOT a substitute for testing
 * against a real Supabase project (see docs/SECURITY.md).
 */
const uuid = () => globalThis.crypto.randomUUID();
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const FKS = {
  comparisons: [['shipment_id', 'shipments']],
  offers: [['shipment_id', 'shipments'], ['carrier_id', 'carriers'], ['comparison_id', 'comparisons']],
  documents: [['shipment_id', 'shipments'], ['offer_id', 'offers'], ['carrier_id', 'carriers']],
  events: [['shipment_id', 'shipments']],
};
const RESTRICT = { carriers: [['offers', 'carrier_id']], shipments: [['comparisons', 'shipment_id'], ['offers', 'shipment_id']] };
const SET_NULL = { shipments: [['documents', 'shipment_id']], offers: [['documents', 'offer_id']], carriers: [['documents', 'carrier_id']] };
const CASCADE = { shipments: [['events', 'shipment_id']], comparisons: [['offers', 'comparison_id']] };

export function createFakeSupabase({ users = [] } = {}) {
  const tables = {};
  const t = (n) => (tables[n] ??= new Map());
  const files = new Map(); // path -> {blob, contentType, owner}
  const accounts = new Map(users.map((u) => [u.email, { ...u, id: u.id ?? uuid() }]));
  let session = null;
  const subs = new Set();
  const state = { offline: false, calls: [], failNext: [], emailConfirmation: false, sentResets: [], signedUrls: 0 };

  const emitAuth = (event) => subs.forEach((cb) => cb(event, session));
  const publicUser = (a) => ({ id: a.id, email: a.email, user_metadata: a.meta ?? {} });
  const uidNow = () => session?.user?.id ?? null;
  const netErr = () => ({ message: 'Failed to fetch', status: 0, name: 'TypeError' });
  const fail = (message, code, status = 400) => ({ message, code, status });

  function guard(op, table) {
    state.calls.push({ op, table });
    if (state.offline) return { error: netErr() };
    const idx = state.failNext.findIndex((f) => (!f.table || f.table === table) && (!f.op || f.op === op));
    if (idx >= 0) return { error: state.failNext.splice(idx, 1)[0].error };
    if (!uidNow()) return { error: fail('JWT expired', 'PGRST301', 401) };
    return null;
  }

  function checkFks(table, row) {
    for (const [col, parent] of FKS[table] ?? []) {
      if (row[col] == null) continue;
      const p = t(parent).get(row[col]);
      if (!p || p.user_id !== row.user_id) return fail(`violates foreign key constraint on ${col}`, '23503', 409);
    }
    return null;
  }

  function builder(table) {
    const q = { op: 'select', filters: [], rows: null, patch: null, order: null, range: null, single: null, upsertOpts: null };
    const run = () => {
      const g = guard(q.op, table);
      if (g) return g;
      const me = uidNow();
      const mine = () => [...t(table).values()].filter((r) => r.user_id === me || (table === 'profiles' && r.id === me));
      const matches = (r) => q.filters.every(([k, op, v]) => (op === 'eq' ? r[k] === v : v.includes(r[k])));
      if (q.op === 'select') {
        let rows = mine().filter(matches);
        if (q.order) rows.sort((a, b) => (a[q.order] < b[q.order] ? -1 : 1));
        if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
        rows = clone(rows);
        if (q.single) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }
      if (q.op === 'upsert') {
        for (const input of q.rows) {
          const row = clone(input);
          const ex = t(table).get(row.id);
          if (row.user_id !== me) return { error: fail('new row violates row-level security policy', '42501', 403) };
          if (ex && ex.user_id !== me) return { error: fail('new row violates row-level security policy', '42501', 403) };
          const merged = { ...(ex ?? { created_at: new Date().toISOString() }), ...row, updated_at: new Date().toISOString() };
          const fkErr = checkFks(table, merged);
          if (fkErr) return { error: fkErr };
          if (table === 'offers' && merged.base_price != null && merged.base_price < 0) return { error: fail('violates check constraint', '23514', 400) };
          t(table).set(merged.id, merged);
        }
        return { data: null, error: null };
      }
      if (q.op === 'update') {
        for (const r of mine().filter(matches)) {
          const next = { ...r, ...clone(q.patch) };
          const fkErr = checkFks(table, next);
          if (fkErr) return { error: fkErr };
          t(table).set(r.id, next);
        }
        return { data: null, error: null };
      }
      if (q.op === 'delete') {
        const victims = mine().filter(matches);
        for (const r of victims) {
          for (const [child, col] of RESTRICT[table] ?? []) if ([...t(child).values()].some((c) => c[col] === r.id)) return { error: fail(`violates foreign key constraint (${child}.${col})`, '23503', 409) };
        }
        for (const r of victims) {
          for (const [child, col] of SET_NULL[table] ?? []) for (const c of t(child).values()) if (c[col] === r.id) c[col] = null;
          for (const [child, col] of CASCADE[table] ?? []) for (const c of [...t(child).values()]) if (c[col] === r.id) t(child).delete(c.id);
          t(table).delete(r.id);
        }
        return { data: null, error: null };
      }
      return { error: fail('unsupported') };
    };
    const api = {
      select() { return api; },
      order(col) { q.order = col; return api; },
      range(a, b) { q.range = [a, b]; return api; },
      eq(k, v) { q.filters.push([k, 'eq', v]); return api; },
      in(k, v) { q.filters.push([k, 'in', v]); return api; },
      maybeSingle() { q.single = true; return api; },
      single() { q.single = true; return api; },
      upsert(rows) { q.op = 'upsert'; q.rows = Array.isArray(rows) ? rows : [rows]; return api; },
      update(patch) { q.op = 'update'; q.patch = patch; return api; },
      delete() { q.op = 'delete'; return api; },
      then(res, rej) { return Promise.resolve().then(run).then(res, rej); },
    };
    return api;
  }

  const storage = {
    from(bucket) {
      return {
        async upload(path, blob, opts = {}) {
          const g = guard('upload', 'storage');
          if (g) return g;
          if (path.split('/')[0] !== uidNow()) return { error: fail('new row violates row-level security policy', '42501', 403) };
          if (files.has(path) && !opts.upsert) return { error: fail('The resource already exists', 'Duplicate', 409) };
          files.set(`${bucket}/${path}`, { blob, contentType: opts.contentType, owner: uidNow() });
          files.set(path, files.get(`${bucket}/${path}`));
          return { data: { path }, error: null };
        },
        async remove(paths) {
          const g = guard('remove', 'storage');
          if (g) return g;
          for (const p of paths) if (files.get(p)?.owner === uidNow()) { files.delete(p); files.delete(`${bucket}/${p}`); }
          return { data: [], error: null };
        },
        async list(folder) {
          const g = guard('list', 'storage');
          if (g) return g;
          const names = [...files.keys()].filter((p) => !p.startsWith(`${bucket}/`) && p.startsWith(`${folder}/`) && files.get(p).owner === uidNow()).map((p) => ({ name: p.slice(folder.length + 1) }));
          return { data: names, error: null };
        },
        async createSignedUrl(path, secs) {
          const g = guard('sign', 'storage');
          if (g) return g;
          if (!files.has(path) || files.get(path).owner !== uidNow()) return { error: fail('Object not found', '404', 404) };
          state.signedUrls++;
          return { data: { signedUrl: `https://fake.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t${state.signedUrls}&exp=${secs}` }, error: null };
        },
      };
    },
  };

  const auth = {
    async getSession() {
      if (state.offline && !session) return { data: { session: null }, error: null };
      return { data: { session }, error: null };
    },
    onAuthStateChange(cb) {
      subs.add(cb);
      queueMicrotask(() => cb('INITIAL_SESSION', session));
      return { data: { subscription: { unsubscribe: () => subs.delete(cb) } } };
    },
    async signUp({ email, password, options = {} }) {
      if (state.offline) return { data: { user: null, session: null }, error: netErr() };
      if (accounts.has(email)) return { data: { user: null, session: null }, error: fail('User already registered', 'user_already_exists', 422) };
      if (String(password).length < 8) return { data: { user: null, session: null }, error: fail('Password should be at least 8 characters.', 'weak_password', 422) };
      const a = { id: uuid(), email, password, meta: options.data ?? {} };
      accounts.set(email, a);
      t('profiles').set(a.id, { id: a.id, email, full_name: a.meta.full_name ?? '', company_name: a.meta.company_name ?? '', preferred_language: a.meta.preferred_language ?? 'ru', settings: {}, user_id: a.id });
      if (state.emailConfirmation) return { data: { user: publicUser(a), session: null }, error: null };
      session = { access_token: `tok-${a.id}`, user: publicUser(a) };
      emitAuth('SIGNED_IN');
      return { data: { user: publicUser(a), session }, error: null };
    },
    async signInWithPassword({ email, password }) {
      if (state.offline) return { data: { user: null, session: null }, error: netErr() };
      const a = accounts.get(email);
      if (!a || a.password !== password) return { data: { user: null, session: null }, error: fail('Invalid login credentials', 'invalid_credentials', 400) };
      session = { access_token: `tok-${a.id}`, user: publicUser(a) };
      emitAuth('SIGNED_IN');
      return { data: { user: publicUser(a), session }, error: null };
    },
    async signOut() {
      session = null;
      emitAuth('SIGNED_OUT');
      return { error: null };
    },
    async resetPasswordForEmail(email, opts = {}) {
      if (state.offline) return { data: null, error: netErr() };
      state.sentResets.push({ email, redirectTo: opts.redirectTo }); // same answer for unknown emails: no account enumeration
      return { data: {}, error: null };
    },
    async updateUser(attrs) {
      if (!session) return { data: { user: null }, error: fail('Auth session missing!', 'session_not_found', 401) };
      const a = [...accounts.values()].find((x) => x.id === session.user.id);
      if (attrs.password) {
        if (String(attrs.password).length < 8) return { data: { user: null }, error: fail('Password should be at least 8 characters.', 'weak_password', 422) };
        a.password = attrs.password;
      }
      if (attrs.data) a.meta = { ...a.meta, ...attrs.data };
      session = { ...session, user: publicUser(a) };
      emitAuth('USER_UPDATED');
      return { data: { user: publicUser(a) }, error: null };
    },
  };

  return {
    from: (table) => builder(table),
    storage,
    auth,
    // test controls
    _state: state,
    _tables: tables,
    _files: files,
    _accounts: accounts,
    _setSession(user) { session = user ? { access_token: `tok-${user.id}`, user: publicUser(user) } : null; emitAuth(user ? 'SIGNED_IN' : 'SIGNED_OUT'); },
    _expireSession() { session = null; emitAuth('SIGNED_OUT'); },
    _recovery() { emitAuth('PASSWORD_RECOVERY'); },
    _rows: (table) => [...t(table).values()],
    _addUser(email, password) { const a = { id: uuid(), email, password, meta: {} }; accounts.set(email, a); return a; },
  };
}
