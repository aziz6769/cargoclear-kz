import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DEFAULT_SETTINGS, activityByWeek, analyzeOffer, buildAllViews, buildAnalysis, buildComparisonView, compareAnalyses,
  comparisonToCsv, createMemoryAdapter, createRepository, createTranslator, emptyCosts, explainOffer,
  expenseByCategory, offerFormSchema, defaultOfferValues, formToOffer, offerToForm, offersByCarrier, dashboardStats,
} from '../src/index.js';
import { JURY_IDS, buildJuryScenario } from '../src/seed/jury.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedFile = (n) => JSON.parse(readFileSync(join(here, '..', 'src', 'seed', `${n}.json`), 'utf8'));
const seed = {
  ...Object.fromEntries(['carriers', 'shipments', 'offers', 'comparisons'].map((n) => [n, seedFile(n)])),
  juryScenario: buildJuryScenario,
};
const fresh = async () => {
  const repo = createRepository(createMemoryAdapter(), seed);
  await repo.init();
  return repo;
};
const load = async (repo) => {
  const [shipments, carriers, offers, comparisons, settings] = await Promise.all([
    repo.getShipments(), repo.getCarriers(), repo.getOffers(), repo.getComparisons(), repo.getSettings(),
  ]);
  return { shipments, carriers, offers, comparisons, settings };
};

const shipment = { deliveryLevel: 'warehouse', storageDays: 0, insuranceRequired: false, customsRequired: false, specialHandling: false };
const inc = { status: 'included', amount: null };
const ch = (n) => ({ status: 'charged', amount: n });
const offer = (over = {}) => ({
  id: 'o', carrierId: 'c', currency: 'KZT', price: 100000, endpoint: 'warehouse', deliveryDays: 2, additionalCharges: [],
  ...over,
  costs: { ...emptyCosts(), loading: inc, unloading: inc, ...(over.costs ?? {}) },
});

// ---------- cost states ----------
test('NOT_APPLICABLE is never counted and never a gap', () => {
  const a = analyzeOffer(offer({ costs: { insurance: { status: 'na', amount: 5000 }, customs: { status: 'na', amount: null } } }), { ...shipment, insuranceRequired: true, customsRequired: true });
  assert.equal(a.status, 'complete');
  assert.equal(a.lowerBound, 100000); // the stale 5000 on an N/A row is ignored
  assert.equal(a.rows.find((r) => r.key === 'insurance').state, 'na');
});

test('new optional components (pickup, fuel, other) default to N/A and do not change old offers', () => {
  const a = analyzeOffer(offer(), shipment);
  assert.equal(a.status, 'complete');
  for (const k of ['pickup', 'fuel', 'other']) assert.equal(a.rows.find((r) => r.key === k).state, 'na');
  // an old stored offer that has no such keys at all behaves the same
  const old = offer();
  delete old.costs.pickup; delete old.costs.fuel; delete old.costs.other;
  assert.deepEqual(analyzeOffer(old, shipment).rows, a.rows);
});

test('flagging an optional component as UNKNOWN makes it a real open question, never zero', () => {
  const a = analyzeOffer(offer({ costs: { fuel: { status: 'unknown', amount: null } } }), shipment);
  assert.equal(a.status, 'incomplete');
  assert.ok(a.missing.some((m) => m.key === 'fuel'));
  assert.equal(a.comparableTotal, null);
});

test('EXTRA (charged) amounts are added once; INCLUDED is not added twice', () => {
  const a = analyzeOffer(offer({ costs: { pickup: ch(7000), fuel: inc } }), shipment);
  assert.equal(a.lowerBound, 107000);
});

test('N/A cannot hide an unresolved last-mile leg when the offer stops short of the destination', () => {
  const a = analyzeOffer(offer({ endpoint: 'terminal', costs: { lastMile: { status: 'na', amount: null }, terminal: inc, storage: inc } }), shipment);
  assert.ok(a.missing.some((m) => m.key === 'lastMile'));
  assert.equal(a.status, 'incomplete');
});

