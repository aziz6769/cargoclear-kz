import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  AssistantError, answerToText, buildAllViews, buildAnswer, classify, createAssistant, createHttpProvider, createMemoryAdapter,
  createRepository, createTranslator, renderBlock, retrieveContext, rulesProvider, suggestQuestions, ungroundedNumbers, validEndpoint, dictionaries,
} from '../src/index.js';
import { buildJuryScenario } from '../src/seed/jury.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedFile = (n) => JSON.parse(readFileSync(join(here, '..', 'src', 'seed', `${n}.json`), 'utf8'));
const seed = { ...Object.fromEntries(['carriers', 'shipments', 'offers', 'comparisons'].map((n) => [n, seedFile(n)])), juryScenario: buildJuryScenario };
const setup = async (provider) => {
  const repo = createRepository(createMemoryAdapter(), seed);
  await repo.init();
  const cmpId = await repo.launchDemo('en');
  return { repo, cmpId, bot: createAssistant({ repo, provider }) };
};
const t = createTranslator('en');
const text = (m) => m.blocks.map((b) => renderBlock(b, t, 'en')).join('\n');
const kinds = (m, k) => m.blocks.filter((b) => b.kind === k);

test('why is Carrier A not the cheapest: quote vs known extras, unknowns, comparability - all from the engine', async () => {
  const { bot, cmpId } = await setup();
  const m = await bot.ask('Why is Carrier A not the cheapest option?', { lang: 'en', comparisonId: cmpId });
  assert.equal(m.intent, 'why_not_cheapest');
  const s = text(m);
  assert.match(s, /Carrier A quoted .*180[\s ,]?000/);
  assert.ok(kinds(m, 'unknown').length >= 2, 'unloading + last mile (and more) are flagged unknown');
  assert.ok(m.blocks.some((b) => b.key.startsWith('as.unk.excluded') && b.params.label.$t === 'comp.unloading'));
  assert.ok(m.blocks.some((b) => b.key.startsWith('as.unk.unknown') && b.params.label.$t === 'comp.lastMile'));
  assert.ok(m.blocks.some((b) => b.key === 'as.why.gap'));
  assert.ok(m.blocks.some((b) => b.key === 'as.v.partial'));
  assert.ok(!m.blocks.some((b) => b.key === 'as.v.bestComparable'));
  assert.equal(m.engine, 'rules');
  assert.equal(m.ai, null);
});

test('unknown is never rendered as an amount', async () => {
  const { bot, cmpId } = await setup();
  const m = await bot.ask('What is missing?', { lang: 'en', comparisonId: cmpId });
  assert.equal(m.intent, 'missing');
  for (const b of kinds(m, 'unknown')) assert.ok(!('amount' in b.params), `unknown block ${b.key} carries no amount`);
});

test('ask Carrier C: concrete questions with sources; Carrier B has nothing open', async () => {
  const { bot, cmpId } = await setup();
  const c = await bot.ask('What should I ask Carrier C?', { lang: 'en', comparisonId: cmpId });
  const qs = kinds(c, 'question');
  assert.ok(qs.length >= 2);
  assert.ok(qs.every((q) => q.sources.length === 1 && q.sources[0].carrier === 'Carrier C' && q.sources[0].offerId));
  assert.ok(qs.some((q) => q.key === 'q.charge'), 'asks about the unknown handling charge');
  const b = await bot.ask('What should I ask Carrier B?', { lang: 'en', comparisonId: cmpId });
  assert.equal(b.blocks[0].key, 'as.ask.none');
  assert.equal(kinds(b, 'question').length, 0);
});

test('compare: B is the best comparable, lowest quote C is not, incomplete offers are not ranked', async () => {
  const { bot, cmpId } = await setup();
  const m = await bot.ask('Compare these three carriers', { lang: 'en', comparisonId: cmpId });
  assert.equal(m.intent, 'compare_all');
  const keys = m.blocks.map((b) => b.key);
  assert.ok(keys.includes('as.cmp.ok') && keys.includes('as.cmp.partial') && keys.includes('as.cmp.notOk'));
  const best = m.blocks.find((b) => b.key === 'as.cmp.best');
  assert.equal(best.params.carrier, 'Carrier B');
  assert.equal(best.params.amount.$money[0], 215000);
  const low = m.blocks.find((b) => b.key === 'as.cmp.lowestNotBest');
  assert.equal(low.params.lowest, 'Carrier C');
  assert.equal(low.params.quote.$money[0], 165000);
});

