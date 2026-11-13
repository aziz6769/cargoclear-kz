// AI-assistant check in a real browser against the production build:
// dedicated page, contextual panel, suggestions, history persistence, source links, RU/KK/EN,
// rule-based honesty label, loading/error states, optional external AI (mock proxy), mobile layout.
// Usage: npm run build && node scripts/assistant-flow.mjs [--shots]
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const SHOTS_ON = process.argv.includes('--shots');
const PORT = 4176;
const AI_PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const SHOTS = new URL('../../../shots/assistant/', import.meta.url).pathname;
if (SHOTS_ON) mkdirSync(SHOTS, { recursive: true });

// --- mock AI proxy (stands in for the owner's backend; holds no key, we only check what the browser sends) ---
const received = [];
const ai = createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    received.push({ path: req.url, headers: req.headers, body: JSON.parse(body || '{}') });
    if (req.url === '/fail') { res.writeHead(500); return res.end('boom'); }
    res.setHeader('content-type', 'application/json');
    if (req.url === '/invent') return res.end(JSON.stringify({ text: 'Carrier A will realistically end up around 777 000 in the market.' }));
    if (req.url === '/slow') return setTimeout(() => res.end(JSON.stringify({ text: 'slow ok' })), 1200);
    const first = String(JSON.parse(body).grounded).split('\n').find((l) => l.startsWith('[verdict]')) ?? '';
    res.end(JSON.stringify({ text: `AI summary: ${first.replace(/^\[\w+\] /, '')}` }));
  });
});
await new Promise((r) => ai.listen(AI_PORT, r));

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* wait */ } await sleep(250); }
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console.error: ${m.text()}`); });

let passed = 0;
const failures = [];
const check = (name, cond, extra = '') => {
  if (cond) passed++; else failures.push(`${name} ${extra}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' ' + extra}`);
};
const text = () => page.evaluate(() => document.body.innerText);
const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle0' }); await sleep(350); };
const shot = async (n) => { if (SHOTS_ON) await page.screenshot({ path: `${SHOTS}${n}.png`, fullPage: true }); };
const setLang = async (l) => { await page.evaluate((l) => [...document.querySelectorAll('header button, [role=group] button')].find((b) => b.textContent.trim().toLowerCase() === l)?.click(), l); await sleep(400); };
const clickSug = async (intent, nth = 0) => { await page.evaluate((i, n) => document.querySelectorAll(`[data-suggestion="${i}"]`)[n]?.click(), intent, nth); await sleep(500); };
const lastBot = () => page.evaluate(() => { const l = [...document.querySelectorAll('[data-msg="assistant"]')].pop(); return l ? { text: l.innerText, engine: l.dataset.engine, kinds: [...l.querySelectorAll('[data-block]')].map((b) => b.dataset.block), sources: [...l.querySelectorAll('[data-source]')].map((s) => s.textContent) } : null; });
const ask = async (q) => { await page.type('#as-input', q); await page.keyboard.press('Enter'); await sleep(600); };
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const setEndpoint = async (url) => {
  await go('/settings');
  await page.evaluate(() => { const i = document.querySelector('[data-ai-endpoint]'); i.scrollIntoView(); });
  await page.click('[data-ai-endpoint]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (url) await page.type('[data-ai-endpoint]', url);
  await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /Сохранить|Save|Сақтау/.test(b.textContent)).pop().click());
  await sleep(600);
};

try {
  // demo data in English so assertions read naturally
  await go('/demo');
  await setLang('en');
  await go('/assistant');
  let t = await text();
  let m0;
  check('page: dedicated assistant page opens', t.includes('CargoClear Assistant'));
  check('page: privacy note says history is local', t.includes('stored only in this browser'));
  check('page: empty state + suggestions shown', t.includes('Ask your first question') && (await page.$$('[data-suggestion]')).length >= 1);
  check('nav: Assistant in sidebar', await page.evaluate(() => !!document.querySelector('nav a[href="/assistant"]')));
  await shot('01-empty');
  check('scope: several comparisons and none chosen -> explicit choice required, no silent latest', !!(await page.$('[data-scope-required]')));
  await ask('Compare these three carriers');
  m0 = await lastBot();
  check('scope: assistant asks to choose instead of answering from the latest comparison', /Choose which one/.test(m0.text) && !m0.kinds.includes('verdict'));
  await go('/assistant?c=cmp_jury1');
  check('scope: after choosing a comparison, data-driven suggestions appear', (await page.$$('[data-suggestion]')).length >= 4);

  // example 1: why is Carrier A not the cheapest
  await ask('Why is Carrier A not the cheapest option?');
  let m = await lastBot();
  check('why-A: answered by rules and labelled "not an AI model"', m.engine === 'rules' && m.text.includes('not an AI model'));
  check('why-A: quote 180 000 stated', /Carrier A quoted[^\n]*180[\s  ,]000/.test(m.text));
  check('why-A: unloading and last mile shown as unknown/excluded', /Unloading[^\n]*(excluded|not confirmed)/.test(m.text) && /Last-mile[^\n]*not confirmed/.test(m.text));
  check('why-A: says not comparable-in-full, names confirmed vs assumption kinds', m.kinds.includes('unknown') && m.kinds.includes('verdict') && m.kinds.includes('fact'));
  check('why-A: verdict says partially comparable', /partially comparable/i.test(m.text));
  check('why-A: sources cite Carrier A offer / cost items', m.sources.some((s) => s.includes('Carrier A ·')) && m.sources.length >= 4, JSON.stringify(m.sources));
  check('why-A: no market figures or benchmarks mentioned', !/market|average|typical/i.test(m.text));
  await shot('02-why-a');

  // example 2: what should I ask Carrier B / C
  await ask('What should I ask Carrier B?');
  m = await lastBot();
  check('ask-B: honest "nothing open" (B has no unknowns in the demo)', /nothing is open/.test(m.text) && !m.kinds.includes('question'));
  await ask('What should I ask Carrier C?');
  m = await lastBot();
  check('ask-C: concrete questions with sources', m.kinds.filter((k) => k === 'question').length >= 3 && m.sources.some((s) => s.startsWith('Carrier C')));
  check('ask-C: asks about handling charge and last mile', /handling/i.test(m.text) && /last-mile/i.test(m.text));

  // example 3: compare
  await ask('Compare these three carriers');
  m = await lastBot();
  check('compare: best comparable = Carrier B 215 000', /Best comparable offer: Carrier B, 215[\s  ,]000/.test(m.text));
  check('compare: lowest quote (C, 165 000) is not the best', /lowest quote \(Carrier C, 165[\s  ,]000[^)]*\) is not the best comparable/.test(m.text));
  check('compare: distinguishes comparable / partially / not comparable', /Comparable/.test(m.text) && /Partially comparable/.test(m.text) && /Not comparable/.test(m.text));
  await shot('03-compare');

  // terminology, market, unsupported
  await ask('What is last mile?');
  m = await lastBot();
  check('terms: general definition is labelled "not from your data" and linked to offers', m.text.includes('not from your data') && m.text.includes('In your comparison'));
  await ask('What is the average market price per km?');
  m = await lastBot();
  check('market: refuses to invent market data', /no market data/.test(m.text) && !/\d{3}/.test(m.text.replace(/ /g, '')));
  await ask('blah blah');
  m = await lastBot();
  check('unsupported: lists what it can do', /I can:/.test(m.text));

  // source link navigates
  await page.evaluate(() => document.querySelector('[data-source][href^="/comparisons/"]').click());
  await sleep(500);
  check('source chip opens the cited comparison', /\/comparisons\/cmp_jury1$/.test(page.url()));

  // contextual panel inside results
  await go('/comparisons/cmp_jury1');
  check('panel: contextual assistant present on results page', !!(await page.$('[data-assistant-panel]')));
  await page.evaluate(() => document.querySelector('[data-assistant-panel] button[aria-expanded]').click());
  await sleep(400);
  const panelMsgs = await page.evaluate(() => document.querySelectorAll('[data-assistant-panel] [data-msg]').length);
  check('panel: shows only this comparison thread (history persisted across pages)', panelMsgs >= 6, String(panelMsgs));
  await clickSug('why_not_cheapest');
  m = await lastBot();
  check('panel: suggestion for the lowest-quote carrier works', /Carrier C/.test(m.text) && m.engine === 'rules');
  await clickSug('recommend');
  m = await lastBot();
  check('panel: recommendation = B and states the limits of the data', /Carrier B[^\n]*215/.test(m.text) && /market rates are not part of the data/.test(m.text));
  await shot('04-panel');
  await go('/assistant?c=cmp_jury1');
  check('history: persists after reload', (await page.$$('[data-msg]')).length >= 14);

  // languages: same stored answers re-render
  await setLang('ru');
  t = await text();
  check('i18n RU: page and stored answers re-render in Russian', t.includes('Ассистент CargoClear') && t.includes('Анализ по правилам') && t.includes('не ИИ-модель') && !/\bas\.[a-z]+\.[a-z]/i.test(t));
  await shot('05-ru');
  await ask('Почему Carrier A не самый дешёвый?');
  m = await lastBot();
  check('i18n RU: question understood, answer in Russian', m.text.includes('Carrier A назвал базовую цену') && /не подтверждено/.test(m.text));
  await ask('Что спросить у Carrier C?');
  m = await lastBot();
  check('i18n RU: carrier questions', m.kinds.includes('question') && m.text.includes('Вопросы для Carrier C'));
  await setLang('kk');
  t = await text();
  check('i18n KK: page in Kazakh', t.includes('CargoClear көмекшісі') && t.includes('Ережелер бойынша талдау'));
  await ask('Carrier A неге ең арзан емес?');
  m = await lastBot();
  check('i18n KK: question understood, answer in Kazakh', m.text.includes('базалық бағаны') && m.engine === 'rules');
  await shot('06-kk');
  await setLang('en');

  // clear history requires confirmation
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Clear history/.test(b.textContent)).click());
  await sleep(300);
  check('clear: asks for confirmation', (await text()).includes('Delete the whole conversation history'));
  await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button, .fixed button')].find((b) => /Confirm/i.test(b.textContent))?.click());
  await sleep(500);
  check('clear: history emptied', (await page.$$('[data-msg]')).length === 0);
  await go('/comparisons/cmp_jury1');
  check('clear: comparison itself still intact', (await text()).includes('Carrier B'));

  // external AI (mock proxy): ok / invented numbers / failure / slow -> loading
  await setEndpoint(`http://localhost:${AI_PORT}/ok`);
  check('settings: endpoint saved, privacy notice mentions the endpoint', (await text()).includes('external AI endpoint is configured'));
  await go('/assistant?c=cmp_jury1');
  check('ai: privacy banner on assistant page mentions sending', (await text()).includes('grounded text of the selected comparison is sent'));
  await ask('Compare these three carriers');
  m = await lastBot();
  check('ai ok: shown as AI wording, grounded facts still listed', m.engine === 'ai' && m.text.includes('AI wording') && m.text.includes('AI summary:') && m.kinds.length >= 5);
  const req = received.at(-1);
  check('ai ok: browser sent only question/lang/grounded/rules, no credentials', Object.keys(req.body).sort().join() === 'grounded,lang,question,rules' && !req.headers.authorization && !JSON.stringify(req.body).match(/api[_-]?key|secret|token/i));
  check('ai ok: grounded text contains the engine figures', /215/.test(req.body.grounded) && /\[verdict\]/.test(req.body.grounded));
  await shot('07-ai-ok');
  await setEndpoint(`http://localhost:${AI_PORT}/invent`);
  await go('/assistant?c=cmp_jury1');
  await ask('Compare these three carriers');
  m = await lastBot();
  check('ai invented figure: AI text discarded, rule-based answer shown with warning', m.engine === 'rules' && m.text.includes('figures not found in your data (777000)'), m.text.slice(0, 200));
  check('ai invented figure: the invented text itself is NOT displayed', !m.text.includes('realistically end up'));
  await setEndpoint(`http://localhost:${AI_PORT}/fail`);
  await go('/assistant?c=cmp_jury1');
  await ask('Compare these three carriers');
  m = await lastBot();
  check('ai failure: falls back to rules, says so, never claims AI', m.engine === 'rules' && m.text.includes('External AI provider unavailable (http)') && m.text.includes('not an AI model'));
  await shot('08-ai-fail');
  await setEndpoint(`http://localhost:${AI_PORT}/slow`);
  await go('/assistant?c=cmp_jury1');
  await page.type('#as-input', 'Compare these three carriers');
  await page.keyboard.press('Enter');
  await sleep(350);
  check('loading: spinner shown while the provider is working', !!(await page.$('[data-loading]')) && (await page.evaluate(() => document.querySelector('[data-suggestion]').disabled)));
  await sleep(1500);
  check('loading: spinner gone after the answer', !(await page.$('[data-loading]')));
  await shot('09-loading-done');
  // unreachable endpoint -> graceful
  await setEndpoint('http://localhost:9/none');
  await go('/assistant?c=cmp_jury1');
  await ask('Compare these three carriers');
  m = await lastBot();
  check('ai unreachable: graceful fallback (network)', m.engine === 'rules' && /unavailable \((network|timeout)\)/.test(m.text));
  // invalid endpoint rejected
  await setEndpoint('http://evil.example.com/x');
  check('settings: non-https remote endpoint rejected', (await text()).includes('Enter an https:// URL'));
  await setEndpoint('');
  await go('/assistant?c=cmp_jury1');
  await ask('Compare these three carriers');
  m = await lastBot();
  check('ai removed: back to rule-based', m.engine === 'rules' && !m.text.includes('unavailable'));

  // empty data state
  await go('/settings');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Delete all data|Удалить все данные|Барлық деректерді жою/.test(b.textContent))?.click());
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^(Confirm|Подтвердить|Растау)$/.test(b.textContent.trim()))?.click());
  await sleep(700);
  await go('/assistant');
  t = await text();
  check('no data: page explains there is no comparison and still offers terminology', t.includes('No comparison selected') && (await page.$$('[data-suggestion]')).length === 1);
  await ask('Compare these three carriers');
  m = await lastBot();
  check('no data: honest "no saved comparisons"', /no saved comparisons/.test(m.text));

  // mobile
  await go('/demo');
  await page.setViewport({ width: 375, height: 800, isMobile: true, hasTouch: true });
  await go('/assistant');
  check('mobile 375: assistant page has no horizontal overflow', (await overflow()) <= 0, String(await overflow()));
  await ask('Compare these three carriers');
  check('mobile 375: no horizontal overflow with a long answer', (await overflow()) <= 0, String(await overflow()));
  await shot('10-mobile');
  await page.setViewport({ width: 320, height: 700, isMobile: true, hasTouch: true });
  await go('/comparisons/cmp_jury1');
  await page.evaluate(() => document.querySelector('[data-assistant-panel] button[aria-expanded]').click());
  await sleep(300);
  check('mobile 320: results + open panel, no overflow', (await overflow()) <= 0, String(await overflow()));
  const small = await page.evaluate(() => [...document.querySelectorAll('[data-assistant-panel] button, [data-assistant-panel] a, [data-assistant-panel] input')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.height < 36 || r.width < 36); }).map((e) => `${e.tagName}${e.textContent.trim().slice(0, 15)}`));
  check('mobile 320: tap targets >= 36px in the panel', small.length === 0, small.join(' | '));
  await shot('11-mobile-panel');

  check('no console / page errors', problems.length === 0, problems.slice(0, 3).join(' | '));
} catch (e) {
  failures.push(`SCRIPT ERROR: ${e.stack}`);
  console.log('SCRIPT ERROR', e.stack);
}
await browser.close();
server.kill();
ai.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) console.log(failures.join('\n'));
process.exit(failures.length ? 1 : 0);
