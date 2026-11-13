import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SCHEMA_VERSION, carrierSchema, createMemoryAdapter, createRepository, defaultShipmentValues, documentSchema, interactionSchema, RepoError } from '../src/index.js';
import { buildJuryScenario } from '../src/seed/jury.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedFile = (n) => JSON.parse(readFileSync(join(here, '..', 'src', 'seed', `${n}.json`), 'utf8'));
const seed = { ...Object.fromEntries(['carriers', 'shipments', 'offers', 'comparisons'].map((n) => [n, seedFile(n)])), juryScenario: buildJuryScenario };
const fresh = async () => { const repo = createRepository(createMemoryAdapter(), seed); await repo.init(); return repo; };
const shp = (o = {}) => ({ ...defaultShipmentValues(), name: 'Test cargo', origin: 'Almaty', destination: 'Astana', deliveryPoint: 'Astana WH', weightKg: 100, volumeM3: 1, ...o });

test('shipment history: created, field changes, status changes are logged with details', async () => {
  const repo = await fresh();
  const s = await repo.createShipment(shp());
  await repo.updateShipment(s.id, { weightKg: 250, destination: 'Shymkent' });
  await repo.updateShipment(s.id, { status: 'active' });
  await repo.updateShipment(s.id, { weightKg: 250 }); // no real change -> no event
  const ev = await repo.getEvents({ entityType: 'shipment', entityId: s.id });
  assert.deepEqual(ev.map((e) => e.kind).sort(), ['created', 'status', 'updated']);
  assert.deepEqual(ev.find((e) => e.kind === 'updated').fields.sort(), ['destination', 'weightKg']);
  const st = ev.find((e) => e.kind === 'status');
  assert.equal(st.from, 'draft'); assert.equal(st.to, 'active');
});

test('comparison creation and documents appear in the shipment history; deleting the shipment removes them', async () => {
  const repo = await fresh();
  const s = await repo.createShipment(shp());
  const mk = (n) => ({ carrierId: n, carrierName: n, price: 100, currency: 'KZT', endpoint: 'warehouse', costs: {}, additionalCharges: [] });
  const c1 = await repo.getOrCreateCarrierByName('Alpha'); const c2 = await repo.getOrCreateCarrierByName('Beta');
  const cmp = await repo.createComparison({ name: 'X', shipmentId: s.id, offers: [{ ...mk('a'), carrierId: c1.id }, { ...mk('b'), carrierId: c2.id }] });
  const doc = await repo.createDocument({ title: 'Quote Alpha', type: 'quote', shipmentId: s.id, offerId: cmp.offerIds[0], carrierId: c1.id });
  const kinds = (await repo.getEvents({ entityType: 'shipment', entityId: s.id })).map((e) => e.kind);
  assert.ok(kinds.includes('comparison') && kinds.includes('document'));
  await assert.rejects(repo.deleteShipment(s.id), (e) => e.code === 'in_use');
  await repo.deleteComparison(cmp.id);
  assert.equal((await repo.getDocuments({ shipmentId: s.id }))[0].offerId, '', 'deleting the comparison unlinks the offer but keeps the document');
  await repo.deleteShipment(s.id);
  assert.equal((await repo.getDocuments()).filter((d) => d.id === doc.id).length, 0);
  assert.equal((await repo.getEvents({ entityId: s.id })).length, 0);
});

test('documents: link validation, size limit, update, delete, filters', async () => {
  const repo = await fresh();
  const s = await repo.createShipment(shp());
  await assert.rejects(repo.createDocument({ title: 'x', type: 'invoice', shipmentId: 'shp_nope' }), (e) => e instanceof RepoError && e.code === 'not_found');
  await assert.rejects(repo.createDocument({ title: 'x', type: 'invoice', offerId: 'off_nope' }), (e) => e.code === 'not_found');
  await assert.rejects(repo.createDocument({ title: 'big', type: 'contract', file: { name: 'a.pdf', type: 'application/pdf', size: 4 * 1024 * 1024, dataUrl: 'data:' } }), (e) => e.code === 'invalid');
  const d = await repo.createDocument({ title: 'Invoice 1', type: 'invoice', shipmentId: s.id, amount: 5000, currency: 'KZT', file: { name: 'a.pdf', type: 'application/pdf', size: 10, dataUrl: 'data:application/pdf;base64,AAAA' } });
  assert.equal((await repo.getDocuments({ shipmentId: s.id })).length, 1);
  assert.equal((await repo.updateDocument(d.id, { title: 'Invoice 1b' })).title, 'Invoice 1b');
  assert.equal((await repo.getDocuments({ shipmentId: s.id }))[0].file.name, 'a.pdf');
  await repo.deleteDocument(d.id);
  assert.equal((await repo.getDocuments()).length, 0);
  await assert.rejects(repo.updateDocument('doc_nope', {}), (e) => e.code === 'not_found');
});