test('recommend only a fully comparable offer; refuses when none is comparable', async () => {
  const { bot, cmpId, repo } = await setup();
  const m = await bot.ask('Which carrier do you recommend?', { lang: 'en', comparisonId: cmpId });
  assert.equal(m.blocks[0].key, 'as.rec.best');
  assert.equal(m.blocks[0].params.carrier, 'Carrier B');
  assert.ok(m.blocks.some((b) => b.key === 'as.rec.scope'), 'states what the data does not cover');
  // make B incomplete -> no recommendation
  await repo.updateComparison(cmpId, { offers: (await repo.getOffers()).filter((o) => ['off_jury_a', 'off_jury_c'].includes(o.id)) });
  const m2 = await bot.ask('Which carrier do you recommend?', { lang: 'en', comparisonId: cmpId });
  assert.equal(m2.blocks[0].key, 'as.rec.none');
});

test('every money figure in every answer exists in the calculation engine output', async () => {
  const { bot, repo, cmpId } = await setup();
  const data = {
    shipments: await repo.getShipments(), carriers: await repo.getCarriers(), offers: await repo.getOffers(),
    comparisons: await repo.getComparisons(), settings: await repo.getSettings(),
  };
  const allowed = new Set();
  for (const v of buildAllViews(data)) {
    allowed.add(v.result.bestTotal); allowed.add(v.result.potentialSavings);
    for (const e of v.entries) {
      const a = e.analysis;
      [a.price, a.knownTotal, a.extraTotal, a.lowerBound, a.comparableTotal, e.item.total, e.item.lowerBound, e.item.diffAbs, e.item.known, e.item.base].forEach((x) => allowed.add(x));
      a.rows.forEach((r) => allowed.add(r.amount));
      a.additional.items.forEach((c) => allowed.add(c.amount));
    }
  }
  const qs = ['Why is Carrier A not the cheapest?', 'Why is Carrier C not the cheapest?', 'Compare these carriers', 'recommend', 'summary', 'missing info', 'delivery condition mismatch', 'what is last mile', 'shipment details', 'history'];
  let checked = 0;
  for (const q of qs) {
    const m = await bot.ask(q, { lang: 'en', comparisonId: cmpId });
    for (const b of m.blocks) for (const v of Object.values(b.params)) if (v?.$money) { checked++; assert.ok(allowed.has(v.$money[0]), `${q}: ${b.key} amount ${v.$money[0]} not from engine`); }
  }
  assert.ok(checked > 20);
});

test('market-data questions are refused, nothing invented', async () => {
  const { bot, cmpId } = await setup();
  for (const q of ['What is the average market price per km?', 'Какая средняя рыночная цена перевозки?', 'Орташа баға қанша?']) {
    const m = await bot.ask(q, { lang: 'en', comparisonId: cmpId });
    assert.equal(m.intent, 'market');
    assert.deepEqual(m.blocks.map((b) => b.key), ['as.market']);
  }
});

test('intent classification works in RU, KK and EN', () => {
  const entries = [{ offer: { id: 'o1' }, carrier: { name: 'Carrier A' } }, { offer: { id: 'o2' }, carrier: { name: 'Carrier B' } }];
  const cases = [
    ['Почему перевозчик A не самый дешёвый?', 'why_not_cheapest', 'o1'], ['Неге Carrier B ең арзан емес?', 'why_not_cheapest', 'o2'],
    ['Что спросить у Carrier B?', 'ask_carrier', 'o2'], ['Carrier A-дан не сұрау керек?', 'ask_carrier', 'o1'], ['What should I ask Carrier B?', 'ask_carrier', 'o2'],
    ['Сравни этих перевозчиков', 'compare_all', null], ['Осы тасымалдаушыларды салыстыр', 'compare_all', null], ['Compare these three carriers', 'compare_all', null],
    ['Какой информации не хватает?', 'missing', null], ['What information is missing?', 'missing', null],
    ['Что такое последняя миля?', 'term', null], ['What is last mile?', 'term', null], ['Терминал деген не?', 'term', null],
    ['Что рекомендуешь выбрать?', 'recommend', null], ['Различаются ли условия доставки?', 'mismatch', null], ['asdf qwer', 'unsupported', null],
  ];
  for (const [q, intent, offer] of cases) {
    const c = classify(q, entries);
    assert.equal(c.intent, intent, q);
    if (offer) assert.equal(c.carrierId, offer, q);
  }
});

