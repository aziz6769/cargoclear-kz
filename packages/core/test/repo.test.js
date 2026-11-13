import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createRepository, createMemoryAdapter, RepoError, comparisonFormSchema, defaultShipmentValues,
  defaultOfferValues, formToOffer, offerToForm, offerFormSchema,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const seed = Object.fromEntries(
  ['carriers', 'shipments', 'offers', 'comparisons'].map((n) => [n, JSON.parse(readFileSync(join(here, '..', 'src', 'seed', `${n}.json`), 'utf8'))]),
);
const fresh = async () => {
  const repo = createRepository(createMemoryAdapter(), seed);
  await repo.init();
  return repo;
};

test('init seeds once and is idempotent', async () => {
  const repo = await fresh();
  assert.equal((await repo.getShipments()).length, 10);
  await repo.deleteComparison('cmp_demo5');
  await repo.init();
  assert.equal((await repo.getComparisons()).length, 4); // not re-seeded
});

test('delete comparison removes its offers', async () => {
  const repo = await fresh();
  await repo.deleteComparison('cmp_demo1');
  const ids = (await repo.getOffers()).map((o) => o.id);
  assert.ok(!ids.includes('off_demo01'));
  assert.equal(ids.length, 12);
});

test('duplicate comparison clones offers with new ids', async () => {
  const repo = await fresh();
  const copy = await repo.duplicateComparison('cmp_demo4', ' (копия)');
  assert.notEqual(copy.id, 'cmp_demo4');
  assert.equal(copy.name, 'Бытовая техника в Алматы (копия)');
  assert.equal((await repo.getOffers()).length, 18);
  assert.ok(copy.offerIds.every((id) => !['off_demo10', 'off_demo11', 'off_demo12'].includes(id)));
});

test('update comparison replaces offers and drops removed ones', async () => {
  const repo = await fresh();
  const all = await repo.getOffers();
  const keep = all.filter((o) => ['off_demo10', 'off_demo11'].includes(o.id));
  const updated = await repo.updateComparison('cmp_demo4', { name: 'X', offers: keep });
  assert.deepEqual(updated.offerIds.sort(), ['off_demo10', 'off_demo11']);
  assert.ok(!(await repo.getOffers()).some((o) => o.id === 'off_demo12'));
});

test('referential guards', async () => {
  const repo = await fresh();
  await assert.rejects(repo.deleteShipment('shp_demo01'), (e) => e instanceof RepoError && e.code === 'in_use');
  await assert.rejects(repo.deleteCarrier('car_demo1'), (e) => e.code === 'in_use');
  await repo.deleteShipment('shp_demo10'); // no comparison -> ok
  await assert.rejects(repo.getComparison('nope'), (e) => e.code === 'not_found');
  await assert.rejects(repo.createComparison({ name: 'x', shipmentId: 'shp_demo01', offers: [{}] }), (e) => e.code === 'invalid');
});

test('settings persist and merge with defaults', async () => {
  const repo = await fresh();
  await repo.saveSettings({ language: 'kk', rates: { USD: 500 } });
  const s = await repo.getSettings();
  assert.equal(s.language, 'kk');
  assert.equal(s.rates.USD, 500);
  assert.equal(s.rates.EUR, null);
  assert.equal(s.currency, 'KZT');
});

test('reset demo data restores seed but keeps settings', async () => {
  const repo = await fresh();
  await repo.saveSettings({ language: 'en' });
  await repo.clearAllData();
  assert.equal((await repo.getShipments()).length, 0);
  await repo.init();
  assert.equal((await repo.getShipments()).length, 0); // explicit wipe is respected
  await repo.resetDemoData();
  assert.equal((await repo.getShipments()).length, 10);
  assert.equal((await repo.getSettings()).language, 'en');
});

test('form schema: validation keys and offer round trip', () => {
  const bad = comparisonFormSchema.safeParse({ name: '', shipment: defaultShipmentValues(), offers: [] });
  assert.equal(bad.success, false);
  const msgs = bad.error.issues.map((i) => i.message);
  assert.ok(msgs.includes('v.min2') && msgs.includes('v.required') && msgs.includes('v.minOffers'));

  const orig = seed.offers.find((o) => o.id === 'off_demo14');
  const form = offerToForm(orig, seed.carriers.find((c) => c.id === orig.carrierId));
  const parsed = offerFormSchema.parse(form);
  const back = formToOffer(parsed, orig.carrierId);
  assert.equal(back.price, 120000);
  assert.deepEqual(back.costs.storage, { status: 'excluded', amount: 4000 });
  assert.deepEqual(back.costs.lastMile, { status: 'excluded', amount: null });
  assert.deepEqual(back.excludedServices, ['Доставка со станции']);
});

test('blank price stays null (never coerced to 0)', () => {
  const p = offerFormSchema.parse({ ...defaultOfferValues(), carrierName: 'Test', price: '' });
  assert.equal(p.price, null);
  const c = offerFormSchema.parse({ ...defaultOfferValues(), carrierName: 'Test', price: '100', costs: { ...defaultOfferValues().costs, loading: { status: 'charged', amount: '' } } });
  assert.equal(c.costs.loading.amount, null);
});
