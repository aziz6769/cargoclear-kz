import { isUuid, uuidv5 } from './ids.js';
import { BUCKET, dataUrlToBlob, storagePathFor } from './files.js';
import { WRITE_ORDER, TABLE, hasPendingFile, toRow } from './mappers.js';

const isDemo = (r) => r?.isDemo === true;
const blank = (v) => v === '' || v === null || v === undefined;

/** New id for a local record: deterministic per (user, old id), so a retry produces the same ids and never duplicates. */
export const mapId = (userId, oldId) => uuidv5(`${userId}|${oldId}`);

/**
 * Pure: decides what would be uploaded. Demo seed data is never included (unless a real record depends on it,
 * which is reported). Nothing is read from or written to the network here.
 */
export function buildMigrationPlan(local, userId) {
  const L = { carriers: [], shipments: [], offers: [], comparisons: [], documents: [], events: [], ...local };
  const warnings = [];
  const skipped = { demo: 0, orphanOffers: 0, other: 0 };
  const byId = (arr) => new Map(arr.map((r) => [r.id, r]));
  const shipments = byId(L.shipments), carriers = byId(L.carriers), offers = byId(L.offers);

  const inc = { shipments: new Set(), carriers: new Set(), offers: new Set(), comparisons: new Set(), documents: new Set(), events: new Set() };
  for (const s of L.shipments) if (!isDemo(s)) inc.shipments.add(s.id);
  for (const c of L.carriers) if (!isDemo(c)) inc.carriers.add(c.id);

  for (const cmp of L.comparisons) {
    if (isDemo(cmp)) continue;
    inc.comparisons.add(cmp.id);
    if (!inc.shipments.has(cmp.shipmentId) && shipments.has(cmp.shipmentId)) {
      inc.shipments.add(cmp.shipmentId);
      warnings.push({ code: 'demo_dependency', coll: 'shipments', id: cmp.shipmentId, by: cmp.id });
    }
    for (const oid of cmp.offerIds ?? []) {
      const o = offers.get(oid);
      if (!o) { warnings.push({ code: 'missing_offer', coll: 'offers', id: oid, by: cmp.id }); continue; }
      inc.offers.add(oid);
      if (!inc.carriers.has(o.carrierId) && carriers.has(o.carrierId)) {
        inc.carriers.add(o.carrierId);
        if (isDemo(carriers.get(o.carrierId))) warnings.push({ code: 'demo_dependency', coll: 'carriers', id: o.carrierId, by: oid });
      }
    }
  }
  for (const o of L.offers) if (!inc.offers.has(o.id)) { if (isDemo(o)) skipped.demo++; else skipped.orphanOffers++; }

  for (const d of L.documents) {
    const parent = shipments.get(d.shipmentId);
    if (parent && isDemo(parent) && !inc.shipments.has(parent.id)) { skipped.demo++; continue; } // belongs to demo data
    inc.documents.add(d.id); // links to records that are not uploaded are cleared below
  }
  for (const e of L.events) {
    const ok = (e.entityType === 'shipment' && inc.shipments.has(e.entityId)) || (e.entityType === 'carrier' && inc.carriers.has(e.entityId));
    if (ok) inc.events.add(e.id);
    else if (e.entityType === 'shipment' ? isDemo(shipments.get(e.entityId)) : isDemo(carriers.get(e.entityId))) skipped.demo++;
    else skipped.other++;
  }
  for (const c of ['shipments', 'carriers', 'comparisons']) for (const r of L[c]) if (!inc[c].has(r.id) && isDemo(r)) skipped.demo++;

  const m = (id) => (blank(id) ? id : mapId(userId, id));
  const records = { carriers: [], shipments: [], offers: [], comparisons: [], documents: [], events: [] };
  const idMap = {};
  const take = (coll, arr, fn) => {
    for (const r of arr) {
      if (!inc[coll].has(r.id)) continue;
      const id = mapId(userId, r.id);
      idMap[`${coll}:${r.id}`] = id;
      records[coll].push({ ...fn(r), id, legacyId: r.id });
    }
  };
  take('carriers', L.carriers, (r) => r);
  take('shipments', L.shipments, (r) => r);
  take('offers', L.offers, (r) => ({ ...r, carrierId: m(r.carrierId), shipmentId: m(r.shipmentId) }));
  take('comparisons', L.comparisons, (r) => ({ ...r, shipmentId: m(r.shipmentId), offerIds: (r.offerIds ?? []).filter((o) => inc.offers.has(o)).map(m) }));
  take('documents', L.documents, (r) => ({
    ...r,
    shipmentId: inc.shipments.has(r.shipmentId) ? m(r.shipmentId) : '',
    offerId: inc.offers.has(r.offerId) ? m(r.offerId) : '',
    carrierId: inc.carriers.has(r.carrierId) ? m(r.carrierId) : '',
  }));
  take('events', L.events, (r) => ({
    ...r,
    entityId: m(r.entityId),
    ...(r.comparisonId ? { comparisonId: inc.comparisons.has(r.comparisonId) ? m(r.comparisonId) : r.comparisonId } : {}),
    ...(r.documentId ? { documentId: inc.documents.has(r.documentId) ? m(r.documentId) : r.documentId } : {}),
  }));

  // an offer whose shipment/carrier is not part of the upload cannot be stored (foreign keys): report instead of failing half-way
  const blockers = [];
  for (const o of records.offers) {
    if (!isUuid(o.carrierId) || !isUuid(o.shipmentId)) blockers.push({ code: 'offer_missing_parent', id: o.legacyId });
    else if (!records.carriers.some((c) => c.id === o.carrierId) || !records.shipments.some((s) => s.id === o.shipmentId)) blockers.push({ code: 'offer_missing_parent', id: o.legacyId });
  }
  const counts = Object.fromEntries(WRITE_ORDER.map((c) => [c, records[c].length]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { userId, records, idMap, counts, total, skipped, warnings, blockers };
}

const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

/**
 * Uploads a plan. Idempotent (upsert by deterministic id), strictly ordered parents-first, then verified by reading
 * every record back. Local data is never touched here. Returns a report; `report.ok` is true only if every record
 * was read back from the cloud and matches.
 */
export async function runMigration({ plan, client, userId, onProgress = () => {}, batchSize = 50 }) {
  const report = { ok: false, uploaded: 0, verified: 0, total: plan.total, failed: [], mismatched: [], missing: [], files: { uploaded: 0, verified: 0 } };
  if (plan.blockers.length) {
    report.failed.push(...plan.blockers.map((b) => ({ ...b, error: 'blocked' })));
    return report;
  }
  let done = 0;
  const tick = (phase, coll) => onProgress({ phase, coll, done, total: plan.total });
  const check = async (p) => {
    const r = await p;
    if (r?.error) throw new Error(r.error.message ?? String(r.error));
    return r;
  };

  // phase 1: upload (parents first). Documents' files go to Storage before the row that points at them.
  const uploadedDocs = new Map();
  for (const coll of WRITE_ORDER) {
    const recs = plan.records[coll];
    for (let i = 0; i < recs.length; i += batchSize) {
      const part = recs.slice(i, i + batchSize);
      tick('upload', coll);
      try {
        let rows;
        if (coll === 'documents') {
          const prepared = [];
          for (const d of part) {
            let out = d;
            if (hasPendingFile(d)) {
              const path = storagePathFor(userId, d.id, d.file.name);
              const blob = dataUrlToBlob(d.file.dataUrl);
              await check(client.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: d.file.type || blob.type }));
              report.files.uploaded++;
              out = { ...d, file: { name: d.file.name, size: d.file.size, type: d.file.type, storagePath: path } };
            }
            uploadedDocs.set(d.id, out);
            prepared.push(out);
          }
          rows = prepared.map((d) => toRow('documents', d, userId));
        } else rows = part.map((r) => toRow(coll, r, userId));
        await check(client.from(TABLE[coll]).upsert(rows, { onConflict: 'id' }));
        if (coll === 'offers') {
          // offers are uploaded after comparisons (FK order), so link them to their comparison now
          const have = new Set(part.map((o) => o.id));
          for (const c of plan.records.comparisons) {
            const ids = c.offerIds.filter((id) => have.has(id));
            if (ids.length) await check(client.from('offers').update({ comparison_id: c.id }).in('id', ids));
          }
        }
        report.uploaded += part.length;
        done += part.length;
      } catch (e) {
        report.failed.push({ coll, ids: part.map((p) => p.legacyId), error: String(e.message ?? e) });
        tick('error', coll);
        return report; // stop: later tables depend on this one
      }
    }
  }

  // phase 2: verification by reading everything back
  for (const coll of WRITE_ORDER) {
    const recs = plan.records[coll];
    for (let i = 0; i < recs.length; i += batchSize) {
      const part = recs.slice(i, i + batchSize);
      tick('verify', coll);
      let rows;
      try {
        ({ data: rows } = await check(client.from(TABLE[coll]).select('*').in('id', part.map((p) => p.id))));
      } catch (e) {
        report.failed.push({ coll, ids: part.map((p) => p.legacyId), error: `verify: ${e.message ?? e}` });
        return report;
      }
      const got = new Map((rows ?? []).map((r) => [r.id, r]));
      for (const rec of part) {
        const row = got.get(rec.id);
        if (!row) { report.missing.push({ coll, id: rec.legacyId }); continue; }
        const expected = toRow(coll, coll === 'documents' ? uploadedDocs.get(rec.id) : rec, userId);
        if (canon(row.data) !== canon(expected.data) || row.user_id !== userId) report.mismatched.push({ coll, id: rec.legacyId });
        else report.verified++;
      }
    }
  }
  for (const d of uploadedDocs.values()) {
    if (!d.file?.storagePath) continue;
    const folder = d.file.storagePath.split('/').slice(0, -1).join('/');
    const { data } = await client.storage.from(BUCKET).list(folder);
    if ((data ?? []).some((f) => f.name === d.file.storagePath.split('/').pop())) report.files.verified++;
    else report.missing.push({ coll: 'documents-file', id: d.legacyId });
  }
  report.ok = report.verified === plan.total && !report.failed.length && !report.mismatched.length && !report.missing.length;
  tick(report.ok ? 'done' : 'error');
  return report;
}

/** Reads every local collection through the adapter contract (used for the legacy IndexedDB database). */
export async function readLocalData(adapter) {
  const out = {};
  for (const c of WRITE_ORDER) out[c] = await adapter.getAll(c);
  return out;
}

/** Counts of real (non-demo) local records, to decide whether the migration prompt should be shown at all. */
export function countRealRecords(local) {
  const real = (arr) => (arr ?? []).filter((r) => !isDemo(r)).length;
  return real(local.shipments) + real(local.carriers) + real(local.comparisons) + (local.documents ?? []).length;
}
