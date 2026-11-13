import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { activityByWeek, buildAllViews, carrierComparison, carrierHistory, costDynamics, createMemoryAdapter, createRepository, extraCostStructure, filterViews, listRoutes, routeOf, spendByPeriod, spendByRoute } from '../src/index.js';
import { buildJuryScenario } from '../src/seed/jury.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedFile = (n) => JSON.parse(readFileSync(join(here, '..', 'src', 'seed', `${n}.json`), 'utf8'));
const seed = { ...Object.fromEntries(['carriers', 'shipments', 'offers', 'comparisons'].map((n) => [n, seedFile(n)])), juryScenario: buildJuryScenario };
const views = async () => {
  const repo = createRepository(createMemoryAdapter(), seed); await repo.init(); await repo.launchDemo('en');
  const [shipments, carriers, offers, comparisons, settings] = await Promise.all([repo.getShipments(), repo.getCarriers(), repo.getOffers(), repo.getComparisons(), repo.getSettings()]);
  return buildAllViews({ shipments, carriers, offers, comparisons, settings });
};

test('filters: date range, route, carrier are applied together and are inclusive', async () => {
  const vs = await views();
  assert.ok(vs.length >= 2);
  assert.equal(filterViews(vs).length, vs.length);
  const one = vs[0];
  const d = one.comparison.createdAt.slice(0, 10);
  assert.ok(filterViews(vs, { from: d, to: d }).some((v) => v.comparison.id === one.comparison.id), 'inclusive bounds');
  assert.equal(filterViews(vs, { from: '2999-01-01' }).length, 0);
  assert.equal(filterViews(vs, { route: 'Nowhere → Nowhere' }).length, 0);
  assert.ok(filterViews(vs, { route: routeOf(one.shipment) }).every((v) => routeOf(v.shipment) === routeOf(one.shipment)));
  const cid = one.entries[0].offer.carrierId;
  assert.ok(filterViews(vs, { carrierId: cid }).every((v) => v.entries.some((e) => e.offer.carrierId === cid)));
  assert.equal(filterViews(vs, { carrierId: 'car_nope' }).length, 0);
  assert.deepEqual(listRoutes(vs), [...new Set(vs.map((v) => routeOf(v.shipment)))].sort());
});

test('spend numbers equal the sum of engine winners; comparisons without a winner add count but no money', async () => {
  const vs = await views();
  const expected = vs.filter((v) => v.result.bestTotal !== null).reduce((s, v) => s + v.result.bestTotal, 0);
  const byMonth = spendByPeriod(vs, 'month');
  assert.equal(Math.round(byMonth.reduce((s, r) => s + r.total, 0) * 100), Math.round(expected * 100));
  assert.equal(byMonth.reduce((s, r) => s + r.comparisons, 0), vs.length);
  assert.equal(spendByRoute(vs).reduce((s, r) => s + r.comparisons, 0), vs.length);
  assert.equal(costDynamics(vs).length, vs.filter((v) => v.result.bestTotal !== null).length);
  assert.ok(costDynamics(vs).every((p, i, a) => i === 0 || a[i - 1].date <= p.date), 'chronological');
  const weeks = activityByWeek(vs, 52);
  assert.equal(Math.round(weeks.reduce((s, w) => s + w.spend, 0) * 100), Math.round(expected * 100));
  assert.equal(spendByPeriod([], 'month').length, 0);
});

test('extra-cost structure never turns unknown into money; carrier comparison counts honestly', async () => {
  const vs = await views();
  const jury = vs.find((v) => v.comparison.id === 'cmp_jury1');
  const s = extraCostStructure([jury]);
  assert.ok(s.some((r) => r.unknown > 0), 'unknown items are counted');
  const unknownOnly = s.filter((r) => r.money === 0);
  assert.ok(unknownOnly.length > 0, 'a category with only unknowns has zero money');
  const cc = carrierComparison([jury]);
  assert.equal(cc.length, 3);
  const b = cc.find((r) => r.carrier === 'Carrier B');
  assert.equal(b.wins, 1); assert.equal(b.comparable, 1); assert.equal(b.avgQuote, 215000);
  const c = cc.find((r) => r.carrier === 'Carrier C');
  assert.equal(c.wins, 0); assert.equal(c.minQuote, 165000); assert.ok(c.avgUnknown > 0);
  const h = carrierHistory([jury], 'car_jury_a');
  assert.equal(h.length, 1); assert.equal(h[0].comparability, 'partial'); assert.equal(h[0].won, false); assert.equal(h[0].quote, 180000);
});