test('terminology: general definition is labelled as such, plus where the term occurs in the comparison', async () => {
  const { bot, cmpId } = await setup();
  const m = await bot.ask('What is last mile?', { lang: 'en', comparisonId: cmpId });
  assert.equal(m.blocks[0].key, 'as.term.def');
  assert.equal(m.blocks[0].sources[0].type, 'glossary');
  assert.ok(m.blocks.slice(1).every((b) => b.key.startsWith('as.term.') && b.sources[0].type === 'cost'));
  assert.ok(m.blocks.length >= 4);
});

test('no data / missing comparison are reported honestly', async () => {
  const { bot, repo } = await setup();
  const gone = await bot.ask('Compare these carriers', { lang: 'en', comparisonId: 'cmp_nope' });
  assert.deepEqual(gone.blocks.map((b) => b.key), ['as.scopeGone']);
  await repo.clearAllData();
  const empty = await bot.ask('Compare these carriers', { lang: 'en' });
  assert.deepEqual(empty.blocks.map((b) => b.key), ['as.noData']);
  const term = await bot.ask('what is terminal', { lang: 'en' });
  assert.equal(term.blocks[0].key, 'as.term.def', 'terminology still works without data');
});

test('suggested questions are derived from data and carry explicit intents', async () => {
  const { repo, bot, cmpId } = await setup();
  const ctx = await bot.context(cmpId);
  const s = suggestQuestions(ctx);
  assert.ok(s.some((x) => x.intent === 'why_not_cheapest' && x.params.carrier === 'Carrier C'));
  assert.ok(s.some((x) => x.intent === 'ask_carrier'));
  assert.ok(s.some((x) => x.intent === 'compare_all' && x.params.count === 3));
  const m = await bot.ask('x', { lang: 'en', comparisonId: cmpId, intent: 'ask_carrier', offerId: 'off_jury_c' });
  assert.ok(kinds(m, 'question').length > 0);
  assert.ok(repo);
});

test('answers re-render in every language from the same stored blocks', async () => {
  const { bot, cmpId } = await setup();
  const m = await bot.ask('Compare these three carriers', { lang: 'en', comparisonId: cmpId });
  for (const lang of ['ru', 'kk', 'en']) {
    const tr = createTranslator(lang);
    const out = answerToText({ blocks: m.blocks }, tr, lang);
    assert.ok(!/\{[a-z]+\}/i.test(out), `unresolved placeholder in ${lang}: ${out}`);
    assert.ok(!/\bas\.[a-z]+\./.test(out), `missing key in ${lang}`);
  }
  for (const l of ['ru', 'kk']) assert.deepEqual(Object.keys(dictionaries[l]).filter((k) => k.startsWith('as.')).sort(), Object.keys(dictionaries.en).filter((k) => k.startsWith('as.')).sort());
});

test('ungroundedNumbers catches invented figures, accepts grounded ones', () => {
  const grounded = 'Carrier B: 215 000 ₸, rank 1, 3 items';
  assert.deepEqual(ungroundedNumbers('B costs 215 000 ₸ (rank 1)', grounded), []);
  assert.deepEqual(ungroundedNumbers('B costs 215,000 and A about 190 000', grounded), ['190000']);
  assert.deepEqual(ungroundedNumbers('market rate is 4500 per day', grounded), ['4500']);
});

test('external AI is optional: grounded text accepted, invented figures rejected, failures fall back to rules', async () => {
  const seen = [];
  const mk = (fn) => ({ id: 'mock', kind: 'ai', generate: async (req) => { seen.push(req); return fn(req); } });
  let ctx = await setup(mk((r) => `Summary: ${r.groundedText.split('\n')[0].replace(/^\[\w+\] /, '')}`));
  let m = await ctx.bot.ask('Compare these carriers', { lang: 'en', comparisonId: ctx.cmpId });
  assert.equal(m.aiStatus, 'ok'); assert.equal(m.engine, 'ai'); assert.ok(m.ai); assert.ok(m.blocks.length, 'grounded blocks always kept');
  assert.ok(seen[0].groundedText.includes('[verdict]'));
  assert.ok(!JSON.stringify(seen[0]).includes('apiKey'));

  ctx = await setup(mk(() => 'Carrier A will cost about 777 000 in the market.'));
  m = await ctx.bot.ask('Compare these carriers', { lang: 'en', comparisonId: ctx.cmpId });
  assert.equal(m.aiStatus, 'rejected'); assert.equal(m.ai, null); assert.equal(m.engine, 'rules');

  ctx = await setup(mk(() => { throw new AssistantError('timeout'); }));
  m = await ctx.bot.ask('Compare these carriers', { lang: 'en', comparisonId: ctx.cmpId });
  assert.equal(m.aiStatus, 'error'); assert.equal(m.aiError, 'timeout'); assert.equal(m.engine, 'rules');

  ctx = await setup(rulesProvider);
  m = await ctx.bot.ask('Compare these carriers', { lang: 'en', comparisonId: ctx.cmpId });
  assert.equal(m.aiStatus, null); assert.equal(m.engine, 'rules');
});

