import { isUuid } from './ids.js';

/**
 * Domain record <-> database row. The full domain record is kept in `data` (canonical for the engine);
 * the typed columns are a projection. Empty strings used by the domain for "no link" become NULL.
 */
export const COLLECTIONS = ['carriers', 'shipments', 'offers', 'comparisons', 'documents', 'events'];
/** Parents before children (used for writes); deletes run in the reverse order. */
export const WRITE_ORDER = ['carriers', 'shipments', 'comparisons', 'offers', 'documents', 'events'];
/** Children before parents (used for reads, so a pulled child never refers to a parent that was fetched earlier and is missing). */
export const READ_ORDER = ['documents', 'events', 'comparisons', 'offers', 'shipments', 'carriers'];
export const TABLE = { carriers: 'carriers', shipments: 'shipments', offers: 'offers', comparisons: 'comparisons', documents: 'documents', events: 'events' };

const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const int = (v) => (num(v) === null ? null : Math.trunc(num(v)));
const fk = (v) => (isUuid(v) ? v : null);
const str = (v, max = 100000) => String(v ?? '').slice(0, max);
const ts = (v, fallback) => {
  const d = new Date(v);
  return v && !Number.isNaN(d.getTime()) ? d.toISOString() : fallback;
};

function stripFile(file) {
  if (!file) return file ?? null;
  const { dataUrl: _omit, ...rest } = file;
  return rest;
}

export function toRow(coll, rec, userId) {
  if (!isUuid(rec.id)) throw new Error(`${coll}: id "${rec.id}" is not a UUID`);
  const base = { id: rec.id, user_id: userId };
  const created = ts(rec.createdAt ?? rec.ts, undefined);
  const withTs = created ? { created_at: created } : {};
  switch (coll) {
    case 'shipments':
      return { ...base, ...withTs, title: str(rec.name, 300), origin: str(rec.origin), destination: str(rec.destination), cargo_description: str(rec.cargoDescription), cargo_weight: num(rec.weightKg), cargo_volume: num(rec.volumeM3), currency: str(rec.currency || 'KZT', 3), status: str(rec.status || 'draft', 32), data: rec };
    case 'carriers':
      return { ...base, ...withTs, name: str(rec.name, 200), contact_person: str(rec.contactName), phone: str(rec.phone), email: str(rec.email), website: str(rec.website), notes: str(rec.notes), data: rec };
    case 'comparisons':
      return { ...base, ...withTs, shipment_id: rec.shipmentId, title: str(rec.name, 300), status: 'active', data: rec };
    case 'offers':
      // base_price stays NULL when the carrier did not quote: an unknown amount is never stored as 0.
      return { ...base, ...withTs, shipment_id: rec.shipmentId, carrier_id: rec.carrierId, base_price: num(rec.price), currency: str(rec.currency || 'KZT', 3), delivery_endpoint: str(rec.endpoint, 32), estimated_delivery: int(rec.deliveryDays), cost_breakdown: rec.costs ?? {}, data: rec };
    case 'documents': {
      const file = stripFile(rec.file);
      return { ...base, ...withTs, shipment_id: fk(rec.shipmentId), offer_id: fk(rec.offerId), carrier_id: fk(rec.carrierId), title: str(rec.title, 300), doc_type: str(rec.type || 'quote', 32), file_name: file?.name ?? null, storage_path: file?.storagePath ?? null, file_type: file?.type ?? null, file_size: file ? int(file.size) : null, data: { ...rec, file } };
    }
    case 'events': {
      const { id: _i, ts: t, createdAt: _c, entityType, entityId, kind, ...payload } = rec;
      return { ...base, created_at: ts(t ?? rec.createdAt, new Date().toISOString()), shipment_id: entityType === 'shipment' ? fk(entityId) : null, entity_type: str(entityType, 32), entity_id: fk(entityId), event_type: str(kind, 64), description: str(payload.note ?? payload.title ?? payload.name ?? '', 1000), metadata: payload, data: rec };
    }
    default:
      throw new Error(`unknown collection ${coll}`);
  }
}

export function fromRow(coll, row) {
  const d = row.data && typeof row.data === 'object' ? row.data : {};
  const rec = { ...d, id: row.id };
  if (coll === 'events') rec.ts = d.ts ?? row.created_at;
  rec.createdAt = d.createdAt ?? row.created_at;
  return rec;
}

/** Whether a cached document still holds its file only locally (not yet uploaded). */
export const hasPendingFile = (rec) => !!rec?.file?.dataUrl;

/** Business settings that may live in the cloud profile. The assistant endpoint is a per-device choice and stays local. */
export function cloudSettings(settings = {}) {
  const { assistantEndpoint: _local, ...rest } = settings;
  return rest;
}