// ---------- jury scenario ----------
test('jury demo: lowest quote is not the best comparable offer', () => {
  const sc = buildJuryScenario('en');
  const view = buildComparisonView({
    comparison: sc.comparisons[0], shipment: sc.shipments[0], offers: sc.offers, carriers: sc.carriers, settings: DEFAULT_SETTINGS,
  });
  const by = Object.fromEntries(view.entries.map((e) => [e.carrier.name, e]));
  assert.equal(by['Carrier B'].item.comparability, 'comparable');
  assert.equal(by['Carrier B'].item.total, 215000);
  assert.equal(by['Carrier A'].item.comparability, 'partial');
  assert.equal(by['Carrier C'].item.comparability, 'not_comparable');
  assert.equal(view.result.bestOfferId, JURY_IDS.offers[1]);
  assert.equal(view.result.baseCheapestOfferId, JURY_IDS.offers[2]); // C: 165 000 is the lowest quote
  assert.equal(view.result.baseFinalMismatch, true);
  assert.equal(view.result.status, 'partial');
  // A and C only get a lower bound: they may be cheaper, but nothing can be concluded
  assert.equal(by['Carrier A'].item.total, null);
  assert.equal(by['Carrier A'].item.bound, 'may_be_cheaper');
  assert.equal(by['Carrier C'].item.total, null);
});

test('jury demo: every unknown is reported, none is silently zero', () => {
  const sc = buildJuryScenario('ru');
  const sh = sc.shipments[0];
  const [a, , c] = sc.offers.map((o) => analyzeOffer(o, sh));
  const keysA = a.missing.map((m) => m.key);
  for (const k of ['unloading', 'lastMile', 'fuel']) assert.ok(keysA.includes(k), `A misses ${k}`);
  const keysC = c.missing.map((m) => m.key);
  for (const k of ['lastMile', 'terminal', 'charge']) assert.ok(keysC.includes(k), `C misses ${k}`);
  assert.equal(a.lowerBound, 180000);
  assert.equal(c.lowerBound, 165000);
  assert.equal(c.destination.gap, true);
});

test('jury demo exists in ru, kk and en with identical numbers', () => {
  const nums = (l) => buildJuryScenario(l).offers.map((o) => o.price);
  assert.deepEqual(nums('kk'), nums('ru'));
  assert.deepEqual(nums('en'), [180000, 215000, 165000]);
});

// ---------- comparability / currency ----------
test('currency without a rate -> not comparable; with an explicit rate it is ranked and the rate is explained', () => {
  const usd = analyzeOffer(offer({ id: 'u', currency: 'USD', price: 250 }), shipment);
  const kzt = analyzeOffer(offer({ id: 'k', price: 100000 }), shipment);
  const blocked = compareAnalyses([usd, kzt], { baseCurrency: 'KZT', rates: {} });
  assert.equal(blocked.items[0].comparability, 'not_comparable');
  assert.equal(blocked.items[0].total, null);
  const ok = compareAnalyses([usd, kzt], { baseCurrency: 'KZT', rates: { USD: 480 } });
  assert.equal(ok.items[0].comparability, 'comparable');
  assert.equal(ok.items[0].total, 120000);
  assert.equal(ok.bestOfferId, 'k');
});

test('offers that differ in endpoint are flagged', () => {
  const a = analyzeOffer(offer({ id: 'a' }), shipment);
  const b = analyzeOffer(offer({ id: 'b', endpoint: 'hub', costs: { terminal: inc, lastMile: ch(10000) } }), shipment);
  const r = compareAnalyses([a, b]);
  assert.equal(r.endpointMismatch, true);
  assert.equal(r.items[1].total, 110000); // gap bridged with a confirmed cost -> comparable
});

// ---------- explanation ----------
test('explanation is transparent: steps, missing items and verdict', () => {
  const sc = buildJuryScenario('en');
  const view = buildComparisonView({ comparison: sc.comparisons[0], shipment: sc.shipments[0], offers: sc.offers, carriers: sc.carriers, settings: DEFAULT_SETTINGS });
  const t = createTranslator('en');
  const eA = view.entries[0];
  const x = explainOffer(eA, view.result, t, 'en');
  assert.match(x.lines[0].text, /Base price in the offer/);
  assert.ok(x.lines.some((l) => l.kind === 'missing'));
  assert.match(x.verdict, /Partially comparable/);
  const xB = explainOffer(view.entries[1], view.result, t, 'en');
  assert.match(xB.verdict, /Comparable: every required cost is confirmed/);
  const xC = explainOffer(view.entries[2], view.result, t, 'en');
  assert.match(xC.verdict, /Not comparable/);
  assert.ok(xC.reasons.length > 0);
});