test('HTTP provider: sends only question + grounded text, validates responses, maps errors', async () => {
  assert.ok(validEndpoint('https://api.example.com/x') && validEndpoint('http://localhost:8787/a'));
  assert.ok(!validEndpoint('http://evil.example.com') && !validEndpoint('javascript:alert(1)') && !validEndpoint(''));
  assert.throws(() => createHttpProvider({ endpoint: 'ftp://x' }), (e) => e.code === 'bad_endpoint');
  let sent;
  const ok = createHttpProvider({ endpoint: 'https://x.test/a', fetchImpl: async (u, o) => { sent = { u, o }; return { ok: true, json: async () => ({ text: ' hello 12 ' }) }; } });
  assert.equal(await ok.generate({ question: 'q', lang: 'en', groundedText: 'g' }), 'hello 12');
  const body = JSON.parse(sent.o.body);
  assert.deepEqual(Object.keys(body).sort(), ['grounded', 'lang', 'question', 'rules']);
  assert.ok(!('authorization' in Object.fromEntries(Object.entries(sent.o.headers).map(([k, v]) => [k.toLowerCase(), v]))));
  const code = async (fetchImpl) => { try { await createHttpProvider({ endpoint: 'https://x.test', fetchImpl, timeoutMs: 30 }).generate({}); } catch (e) { return e.code; } };
  assert.equal(await code(async () => ({ ok: false, status: 500 })), 'http');
  assert.equal(await code(async () => ({ ok: true, json: async () => ({ nope: 1 }) })), 'format');
  assert.equal(await code(async () => ({ ok: true, json: async () => { throw new Error('x'); } })), 'format');
  assert.equal(await code(async () => { throw new TypeError('fail'); }), 'network');
  assert.equal(await code((u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))))), 'timeout');
});

test('conversation history persists, is capped, can be cleared, and is wiped with all data', async () => {
  const { bot, repo, cmpId } = await setup();
  await bot.ask('Compare these carriers', { lang: 'en', comparisonId: cmpId });
  await bot.ask('what is terminal', { lang: 'en' });
  let h = await bot.history();
  assert.deepEqual(h.map((x) => x.role), ['user', 'assistant', 'user', 'assistant']);
  assert.equal(h[1].scope.comparisonId, cmpId);
  for (let i = 0; i < 50; i++) await bot.ask('what is terminal', { lang: 'en' });
  assert.ok((await bot.history()).length <= 80);
  await bot.clearHistory();
  assert.deepEqual(await bot.history(), []);
  await bot.ask('what is terminal', { lang: 'en' });
  await repo.clearAllData();
  assert.deepEqual(await bot.history(), []);
  await assert.rejects(bot.ask('   ', { lang: 'en' }), (e) => e.code === 'empty');
});

test('assistant never mutates stored data', async () => {
  const { bot, repo, cmpId } = await setup();
  const snap = JSON.stringify([await repo.getShipments(), await repo.getOffers(), await repo.getComparisons(), await repo.getCarriers()]);
  for (const q of ['recommend', 'compare', 'ask Carrier A', 'missing']) await bot.ask(q, { lang: 'ru', comparisonId: cmpId });
  assert.equal(JSON.stringify([await repo.getShipments(), await repo.getOffers(), await repo.getComparisons(), await repo.getCarriers()]), snap);
});

test('assistant does not silently pick the latest comparison when several exist', async () => {
  const { bot, repo } = await setup();
  assert.ok((await repo.getComparisons()).length > 1);
  const r = await bot.ask('Compare these carriers', { lang: 'en' });
  assert.deepEqual(r.blocks.map((b) => b.key), ['as.chooseScope']);
  const terms = await bot.ask('What is incoterms?', { lang: 'en' });
  assert.ok(!terms.blocks.some((b) => b.key === 'as.chooseScope'));
});
