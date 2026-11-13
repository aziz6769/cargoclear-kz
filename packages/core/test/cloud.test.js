import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAllViews, buildMigrationPlan, createCloudAdapter, createMemoryAdapter, createRepository, isUuid, mapId, runMigration, uuidv5 } from '../src/index.js';
import { createFakeSupabase } from '../src/cloud/testing/fakeSupabase.js';

const dataUrl = (text, type = 'text/plain') => `data:${type};base64,${Buffer.from(text).toString('base64')}`;
const offer = (carrierName, price, extra = {}) => ({
  carrierName, price, currency: 'KZT', startLocation: 'A', quoteDate: '2026-01-01', validUntil: '', endpoint: 'warehouse', endpointLabel: '', transportType: 'truck',
  includedServices: '', excludedServices: '', costs: {}, additionalCharges: [], deliveryDays: 2, notes: '', ...extra,
});

function world() {
  const fake = createFakeSupabase();
  const alice = fake._addUser('alice@example.com', 'password1');
  const bob = fake._addUser('bob@example.com', 'password2');
  const device = (user) => {
    fake._setSession(user);
    const cache = createMemoryAdapter();
    const cloud = createCloudAdapter({ client: fake, userId: user.id, cache, flushDelayMs: 1 });
    const repo = createRepository(cloud, null);
    return { cloud, cache, repo };
  };
  return { fake, alice, bob, device };
}
const shipmentData = { name: 'Almaty to Astana', origin: 'Almaty', destination: 'Astana', deliveryPoint: 'WH', weightKg: 1200, volumeM3: 8, category: 'general', packages: 10, status: 'active', cargoDescription: 'tiles' };

async function seedComparison(repo) {
  const s = await repo.createShipment(shipmentData);
  const a = await repo.getOrCreateCarrierByName('Carrier A');
  const b = await repo.getOrCreateCarrierByName('Carrier B');
  const cmp = await repo.createComparison({
    name: 'Cmp 1', shipmentId: s.id,
    offers: [
      { carrierId: a.id, price: 100000, currency: 'KZT', endpoint: 'warehouse', costs: { unloading: { status: 'unknown', amount: null, note: '' } }, deliveryDays: 3, additionalCharges: [] },
      { carrierId: b.id, price: null, currency: 'KZT', endpoint: 'terminal', costs: {}, deliveryDays: null, additionalCharges: [] },
    ],
  });
  return { s, a, b, cmp };
}