test('automated analysis is derived only from entered data', () => {
  const sc = buildJuryScenario('en');
  const view = buildComparisonView({ comparison: sc.comparisons[0], shipment: sc.shipments[0], offers: sc.offers, carriers: sc.carriers, settings: DEFAULT_SETTINGS });
  const an = buildAnalysis(view);
  assert.equal(an.best.carrier.name, 'Carrier B');
  assert.equal(an.lowestQuoteNotBest, true);
  assert.equal(an.mostComplete.carrier.name, 'Carrier B');
  assert.equal(an.withMissing.length, 2);
  assert.equal(an.comparableCount, 1);
});

// ---------- CSV ----------
test('CSV: shipment, offers, breakdown and unknown list; unknown is never exported as 0', () => {
  const sc = buildJuryScenario('en');
  const view = buildComparisonView({ comparison: sc.comparisons[0], shipment: sc.shipments[0], offers: sc.offers, carriers: sc.carriers, settings: DEFAULT_SETTINGS });
  const t = createTranslator('en');
  const csv = comparisonToCsv(view, t, 'en');
  assert.ok(csv.startsWith('﻿'));
  for (const s of ['SHIPMENT', 'OFFERS', 'COST BREAKDOWN', 'UNCONFIRMED COSTS']) assert.ok(csv.includes(s), s);
  assert.ok(csv.includes('Carrier A,KZT,180000'));
  assert.match(csv, /Carrier A,Fuel surcharge,Cost not confirmed,,KZT/); // empty amount cell, state spelled out
  assert.ok(!/Carrier A,Fuel surcharge,Cost not confirmed,0/.test(csv));
  assert.match(csv, /Carrier B,[^\n]*215000/);
});

test('CSV neutralises spreadsheet formula injection', () => {
  const sc = buildJuryScenario('en');
  sc.carriers[0].name = '=HYPERLINK("http://evil")';
  const view = buildComparisonView({ comparison: sc.comparisons[0], shipment: sc.shipments[0], offers: sc.offers, carriers: sc.carriers, settings: DEFAULT_SETTINGS });
  const csv = comparisonToCsv(view, createTranslator('en'), 'en');
  assert.ok(!csv.includes(',=HYPERLINK') && !csv.includes('\n=HYPERLINK'));
  assert.ok(csv.includes(`"'=HYPERLINK`));
});

// ---------- dashboard stats ----------
test('dashboard stats: averages, incomplete count, charts only use confirmed money', async () => {
  const repo = await fresh();
  const views = buildAllViews(await load(repo));
  const s = dashboardStats(views, await repo.getShipments());
  assert.equal(s.totalComparisons, 5);
  assert.equal(s.averageOffers, 3);
  assert.equal(s.incompleteComparisons + s.completeComparisons, 5);
  assert.ok(s.incompleteComparisons >= 3);
  const ex = expenseByCategory(views);
  assert.ok(ex.counted >= 1);
  for (const v of Object.values(ex.totals)) assert.ok(v > 0);
  const act = activityByWeek(views);
  assert.equal(act.reduce((n, w) => n + w.count, 0), 5);
  // weeks without comparisons are present (honest axis)
  for (let i = 1; i < act.length; i++) assert.equal((new Date(act[i].week) - new Date(act[i - 1].week)) / 864e5, 7);
  assert.equal(offersByCarrier(views).reduce((n, c) => n + c.offers, 0), 15);
});