test('document and interaction validation: no negative amounts, required fields, enums', () => {
  assert.ok(documentSchema.safeParse({ title: 'Quote', type: 'quote', amount: '' }).success);
  assert.ok(!documentSchema.safeParse({ title: 'Quote', type: 'quote', amount: -5 }).success);
  assert.ok(!documentSchema.safeParse({ title: 'Q', type: 'quote' }).success);
  assert.ok(!documentSchema.safeParse({ title: 'Quote', type: 'virus' }).success);
  assert.ok(interactionSchema.safeParse({ channel: 'call', date: '2026-11-01', note: 'Asked about unloading' }).success);
  assert.ok(!interactionSchema.safeParse({ channel: 'telepathy', date: '2026-11-01', note: 'xx' }).success);
  assert.ok(!interactionSchema.safeParse({ channel: 'call', date: '', note: 'xx' }).success);
  const c = carrierSchema.parse({ name: 'Alpha', services: ['pickup', 'customs'], routes: 'Almaty → Astana' });
  assert.deepEqual(c.services, ['pickup', 'customs']);
  assert.ok(!carrierSchema.safeParse({ name: 'Alpha', services: ['teleport'] }).success);
});

test('carrier interaction history: user-entered entries, ordered, removable, and removed with the carrier', async () => {
  const repo = await fresh();
  const c = await repo.createCarrier({ name: 'Gamma Logistics' });
  await repo.addInteraction(c.id, { channel: 'call', date: '2026-11-01', note: 'Asked about last mile' });
  await repo.addInteraction(c.id, { channel: 'email', date: '2026-11-05', note: 'Received revised quote' });
  await repo.updateCarrier(c.id, { routes: 'Almaty → Astana', services: ['pickup'] });
  const ev = await repo.getEvents({ entityType: 'carrier', entityId: c.id });
  assert.equal(ev.filter((e) => e.kind === 'interaction').length, 2);
  const inter = ev.filter((e) => e.kind === 'interaction');
  assert.ok(inter[0].ts > inter[1].ts, 'newest first');
  await repo.removeEvent(inter[0].id);
  assert.equal((await repo.getEvents({ entityType: 'carrier', entityId: c.id })).filter((e) => e.kind === 'interaction').length, 1);
  await assert.rejects(repo.addInteraction('car_nope', { channel: 'call', date: '2026-11-01', note: 'xx' }), (e) => e.code === 'not_found');
  await repo.deleteCarrier(c.id);
  assert.equal((await repo.getEvents({ entityId: c.id })).length, 0);
});

test('migration v1 -> v2 fills new fields, keeps data, and is idempotent', async () => {
  const adapter = createMemoryAdapter();
  await adapter.put('carriers', { id: 'car_old', name: 'Old Carrier', createdAt: '2025-01-01' });
  await adapter.put('shipments', { id: 'shp_old', name: 'Old', createdAt: '2025-01-01', status: 'active' });
  await adapter.setMeta('seeded', true);
  await adapter.setMeta('settings', { language: 'kk' });
  const repo = createRepository(adapter, seed);
  const r = await repo.migrate();
  assert.deepEqual([r.from, r.to, r.changed], [1, SCHEMA_VERSION, 2]);
  const car = await adapter.get('carriers', 'car_old');
  assert.deepEqual([car.routes, car.services, car.name], ['', [], 'Old Carrier']);
  assert.equal((await adapter.get('shipments', 'shp_old')).shipDate, '');
  assert.equal((await adapter.get('shipments', 'shp_old')).status, 'active');
  assert.equal((await repo.migrate()).changed, 0);
  assert.equal((await repo.getSettings()).language, 'kk');
});

test('clearAllData wipes documents and events too', async () => {
  const repo = await fresh();
  const s = await repo.createShipment(shp());
  await repo.createDocument({ title: 'Doc one', type: 'transport', shipmentId: s.id });
  await repo.clearAllData();
  assert.equal((await repo.getDocuments()).length, 0);
  assert.equal((await repo.getEvents()).length, 0);
  assert.equal((await repo.getShipments()).length, 0);
});