test('uuidv5 matches the RFC 4122 reference vector and is deterministic', () => {
  assert.equal(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'), '2ed6657d-e927-568b-95e1-2665a8aea6a2');
  assert.equal(mapId('u1', 'shp_x'), mapId('u1', 'shp_x'));
  assert.notEqual(mapId('u1', 'shp_x'), mapId('u2', 'shp_x'));
  assert.ok(isUuid(mapId('u1', 'shp_x')));
});

test('records written through the repository reach the cloud in dependency order, scoped to the user', async () => {
  const { fake, alice, device } = world();
  const { cloud, repo } = device(alice);
  const { cmp } = await seedComparison(repo);
  assert.ok(cloud.status().pending > 0 && cloud.status().state !== 'synced', 'unsynchronised data is never reported as synced');
  const st = await cloud.settled();
  assert.equal(st.state, 'synced');
  assert.equal(st.pending, 0);
  for (const t of ['shipments', 'carriers', 'comparisons', 'offers', 'events']) assert.ok(fake._rows(t).length > 0, t);
  assert.ok(fake._rows('shipments').every((r) => r.user_id === alice.id));
  const offers = fake._rows('offers');
  assert.equal(offers.length, 2);
  assert.ok(offers.every((o) => o.comparison_id === cmp.id), 'offers are linked to their comparison');
});

test('unknown price stays NULL in the cloud and after a round trip (never 0)', async () => {
  const { fake, alice, device } = world();
  const d1 = device(alice);
  await seedComparison(d1.repo);
  await d1.cloud.settled();
  const priced = fake._rows('offers').map((o) => o.base_price).sort();
  assert.deepEqual(priced, [100000, null]);
  const d2 = device(alice);
  await d2.cloud.pull();
  const offers = await d2.repo.getOffers();
  assert.ok(offers.some((o) => o.price === null));
  assert.ok(!offers.some((o) => o.price === 0));
});

test('a second device sees the same data and the engine computes identical results', async () => {
  const { alice, device } = world();
  const d1 = device(alice);
  await seedComparison(d1.repo);
  await d1.cloud.settled();
  const load = async (repo) => ({ shipments: await repo.getShipments(), carriers: await repo.getCarriers(), offers: await repo.getOffers(), comparisons: await repo.getComparisons(), settings: await repo.getSettings() });
  const d2 = device(alice);
  await d2.cloud.pull();
  const v1 = buildAllViews(await load(d1.repo));
  const v2 = buildAllViews(await load(d2.repo));
  assert.equal(v2.length, 1);
  assert.deepEqual(v2[0].result, v1[0].result);
});

test('user data isolation: another account sees nothing and cannot write under someone else\'s ids', async () => {
  const { alice, bob, device, fake } = world();
  const a = device(alice);
  const { s } = await seedComparison(a.repo);
  await a.cloud.settled();
  const b = device(bob);
  await b.cloud.pull();
  assert.equal((await b.repo.getShipments()).length, 0);
  assert.equal((await b.repo.getOffers()).length, 0);
  // Bob tries to attach a comparison to Alice's shipment: the server refuses it and the change is kept as failed, not lost
  await b.cache.put('carriers', { id: crypto.randomUUID(), name: 'x' }); // local noise
  await b.repo.createCarrier({ name: 'Bob carrier' });
  await b.cloud.put('comparisons', { id: crypto.randomUUID(), name: 'evil', shipmentId: s.id, offerIds: [], createdAt: new Date().toISOString() });
  const st = await b.cloud.settled();
  assert.equal(st.state, 'error');
  assert.match(st.error.message, /foreign key|row-level/);
  assert.equal(fake._rows('comparisons').filter((c) => c.user_id === bob.id).length, 0);
  assert.equal(fake._rows('comparisons').length, 1);
});

test('offline: changes stay queued, are shown as unsynchronised, and are pushed once back online', async () => {
  const { alice, device, fake } = world();
  const d = device(alice);
  fake._state.offline = true;
  const s = await d.repo.createShipment(shipmentData);
  const st = await d.cloud.settled();
  assert.equal(st.state, 'pending');
  assert.ok(st.pending >= 2);
  assert.equal((await d.repo.getShipments()).length, 1, 'still usable offline');
  assert.equal(fake._rows('shipments').length, 0);
  fake._state.offline = false;
  const after = await d.cloud.sync();
  assert.equal(after.state, 'synced');
  assert.equal(fake._rows('shipments')[0].id, s.id);
});

test('a rejected change is not dropped silently: it stays queued as an error, can be retried or discarded', async () => {
  const { alice, device, fake } = world();
  const d = device(alice);
  fake._state.failNext.push({ table: 'shipments', op: 'upsert', error: { message: 'violates check constraint', code: '23514', status: 400 } });
  const s = await d.repo.createShipment(shipmentData);
  let st = await d.cloud.settled();
  assert.equal(st.state, 'error');
  assert.ok((await d.cloud.pendingChanges()).some((c) => c.id === s.id && c.failed));
  await d.cloud.retryFailed();
  st = await d.cloud.settled();
  assert.equal(st.state, 'synced');
  assert.equal(fake._rows('shipments').length, 1);

  // discard: the local version is reverted to the cloud state
  fake._state.failNext.push({ table: 'shipments', op: 'upsert', error: { message: 'violates check constraint', code: '23514', status: 400 } });
  const s2 = await d.repo.createShipment({ ...shipmentData, name: 'Second' });
  await d.cloud.settled();
  const dropped = await d.cloud.discardFailed();
  assert.ok(dropped.some((x) => x.id === s2.id));
  assert.ok(!(await d.repo.getShipments()).some((x) => x.id === s2.id));
});

test('pull never overwrites an unsynchronised local change and propagates deletions from other devices', async () => {
  const { alice, device, fake } = world();
  const d1 = device(alice);
  const s = await d1.repo.createShipment(shipmentData);
  await d1.cloud.settled();
  const d2 = device(alice);
  await d2.cloud.pull();
  fake._state.offline = true;
  await d1.repo.updateShipment(s.id, { name: 'Edited offline' });
  fake._state.offline = false;
  await d1.cloud.pull(); // must not clobber the pending edit
  assert.equal((await d1.repo.getShipment(s.id)).name, 'Edited offline');
  await d1.cloud.sync();
  await d2.cloud.pull();
  assert.equal((await d2.repo.getShipment(s.id)).name, 'Edited offline');
  await d2.repo.deleteShipment(s.id);
  await d2.cloud.settled();
  await d1.cloud.pull();
  assert.equal((await d1.repo.getShipments()).length, 0);
});

test('failed pull keeps the cached data (network error does not empty the app)', async () => {
  const { alice, device, fake } = world();
  const d = device(alice);
  await d.repo.createShipment(shipmentData);
  await d.cloud.settled();
  fake._state.offline = true;
  const r = await d.cloud.pull();
  assert.equal(r.ok, false);
  assert.equal((await d.repo.getShipments()).length, 1);
});

test('expired session: queued changes are kept and reported as an auth problem', async () => {
  const { alice, device, fake } = world();
  const d = device(alice);
  fake._expireSession();
  await d.repo.createShipment(shipmentData);
  const st = await d.cloud.settled();
  assert.equal(st.state, 'auth');
  assert.ok(st.pending > 0);
  fake._setSession(alice);
  assert.equal((await d.cloud.sync()).state, 'synced');
});

test('documents: file goes to the private bucket under <user_id>/..., row has no file bytes, signed URL for the owner only', async () => {
  const { alice, bob, device, fake } = world();
  const d = device(alice);
  const doc = await d.repo.createDocument({ title: 'Invoice', type: 'invoice', file: { name: 'inv 1.txt', size: 5, type: 'text/plain', dataUrl: dataUrl('hello') } });
  await d.cloud.settled();
  const row = fake._rows('documents')[0];
  assert.ok(row.storage_path.startsWith(`${alice.id}/${doc.id}/`));
  assert.equal(row.file_type, 'text/plain');
  assert.ok(!JSON.stringify(row).includes('base64'));
  assert.ok(fake._files.has(row.storage_path));
  const cached = await d.repo.getDocuments();
  assert.equal(cached[0].file.storagePath, row.storage_path);
  assert.equal(cached[0].file.dataUrl, undefined, 'bytes dropped locally once uploaded');
  const url = await d.cloud.signedUrl(row.storage_path);
  assert.match(url, /sign\//);
  assert.ok(!/\/public\//.test(url));
  // another user cannot get a link to Alice's file
  fake._setSession(bob);
  const b = createCloudAdapter({ client: fake, userId: bob.id, cache: createMemoryAdapter() });
  await assert.rejects(b.signedUrl(row.storage_path));
  fake._setSession(alice);
  await d.repo.deleteDocument(doc.id);
  await d.cloud.settled();
  assert.equal(fake._rows('documents').length, 0);
  assert.equal(fake._files.has(row.storage_path), false, 'the object is removed with its record');
});

test('settings: synced to the profile without the device-local assistant endpoint; never written before the cloud state is known', async () => {
  const { alice, device, fake } = world();
  fake._setSession(alice);
  fake._tables.profiles = new Map([[alice.id, { id: alice.id, user_id: alice.id, settings: { currency: 'USD', language: 'kk' } }]]);
  const d = device(alice);
  await d.repo.saveSettings({ company: 'x' }); // before the first pull: local only
  assert.equal((await d.cloud.pendingChanges()).length, 0);
  await d.cloud.pull();
  assert.equal((await d.repo.getSettings()).language, 'kk', 'cloud settings applied');
  await d.repo.saveSettings({ assistantEndpoint: 'https://example.com/ai', language: 'en' });
  await d.cloud.settled();
  const s = fake._rows('profiles')[0].settings;
  assert.equal(s.language, 'en');
  assert.equal(s.assistantEndpoint, undefined);
  assert.equal(fake._rows('profiles')[0].preferred_language, 'en');
});

test('resetDemoData refuses to run without a seed; clearAllData deletes the user\'s cloud rows and files', async () => {
  const { alice, device, fake } = world();
  const d = device(alice);
  await seedComparison(d.repo);
  await d.repo.createDocument({ title: 'f', type: 'quote', file: { name: 'a.txt', size: 1, type: 'text/plain', dataUrl: dataUrl('x') } });
  await d.cloud.settled();
  await assert.rejects(d.repo.resetDemoData(), (e) => e.code === 'invalid');
  assert.ok(fake._rows('shipments').length > 0);
  await d.repo.clearAllData();
  for (const t of ['shipments', 'carriers', 'comparisons', 'offers', 'documents', 'events']) assert.equal(fake._rows(t).length, 0, t);
  assert.equal(fake._rows('shipments').length, 0);
  assert.ok(![...fake._files.keys()].some((k) => k.startsWith(alice.id)));
});

// ---------------------------------------------------------------- IndexedDB -> cloud migration
function localData() {
  const now = '2026-02-01T10:00:00.000Z';
  return {
    carriers: [
      { id: 'car_real', name: 'Real carrier', createdAt: now, isDemo: false },
      { id: 'car_demo', name: 'Demo carrier', createdAt: now, isDemo: true },
    ],
    shipments: [
      { id: 'shp_real', name: 'Real shipment', origin: 'A', destination: 'B', weightKg: 100, volumeM3: 2, status: 'active', createdAt: now, isDemo: false },
      { id: 'shp_demo', name: 'Demo shipment', origin: 'A', destination: 'B', weightKg: 1, volumeM3: 1, createdAt: now, isDemo: true },
    ],
    offers: [
      { id: 'off_1', carrierId: 'car_real', shipmentId: 'shp_real', price: 1000, currency: 'KZT', costs: {}, createdAt: now },
      { id: 'off_2', carrierId: 'car_demo', shipmentId: 'shp_real', price: null, currency: 'KZT', costs: {}, createdAt: now },
      { id: 'off_demo', carrierId: 'car_demo', shipmentId: 'shp_demo', price: 5, currency: 'KZT', costs: {}, createdAt: now, isDemo: true },
      { id: 'off_orphan', carrierId: 'car_real', shipmentId: 'shp_real', price: 7, currency: 'KZT', costs: {}, createdAt: now },
    ],
    comparisons: [
      { id: 'cmp_real', name: 'Real cmp', shipmentId: 'shp_real', offerIds: ['off_1', 'off_2'], createdAt: now, updatedAt: now, isDemo: false },
      { id: 'cmp_demo', name: 'Demo cmp', shipmentId: 'shp_demo', offerIds: ['off_demo'], createdAt: now, updatedAt: now, isDemo: true },
    ],
    documents: [
      { id: 'doc_1', title: 'Real doc', type: 'invoice', shipmentId: 'shp_real', offerId: '', carrierId: '', createdAt: now, file: { name: 'a.txt', size: 3, type: 'text/plain', dataUrl: dataUrl('abc') } },
      { id: 'doc_demo', title: 'Demo doc', type: 'quote', shipmentId: 'shp_demo', offerId: '', carrierId: '', createdAt: now, file: null },
    ],
    events: [
      { id: 'evt_1', ts: now, entityType: 'shipment', entityId: 'shp_real', kind: 'created' },
      { id: 'evt_2', ts: now, entityType: 'shipment', entityId: 'shp_real', kind: 'comparison', comparisonId: 'cmp_real', name: 'Real cmp' },
      { id: 'evt_d', ts: now, entityType: 'shipment', entityId: 'shp_demo', kind: 'created' },
    ],
  };
}

test('migration plan: demo data is never included, ids are remapped deterministically, references stay consistent', () => {
  const u = '11111111-1111-4111-8111-111111111111';
  const plan = buildMigrationPlan(localData(), u);
  const ids = (c) => plan.records[c].map((r) => r.legacyId).sort();
  assert.deepEqual(ids('shipments'), ['shp_real']);
  assert.deepEqual(ids('comparisons'), ['cmp_real']);
  assert.deepEqual(ids('offers'), ['off_1', 'off_2']);
  assert.deepEqual(ids('carriers'), ['car_demo', 'car_real'], 'a demo carrier that a real offer uses is included and reported');
  assert.ok(plan.warnings.some((w) => w.code === 'demo_dependency' && w.id === 'car_demo'));
  assert.deepEqual(ids('documents'), ['doc_1']);
  assert.deepEqual(ids('events'), ['evt_1', 'evt_2']);
  assert.equal(plan.skipped.orphanOffers, 1);
  assert.ok(plan.skipped.demo >= 4);
  const cmp = plan.records.comparisons[0];
  assert.equal(cmp.shipmentId, plan.records.shipments[0].id);
  assert.deepEqual(cmp.offerIds, plan.records.offers.map((o) => o.id));
  assert.equal(plan.records.events[1].comparisonId, cmp.id);
  assert.ok(Object.values(plan.records).flat().every((r) => isUuid(r.id)));
  assert.deepEqual(buildMigrationPlan(localData(), u).records.shipments[0].id, plan.records.shipments[0].id, 'same ids on retry');
  assert.equal(plan.blockers.length, 0);
});

test('migration uploads in order, verifies every record, is idempotent on retry and never touches local data', async () => {
  const { alice, fake } = world();
  fake._setSession(alice);
  const local = localData();
  const snapshot = JSON.stringify(local);
  const plan = buildMigrationPlan(local, alice.id);
  const seen = [];
  const report = await runMigration({ plan, client: fake, userId: alice.id, onProgress: (p) => seen.push(p.phase) });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.verified, plan.total);
  assert.equal(report.files.uploaded, 1);
  assert.equal(report.files.verified, 1);
  assert.ok(seen.includes('upload') && seen.includes('verify') && seen.at(-1) === 'done');
  assert.equal(JSON.stringify(local), snapshot, 'local records are untouched');
  const counts = () => Object.fromEntries(['shipments', 'carriers', 'comparisons', 'offers', 'documents', 'events'].map((t) => [t, fake._rows(t).length]));
  const first = counts();
  assert.deepEqual(first, { shipments: 1, carriers: 2, comparisons: 1, offers: 2, documents: 1, events: 2 });
  assert.equal(fake._rows('offers').filter((o) => o.base_price === null).length, 1);
  assert.ok(fake._rows('offers').every((o) => o.comparison_id));
  const again = await runMigration({ plan: buildMigrationPlan(local, alice.id), client: fake, userId: alice.id });
  assert.equal(again.ok, true);
  assert.deepEqual(counts(), first, 'no duplicates after a retry');
  // the migrated data is what a device sees after login
  const cloud = createCloudAdapter({ client: fake, userId: alice.id, cache: createMemoryAdapter() });
  await cloud.pull();
  const repo = createRepository(cloud, null);
  const views = buildAllViews({ shipments: await repo.getShipments(), carriers: await repo.getCarriers(), offers: await repo.getOffers(), comparisons: await repo.getComparisons(), settings: await repo.getSettings() });
  assert.equal(views.length, 1);
});

test('migration failure mid-way is reported, stops, and can be retried to completion', async () => {
  const { alice, fake } = world();
  fake._setSession(alice);
  const plan = buildMigrationPlan(localData(), alice.id);
  fake._state.failNext.push({ table: 'offers', op: 'upsert', error: { message: 'Failed to fetch', status: 0 } });
  const bad = await runMigration({ plan, client: fake, userId: alice.id });
  assert.equal(bad.ok, false);
  assert.equal(bad.failed[0].coll, 'offers');
  assert.equal(fake._rows('comparisons').length, 1, 'parents already uploaded are kept; children are not half-written');
  const good = await runMigration({ plan, client: fake, userId: alice.id });
  assert.equal(good.ok, true);
});

test('migration verification detects a record that is missing or different in the cloud', async () => {
  const { alice, fake } = world();
  fake._setSession(alice);
  const plan = buildMigrationPlan(localData(), alice.id);
  const realFrom = fake.from.bind(fake);
  fake.from = (t) => {
    const b = realFrom(t);
    if (t === 'shipments') {
      const origThen = b.then.bind(b);
      b.then = (res, rej) => origThen((r) => (r?.data ? { ...r, data: [] } : r)).then(res, rej);
    }
    return b;
  };
  const rep = await runMigration({ plan, client: fake, userId: alice.id });
  assert.equal(rep.ok, false);
  assert.ok(rep.missing.some((m) => m.coll === 'shipments'));
});

test('a plan with an offer whose parent is not part of the upload is blocked instead of half-uploaded', () => {
  const local = localData();
  local.offers.push({ id: 'off_bad', carrierId: 'car_missing', shipmentId: 'shp_real', price: 1, currency: 'KZT', costs: {}, createdAt: 'x' });
  local.comparisons[0].offerIds.push('off_bad');
  const plan = buildMigrationPlan(local, '11111111-1111-4111-8111-111111111111');
  assert.ok(plan.blockers.length > 0);
});