// ---------- repository: demo isolation and persistence ----------
test('launchDemo adds the scenario and never touches user data', async () => {
  const repo = await fresh();
  const sh = await repo.createShipment({ name: 'Мой груз', origin: 'Алматы', destination: 'Астана', deliveryPoint: 'Склад', weightKg: 10, volumeM3: 1, category: 'general', packages: 1 });
  const before = await load(repo);
  const id = await repo.launchDemo('en');
  assert.equal(id, JURY_IDS.comparison);
  const after = await load(repo);
  assert.equal(after.comparisons.length, before.comparisons.length + 1);
  assert.equal(after.offers.length, before.offers.length + 3);
  assert.ok(after.shipments.some((s) => s.id === sh.id && s.name === 'Мой груз'));
  for (const o of before.offers) assert.deepEqual(after.offers.find((x) => x.id === o.id), o);
  for (const c of before.comparisons) assert.deepEqual(after.comparisons.find((x) => x.id === c.id), c);
});

test('launchDemo again resets edited demo records and switches language, without duplicates', async () => {
  const repo = await fresh();
  await repo.launchDemo('ru');
  const c0 = await repo.getComparison(JURY_IDS.comparison);
  assert.equal(c0.demoLang, 'ru');
  // user edits a demo offer and deletes another record
  const offers = await repo.getOffers({ shipmentId: JURY_IDS.shipment });
  await repo.updateComparison(JURY_IDS.comparison, { offers: offers.map((o) => ({ ...o, price: 1 })) });
  await repo.launchDemo('kk');
  const all = await load(repo);
  assert.equal(all.comparisons.filter((c) => c.id === JURY_IDS.comparison).length, 1);
  assert.equal(all.offers.filter((o) => o.shipmentId === JURY_IDS.shipment).length, 3);
  assert.deepEqual(all.offers.filter((o) => o.shipmentId === JURY_IDS.shipment).map((o) => o.price).sort(), [165000, 180000, 215000]);
  assert.equal((await repo.getComparison(JURY_IDS.comparison)).demoLang, 'kk');
});

test('data survives a "page refresh" (new repository over the same storage)', async () => {
  const adapter = createMemoryAdapter();
  const r1 = createRepository(adapter, seed);
  await r1.init();
  const sh = await r1.createShipment({ name: 'Тест', origin: 'A', destination: 'B', deliveryPoint: 'C', weightKg: 1, volumeM3: 1, category: 'general', packages: 1 });
  const car = await r1.getOrCreateCarrierByName('Новый перевозчик');
  const mk = (price) => ({ carrierId: car.id, price, currency: 'KZT', endpoint: 'warehouse', transportType: 'truck_ftl', costs: emptyCosts(), additionalCharges: [], includedServices: [], excludedServices: [] });
  const cmp = await r1.createComparison({ name: 'Сохранится', shipmentId: sh.id, offers: [mk(100), mk(200)] });
  const r2 = createRepository(adapter, seed); // new "session"
  await r2.init();
  const got = await r2.getComparison(cmp.id);
  assert.equal(got.name, 'Сохранится');
  assert.equal((await r2.getOffers({ shipmentId: sh.id })).length, 2);
  assert.equal(got.isDemo, false);
});

// ---------- forms ----------
test('offer form: N/A status and unknown note round-trip; negative amounts are rejected', () => {
  const form = defaultOfferValues();
  form.carrierName = 'XX';
  form.costs.fuel = { status: 'unknown', amount: '', note: ' ждём ответ ' };
  form.costs.customs = { status: 'na', amount: '', note: '' };
  const parsed = offerFormSchema.parse(form);
  const stored = formToOffer(parsed, 'car1');
  assert.deepEqual(stored.costs.fuel, { status: 'unknown', amount: null, note: 'ждём ответ' });
  assert.deepEqual(stored.costs.customs, { status: 'na', amount: null });
  assert.equal(offerToForm({ ...stored, id: 'o1' }, { name: 'XX' }).costs.fuel.note, 'ждём ответ');
  const bad = defaultOfferValues();
  bad.carrierName = 'XX';
  bad.price = -5;
  assert.equal(offerFormSchema.safeParse(bad).success, false);
  const bad2 = defaultOfferValues();
  bad2.carrierName = 'XX';
  bad2.costs.pickup = { status: 'charged', amount: -1, note: '' };
  assert.equal(offerFormSchema.safeParse(bad2).success, false);
});
