import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  analyzeOffer,
  compareAnalyses,
  buildQuestions,
  buildComparisonView,
  dashboardStats,
  emptyCosts,
  pct,
  DEFAULT_SETTINGS,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedFile = (n) => JSON.parse(readFileSync(join(here, '..', 'src', 'seed', `${n}.json`), 'utf8'));

const shipment = { deliveryLevel: 'warehouse', storageDays: 0, insuranceRequired: false, customsRequired: false, specialHandling: false };
const inc = { status: 'included', amount: null };
const ch = (n) => ({ status: 'charged', amount: n });
const mk = (over = {}) => ({
  id: 'o', carrierId: 'c', currency: 'KZT', price: 100000, endpoint: 'warehouse', deliveryDays: 2,
  additionalCharges: [], costs: { ...emptyCosts(), loading: inc, unloading: inc, ...(over.costs ?? {}) }, ...over,
  ...(over.costs ? { costs: { ...emptyCosts(), loading: inc, unloading: inc, ...over.costs } } : {}),
});

test('fully confirmed offer: comparable total = base + charged', () => {
  const a = analyzeOffer(mk({ costs: { unloading: ch(15000) } }), shipment);
  assert.equal(a.status, 'complete');
  assert.equal(a.comparableTotal, 115000);
  assert.equal(a.missing.length, 0);
});

test('unknown required cost is never treated as zero', () => {
  const a = analyzeOffer(mk({ costs: { unloading: { status: 'unknown', amount: null } } }), shipment);
  assert.equal(a.status, 'incomplete');
  assert.equal(a.comparableTotal, null);
  assert.deepEqual(a.missing.map((m) => m.key), ['unloading']);
  assert.equal(a.lowerBound, 100000); // explicit partial value, not a total
});

test('charged without amount is missing, not zero', () => {
  const a = analyzeOffer(mk({ costs: { unloading: { status: 'charged', amount: null } } }), shipment);
  assert.equal(a.comparableTotal, null);
  assert.equal(a.missing[0].reason, 'amount_missing');
});

test('non-required unknown components are n/a, not missing', () => {
  const a = analyzeOffer(mk(), shipment); // insurance/customs/storage/terminal not required
  assert.equal(a.status, 'complete');
  assert.equal(a.rows.find((r) => r.key === 'insurance').state, 'na');
});

test('excluded + required without amount -> missing; with user amount -> extra, counted once', () => {
  const noAmount = analyzeOffer(mk({ endpoint: 'terminal', costs: { terminal: ch(5000), storage: inc, lastMile: { status: 'excluded', amount: null } } }), shipment);
  assert.ok(noAmount.missing.some((m) => m.key === 'lastMile' && m.reason === 'excluded'));
  const withAmount = analyzeOffer(mk({ endpoint: 'terminal', costs: { terminal: ch(5000), storage: inc, lastMile: { status: 'excluded', amount: 20000 } } }), shipment);
  assert.equal(withAmount.status, 'complete');
  assert.equal(withAmount.knownTotal, 105000);
  assert.equal(withAmount.extraTotal, 20000);
  assert.equal(withAmount.comparableTotal, 125000);
  assert.equal(withAmount.destination.toDestination.confirmed, 25000);
});

test('terminal endpoint vs warehouse target requires last mile, terminal fee and storage', () => {
  const a = analyzeOffer(mk({ endpoint: 'terminal' }), shipment);
  assert.equal(a.destination.gap, true);
  const need = a.rows.filter((r) => r.required).map((r) => r.key).sort();
  assert.deepEqual(need, ['lastMile', 'loading', 'storage', 'terminal', 'unloading']);
  assert.ok(buildQuestions(a).some((q) => q.key === 'q.endpoint'));
});

test('shipment requirements switch components on', () => {
  const a = analyzeOffer(mk(), { ...shipment, insuranceRequired: true, customsRequired: true, specialHandling: true });
  assert.deepEqual(a.missing.map((m) => m.key).sort(), ['customs', 'handling', 'insurance']);
});

test('missing base price makes the offer incomplete', () => {
  const a = analyzeOffer(mk({ price: null }), shipment);
  assert.equal(a.comparableTotal, null);
  assert.equal(a.missing[0].key, 'base');
});

test('additional charge without amount is missing', () => {
  const a = analyzeOffer(mk({ additionalCharges: [{ name: 'Ночная доставка', amount: null }, { name: 'Пломба', amount: 2000 }] }), shipment);
  assert.equal(a.comparableTotal, null);
  assert.equal(a.additional.knownSum, 2000);
  assert.equal(a.additional.unknownCount, 1);
  assert.equal(buildQuestions(a).find((q) => q.key === 'q.charge').params.name, 'Ночная доставка');
});

test('ranking, differences and base-vs-final mismatch', () => {
  const cheapBase = analyzeOffer(mk({ id: 'a', price: 100000, costs: { unloading: ch(60000) } }), shipment); // 160000
  const dearBase = analyzeOffer(mk({ id: 'b', price: 130000 }), shipment); // 130000
  const r = compareAnalyses([cheapBase, dearBase]);
  assert.equal(r.bestOfferId, 'b');
  assert.equal(r.baseCheapestOfferId, 'a');
  assert.equal(r.baseFinalMismatch, true);
  assert.equal(r.potentialSavings, 30000);
  const a = r.items.find((i) => i.offerId === 'a');
  assert.equal(a.diffAbs, 30000);
  assert.equal(a.diffPct, 23.08);
  assert.equal(r.status, 'complete');
});

