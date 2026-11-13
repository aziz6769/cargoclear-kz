import { DEFAULT_SETTINGS } from '../constants.js';

export class RepoError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code; // not_found | in_use | invalid
  }
}

export const uid = (prefix) => {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `${prefix}_${raw.replace(/-/g, '').slice(0, 12)}`;
};

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

  async function init() {
    if (await adapter.getMeta('seeded')) return;
    await seedData();
    if (!(await adapter.getMeta('settings'))) await adapter.setMeta('settings', DEFAULT_SETTINGS);
    await adapter.setMeta('seeded', true);
  }

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
    const s = { ...data, id: uid('shp'), createdAt: nowIso(), isDemo: false };
    await adapter.put('shipments', s);
    return s;
  }
  async function updateShipment(id, patch) {
    const s = { ...(await getShipment(id)), ...patch, id };
    await adapter.put('shipments', s);
    return s;
  }
  async function deleteShipment(id) {
    const used = (await adapter.getAll('comparisons')).some((c) => c.shipmentId === id);
    if (used) throw new RepoError('in_use', 'shipment is used by a comparison');
    await adapter.remove('shipments', id);
  }

  // ---------- carriers ----------
  async function getCarriers() {
    return (await adapter.getAll('carriers')).sort((a, b) => a.name.localeCompare(b.name));
  }
  async function createCarrier(data) {
    const c = { contactName: '', phone: '', email: '', notes: '', ...data, id: uid('car'), createdAt: nowIso(), isDemo: false };
    await adapter.put('carriers', c);
    return c;
  }
  async function updateCarrier(id, patch) {
    const cur = await adapter.get('carriers', id);
    if (!cur) throw new RepoError('not_found', `carrier ${id}`);
    const c = { ...cur, ...patch, id };
    await adapter.put('carriers', c);
    return c;
  }
  async function deleteCarrier(id) {
    const used = (await adapter.getAll('offers')).some((o) => o.carrierId === id);
    if (used) throw new RepoError('in_use', 'carrier has offers');
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
    await adapter.remove('comparisons', id);
  }

  // ---------- maintenance ----------
  async function resetDemoData() {
    const settings = await getSettings();
    await adapter.clearAll();
    await seedData();
    await adapter.setMeta('settings', settings);
    await adapter.setMeta('seeded', true);
  }
  async function clearAllData() {
    const settings = await getSettings();
    await adapter.clearAll();
    await adapter.setMeta('settings', settings);
    await adapter.setMeta('seeded', true); // do not re-seed after an explicit wipe
  }

  return {
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
    clearAllData,
  };
}
