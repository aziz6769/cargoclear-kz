import { DEFAULT_SETTINGS, DOCUMENT_MAX_BYTES, SCHEMA_VERSION } from '../constants.js';
import { uuidv4 } from '../cloud/ids.js';

export class RepoError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code; // not_found | in_use | invalid
  }
}

// New records get real UUIDs (the cloud schema uses uuid primary keys). The prefix argument is kept for call-site readability.
export const uid = (_prefix) => uuidv4();

const nowIso = () => new Date().toISOString();
const byDateDesc = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

const COLLECTIONS = ['carriers', 'shipments', 'offers', 'comparisons'];

/**
 * Data access layer. The UI only talks to this object, never to the storage adapter,
 * so a REST implementation with the same method names can replace it later.
 */
export function createRepository(adapter, seed = null) {
  async function seedData() {
    if (!seed) return;
    for (const c of COLLECTIONS) await adapter.bulkPut(c, seed[c] ?? []);
  }

  /**
   * Forward-only, idempotent data migrations. v1 -> v2 adds default values for the fields introduced in
   * Phase 3 (carrier routes/services, shipment shipDate); the new stores simply start empty.
   */
  async function migrate() {
    const from = (await adapter.getMeta('schemaVersion')) ?? 1;
    if (from >= SCHEMA_VERSION) return { from, to: from, changed: 0 };
    let changed = 0;
    for (const c of await adapter.getAll('carriers')) {
      if (c.routes === undefined || !Array.isArray(c.services)) {
        await adapter.put('carriers', { ...c, routes: c.routes ?? '', services: Array.isArray(c.services) ? c.services : [] });
        changed++;
      }
    }
    for (const s of await adapter.getAll('shipments')) {
      if (s.shipDate === undefined) {
        await adapter.put('shipments', { ...s, shipDate: '' });
        changed++;
      }
    }
    await adapter.setMeta('schemaVersion', SCHEMA_VERSION);
    return { from, to: SCHEMA_VERSION, changed };
  }

  async function init() {
    if (!(await adapter.getMeta('seeded'))) {
      await seedData();
      if (!(await adapter.getMeta('settings'))) await adapter.setMeta('settings', DEFAULT_SETTINGS);
      await adapter.setMeta('seeded', true);
    }
    await migrate();
  }

  // ---------- change history (events) ----------
  // One append-only log used for shipment history and carrier interaction history.
  async function logEvent(entityType, entityId, kind, payload = {}) {
    const e = { id: uid('evt'), ts: nowIso(), createdAt: nowIso(), entityType, entityId, kind, ...payload };
    await adapter.put('events', e);
    return e;
  }
  async function getEvents({ entityType, entityId } = {}) {
    let all = await adapter.getAll('events');
    if (entityType) all = all.filter((e) => e.entityType === entityType);
    if (entityId) all = all.filter((e) => e.entityId === entityId);
    return all.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  }
  async function dropEvents(entityType, entityId) {
    for (const e of await getEvents({ entityType, entityId })) await adapter.remove('events', e.id);
  }
  const TRACKED = ['name', 'origin', 'destination', 'originCountry', 'destinationCountry', 'cargoDescription', 'requiredDate', 'shipDate', 'deliveryPoint', 'weightKg', 'volumeM3', 'category', 'packages', 'requirements', 'deliveryLevel', 'storageDays', 'insuranceRequired', 'customsRequired', 'specialHandling'];
  const same = (a, b) => String(a ?? '') === String(b ?? '');

  // ---------- settings ----------
  async function getSettings() {
    const s = (await adapter.getMeta('settings')) ?? {};
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      rates: { ...DEFAULT_SETTINGS.rates, ...(s.rates ?? {}) },
      notifications: { ...DEFAULT_SETTINGS.notifications, ...(s.notifications ?? {}) },
      profile: { ...DEFAULT_SETTINGS.profile, ...(s.profile ?? {}) },
      business: { ...DEFAULT_SETTINGS.business, ...(s.business ?? {}) },
    };
  }
  async function saveSettings(patch) {
    const next = { ...(await getSettings()), ...patch };
    await adapter.setMeta('settings', next);
    return next;
  }

  // ---------- shipments ----------
  async function getShipments() {
    return (await adapter.getAll('shipments')).sort(byDateDesc);
  }
  async function getShipment(id) {
    const s = await adapter.get('shipments', id);
    if (!s) throw new RepoError('not_found', `shipment ${id}`);
    return s;
  }
  async function createShipment(data) {
    const s = { shipDate: '', ...data, id: uid('shp'), createdAt: nowIso(), isDemo: false };
    await adapter.put('shipments', s);
    await logEvent('shipment', s.id, 'created', { status: s.status ?? 'draft' });
    return s;
  }
  async function updateShipment(id, patch) {
    const before = await getShipment(id);
    const s = { ...before, ...patch, id };
    await adapter.put('shipments', s);
    if (patch.status !== undefined && !same(before.status, s.status)) await logEvent('shipment', id, 'status', { from: before.status ?? 'draft', to: s.status });
    const fields = TRACKED.filter((k) => k in patch && !same(before[k], s[k]));
    if (fields.length) await logEvent('shipment', id, 'updated', { fields });
    return s;
  }
  async function deleteShipment(id) {
    const used = (await adapter.getAll('comparisons')).some((c) => c.shipmentId === id);
    if (used) throw new RepoError('in_use', 'shipment is used by a comparison');
    for (const d of await adapter.getAll('documents')) if (d.shipmentId === id) await adapter.remove('documents', d.id);
    await dropEvents('shipment', id);
    await adapter.remove('shipments', id);
  }

  // ---------- carriers ----------
  async function getCarriers() {
    return (await adapter.getAll('carriers')).sort((a, b) => a.name.localeCompare(b.name));
  }
  async function createCarrier(data) {
    const c = { contactName: '', phone: '', email: '', notes: '', routes: '', services: [], ...data, id: uid('car'), createdAt: nowIso(), isDemo: false };
    await adapter.put('carriers', c);
    await logEvent('carrier', c.id, 'created');
    return c;
  }
  async function updateCarrier(id, patch) {
    const cur = await adapter.get('carriers', id);
    if (!cur) throw new RepoError('not_found', `carrier ${id}`);
    const c = { ...cur, ...patch, id };
    await adapter.put('carriers', c);
    const fields = ['name', 'contactName', 'phone', 'email', 'notes', 'routes', 'services'].filter((k) => k in patch && JSON.stringify(cur[k] ?? '') !== JSON.stringify(c[k] ?? ''));
    if (fields.length) await logEvent('carrier', id, 'updated', { fields });
    return c;
  }
  async function deleteCarrier(id) {
    const used = (await adapter.getAll('offers')).some((o) => o.carrierId === id);
    if (used) throw new RepoError('in_use', 'carrier has offers');
    for (const d of await adapter.getAll('documents')) if (d.carrierId === id) await adapter.put('documents', { ...d, carrierId: '' });
    await dropEvents('carrier', id);
    await adapter.remove('carriers', id);
  }
  async function getOrCreateCarrierByName(name) {
    const n = name.trim();
    const found = (await adapter.getAll('carriers')).find((c) => c.name.trim().toLowerCase() === n.toLowerCase());
    return found ?? createCarrier({ name: n });
  }

  // ---------- offers ----------
  async function getOffers({ carrierId, shipmentId } = {}) {
    let all = await adapter.getAll('offers');
    if (carrierId) all = all.filter((o) => o.carrierId === carrierId);
    if (shipmentId) all = all.filter((o) => o.shipmentId === shipmentId);
    return all.sort(byDateDesc);
  }

  // ---------- comparisons ----------
  async function getComparisons() {
    return (await adapter.getAll('comparisons')).sort(byDateDesc);
  }
  async function getComparison(id) {
    const c = await adapter.get('comparisons', id);
    if (!c) throw new RepoError('not_found', `comparison ${id}`);
    return c;
  }

  async function saveOffers(offers, shipmentId, createdAt) {
    const ids = [];
    for (const o of offers) {
      const id = o.id ?? uid('off');
      const existing = o.id ? await adapter.get('offers', o.id) : null;
      await adapter.put('offers', { ...o, id, shipmentId, createdAt: existing?.createdAt ?? createdAt });
      ids.push(id);
    }
    return ids;
  }

  async function createComparison({ name, shipmentId, notes = '', offers = [] }) {
    await getShipment(shipmentId);
    if (offers.length < 2) throw new RepoError('invalid', 'at least two offers are required');
    const createdAt = nowIso();
    const offerIds = await saveOffers(offers, shipmentId, createdAt);
    const comparison = { id: uid('cmp'), name, shipmentId, notes, offerIds, createdAt, updatedAt: createdAt, isDemo: false };
    await adapter.put('comparisons', comparison);
    await logEvent('shipment', shipmentId, 'comparison', { comparisonId: comparison.id, name });
    return comparison;
  }

  async function updateComparison(id, { name, shipmentId, notes, offers }) {
    const cur = await getComparison(id);
    const sid = shipmentId ?? cur.shipmentId;
    await getShipment(sid);
    let offerIds = cur.offerIds;
    if (offers) {
      if (offers.length < 2) throw new RepoError('invalid', 'at least two offers are required');
      offerIds = await saveOffers(offers, sid, nowIso());
      for (const old of cur.offerIds) if (!offerIds.includes(old)) await adapter.remove('offers', old);
    }
    const next = { ...cur, name: name ?? cur.name, notes: notes ?? cur.notes, shipmentId: sid, offerIds, updatedAt: nowIso() };
    await adapter.put('comparisons', next);
    return next;
  }

  async function duplicateComparison(id, suffix = ' (copy)') {
    const cur = await getComparison(id);
    const offers = [];
    for (const oid of cur.offerIds) {
      const o = await adapter.get('offers', oid);
      if (o) {
        const { id: _drop, ...rest } = o;
        offers.push(rest);
      }
    }
    return createComparison({ name: `${cur.name}${suffix}`, shipmentId: cur.shipmentId, notes: cur.notes, offers });
  }

  async function deleteComparison(id) {
    const cur = await getComparison(id);
    for (const oid of cur.offerIds) await adapter.remove('offers', oid);
    for (const d of await adapter.getAll('documents')) if (cur.offerIds.includes(d.offerId)) await adapter.put('documents', { ...d, offerId: '' });
    await adapter.remove('comparisons', id);
  }

  // ---------- documents (metadata + optional small local file; no recognition of contents) ----------
  async function getDocuments({ shipmentId, offerId, carrierId } = {}) {
    let all = await adapter.getAll('documents');
    if (shipmentId) all = all.filter((d) => d.shipmentId === shipmentId);
    if (offerId) all = all.filter((d) => d.offerId === offerId);
    if (carrierId) all = all.filter((d) => d.carrierId === carrierId);
    return all.sort(byDateDesc);
  }
  async function checkDocLinks(d) {
    if (d.shipmentId) await getShipment(d.shipmentId);
    if (d.offerId && !(await adapter.get('offers', d.offerId))) throw new RepoError('not_found', `offer ${d.offerId}`);
    if (d.carrierId && !(await adapter.get('carriers', d.carrierId))) throw new RepoError('not_found', `carrier ${d.carrierId}`);
    if (d.file && (typeof d.file.dataUrl !== 'string' || d.file.size > DOCUMENT_MAX_BYTES)) throw new RepoError('invalid', 'file too large');
  }
  async function createDocument(data) {
    const d = { file: null, ...data, id: uid('doc'), createdAt: nowIso() };
    await checkDocLinks(d);
    await adapter.put('documents', d);
    if (d.shipmentId) await logEvent('shipment', d.shipmentId, 'document', { documentId: d.id, title: d.title });
    return d;
  }
  async function updateDocument(id, patch) {
    const cur = await adapter.get('documents', id);
    if (!cur) throw new RepoError('not_found', `document ${id}`);
    const d = { ...cur, ...patch, id };
    await checkDocLinks(d);
    await adapter.put('documents', d);
    return d;
  }
  async function deleteDocument(id) {
    await adapter.remove('documents', id);
  }

  // ---------- carrier interaction history (entered by the user, never auto-generated) ----------
  async function addInteraction(carrierId, { channel, date, note }) {
    if (!(await adapter.get('carriers', carrierId))) throw new RepoError('not_found', `carrier ${carrierId}`);
    return logEvent('carrier', carrierId, 'interaction', { channel, note, ts: new Date(date).toString() === 'Invalid Date' ? nowIso() : new Date(date).toISOString() });
  }
  async function removeEvent(id) {
    await adapter.remove('events', id);
  }

  // ---------- jury demo scenario ----------
  // Rebuilds ONLY the records of the fixed demo scenario (known ids). Everything else is untouched,
  // so launching or resetting the demo can never overwrite user-created data.
  async function launchDemo(lang = 'ru') {
    if (!seed?.juryScenario) throw new RepoError('invalid', 'no demo scenario available');
    const scenario = seed.juryScenario(lang);
    for (const o of scenario.offers) await adapter.remove('offers', o.id);
    for (const c of COLLECTIONS) await adapter.bulkPut(c, scenario[c] ?? []);
    return scenario.comparisons[0].id;
  }

  // ---------- maintenance ----------
  async function resetDemoData() {
    if (!seed) throw new RepoError('invalid', 'no demo seed in this workspace'); // never wipe a workspace that has nothing to restore
    const settings = await getSettings();
    await adapter.clearAll();
    await seedData();
    await adapter.setMeta('settings', settings);
    await adapter.setMeta('seeded', true);
  }
  async function clearAllData() {
    const settings = await getSettings();
    await adapter.clearAll();
    await adapter.setMeta('assistant.history', []);
    await adapter.setMeta('settings', settings);
    await adapter.setMeta('seeded', true); // do not re-seed after an explicit wipe
  }

  // ---------- assistant conversation (kept locally, structured so it re-renders in any language) ----------
  const HISTORY_LIMIT = 80;
  async function getAssistantHistory() {
    return (await adapter.getMeta('assistant.history')) ?? [];
  }
  async function appendAssistantMessages(msgs) {
    const next = [...(await getAssistantHistory()), ...msgs].slice(-HISTORY_LIMIT);
    await adapter.setMeta('assistant.history', next);
    return next;
  }
  async function clearAssistantHistory() {
    await adapter.setMeta('assistant.history', []);
  }

  return {
    migrate,
    getEvents,
    getDocuments,
    createDocument,
    updateDocument,
    deleteDocument,
    addInteraction,
    removeEvent,
    getAssistantHistory,
    appendAssistantMessages,
    clearAssistantHistory,
    init,
    getSettings,
    saveSettings,
    getShipments,
    getShipment,
    createShipment,
    updateShipment,
    deleteShipment,
    getCarriers,
    createCarrier,
    updateCarrier,
    deleteCarrier,
    getOrCreateCarrierByName,
    getOffers,
    getComparisons,
    getComparison,
    createComparison,
    updateComparison,
    duplicateComparison,
    deleteComparison,
    resetDemoData,
    launchDemo,
    clearAllData,
  };
}