test('incomplete offers are bounded, not ranked', () => {
  const full = analyzeOffer(mk({ id: 'full', price: 200000 }), shipment);
  const gapLow = analyzeOffer(mk({ id: 'low', price: 150000, costs: { unloading: { status: 'unknown', amount: null } } }), shipment);
  const gapHigh = analyzeOffer(mk({ id: 'high', price: 250000, costs: { unloading: { status: 'unknown', amount: null } } }), shipment);
  const r = compareAnalyses([full, gapLow, gapHigh]);
  assert.equal(r.status, 'partial');
  assert.equal(r.items.find((i) => i.offerId === 'low').bound, 'may_be_cheaper');
  assert.equal(r.items.find((i) => i.offerId === 'high').bound, 'exceeds_best');
  assert.equal(r.items.find((i) => i.offerId === 'low').rank, null);
});

test('currencies are never mixed without an explicit rate', () => {
  const kzt = analyzeOffer(mk({ id: 'k', price: 600000 }), shipment);
  const usd = analyzeOffer(mk({ id: 'u', price: 1000, currency: 'USD' }), shipment);
  const blocked = compareAnalyses([kzt, usd], { rates: {} });
  assert.deepEqual(blocked.currencyBlockedIds, ['u']);
  assert.equal(blocked.items.find((i) => i.offerId === 'u').total, null);
  assert.equal(blocked.bestOfferId, 'k');
  const withRate = compareAnalyses([kzt, usd], { rates: { USD: 480 } });
  assert.equal(withRate.items.find((i) => i.offerId === 'u').total, 480000);
  assert.equal(withRate.bestOfferId, 'u');
  const zero = compareAnalyses([kzt, usd], { rates: { USD: 0 } });
  assert.deepEqual(zero.currencyBlockedIds, ['u']);
});

test('pct guards against division by zero', () => {
  assert.equal(pct(10, 0), null);
  assert.equal(pct(null, 5), null);
  assert.equal(pct(150, 100), 50);
});

test('determinism: same input, same output', () => {
  const o = mk({ costs: { unloading: ch(1) } });
  assert.deepEqual(analyzeOffer(o, shipment), analyzeOffer(structuredClone(o), shipment));
});

// ---------- seed data sanity (hand-computed expectations) ----------
const carriers = seedFile('carriers');
const shipments = seedFile('shipments');
const offers = seedFile('offers');
const comparisons = seedFile('comparisons');

function view(id, rates = {}) {
  const comparison = comparisons.find((c) => c.id === id);
  return buildComparisonView({
    comparison,
    shipment: shipments.find((s) => s.id === comparison.shipmentId),
    offers, carriers, settings: { ...DEFAULT_SETTINGS, rates },
  });
}

test('seed has the required volume of demo data, all flagged as demo', () => {
  assert.ok(carriers.length >= 5 && shipments.length >= 10 && offers.length >= 15 && comparisons.length >= 5);
  assert.ok(carriers.every((c) => c.isDemo) && shipments.every((s) => s.isDemo) && comparisons.every((c) => c.isDemo));
});

test('seed cmp1: terminal offer is cheapest on base price but not comparable', () => {
  const v = view('cmp_demo1');
  assert.equal(v.result.bestOfferId, 'off_demo03');
  assert.equal(v.result.bestTotal, 515000);
  assert.equal(v.result.baseCheapestOfferId, 'off_demo02');
  assert.equal(v.result.baseFinalMismatch, true);
  assert.equal(v.result.endpointMismatch, true);
  assert.equal(v.result.items.find((i) => i.offerId === 'off_demo01').total, 545000);
  const o2 = v.entries.find((e) => e.offer.id === 'off_demo02');
  assert.deepEqual(o2.analysis.missing.map((m) => m.key).sort(), ['lastMile', 'storage', 'unloading']);
  assert.equal(o2.item.bound, 'may_be_cheaper'); // 428000 confirmed < 515000
});

test('seed cmp3: USD offer is blocked until a rate is set', () => {
  assert.deepEqual(view('cmp_demo3').result.currencyBlockedIds, ['off_demo08']);
  const v = view('cmp_demo3', { USD: 480 });
  assert.deepEqual(v.result.currencyBlockedIds, []);
  assert.equal(v.result.items.find((i) => i.offerId === 'off_demo08').total, 600000);
  assert.equal(v.result.bestOfferId, 'off_demo08');
});

test('seed cmp4: everything confirmed, ranking by comparable total', () => {
  const v = view('cmp_demo4');
  assert.equal(v.result.status, 'complete');
  assert.deepEqual(v.result.items.filter((i) => i.rank).sort((a, b) => a.rank - b.rank).map((i) => i.offerId), ['off_demo11', 'off_demo12', 'off_demo10']);
  assert.equal(v.result.potentialSavings, 32000);
});

test('seed cmp5: user-supplied storage estimate counts as extra', () => {
  const v = view('cmp_demo5');
  const o14 = v.entries.find((e) => e.offer.id === 'off_demo14');
  assert.equal(o14.analysis.extraTotal, 4000);
  assert.equal(o14.analysis.lowerBound, 130000);
  assert.equal(o14.analysis.comparableTotal, null);
});

test('dashboard stats use complete comparable totals only', () => {
  const views = comparisons.map((c) => view(c.id));
  const stats = dashboardStats(views, shipments);
  assert.equal(stats.totalComparisons, 5);
  assert.equal(stats.activeShipments, shipments.filter((s) => s.status === 'active').length);
  const expectedBest = [515000, 400000, 662000, 232000, 135000];
  assert.equal(stats.averageBestCost, expectedBest.reduce((a, b) => a + b, 0) / 5);
  assert.ok(stats.notifications.length >= 3);
});
