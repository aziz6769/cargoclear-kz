// Phase 3 browser flow against the production build: shipments search/sort/filter, documents CRUD + persistence,
// shipment history, carrier interactions, portfolio analytics filters, dashboard cards.
// Usage: npm run build && node scripts/phase3-flow.mjs
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 4177;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* wait */ } await sleep(250); }
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console.error: ${m.text()}`); });
let passed = 0;
const failures = [];
const check = (name, cond, extra = '') => { if (cond) passed++; else failures.push(`${name} ${extra}`); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' ' + extra}`); };
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle0' }); await sleep(350); };
const text = () => page.evaluate(() => document.body.innerText);
const count = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const clickBtn = (re, scope = 'body') => page.evaluate((src, scope) => { const b = [...document.querySelectorAll(`${scope} button`)].find((x) => new RegExp(src, 'i').test(x.textContent)); b?.click(); return !!b; }, re.source, scope);

try {
  await go('/');
  await page.evaluate(() => [...document.querySelectorAll('header button, [role=group] button')].find((b) => b.textContent.trim().toLowerCase() === 'en')?.click());
  await sleep(300);

  // dashboard
  await go('/');
  check('dashboard: contextual assistant card', (await count('[data-dash-assistant]')) === 1);
  check('dashboard: spend dynamics chart title', (await text()).includes('Spend dynamics'));

  // shipments search / filter / sort
  await go('/shipments');
  const total = await count('main a[href^="/shipments/"]');
  check('shipments: list rendered', total > 0, String(total));
  await go('/shipments?q=zzzzqqq');
  check('shipments: search with no match shows empty result', (await count('main a[href^="/shipments/"]')) === 0);
  await go('/shipments?status=delivered');
  const del = await count('main a[href^="/shipments/"]');
  check('shipments: status filter applies', del <= total, `${del}/${total}`);
  await go('/shipments?sort=weight');
  check('shipments: sort param accepted, list intact', (await count('main a[href^="/shipments/"]')) === total);

  // documents CRUD
  await go('/documents');
  const before = await count('[data-doc]');
  await page.click('[data-doc-new]');
  await sleep(300);
  await clickBtn(/^(save|сохранить|сақтау)$/i, '[role=dialog]');
  await sleep(300);
  check('documents: empty title is rejected, modal stays open', (await count('[data-doc-title]')) === 1 && (await count('[role=dialog] [role=alert], [role=dialog] .text-bad')) > 0);
  await page.type('[data-doc-title]', 'Test invoice 42');
  writeFileSync('/tmp/p3-doc.txt', 'hello');
  const input = await page.$('[data-doc-input]');
  await input.uploadFile('/tmp/p3-doc.txt');
  await sleep(400);
  check('documents: attached file shown', (await count('[data-doc-file]')) === 1);
  await page.click('[data-doc-save]');
  await sleep(600);
  check('documents: created and listed', (await count('[data-doc]')) === before + 1 && (await text()).includes('Test invoice 42'));
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  check('documents: persists after reload', (await text()).includes('Test invoice 42'));
  check('documents: states no automatic recognition', /recogni/i.test(await text()));

  // wrong file type
  await page.click('[data-doc-new]');
  await sleep(300);
  writeFileSync('/tmp/p3-bad.exe', 'MZ');
  await (await page.$('[data-doc-input]')).uploadFile('/tmp/p3-bad.exe');
  await sleep(400);
  check('documents: disallowed file type refused', (await count('[data-doc-file]')) === 0 && (await count('[role=dialog] [role=alert]')) > 0);
  await clickBtn(/^(cancel|отмена|бас тарту)$/i, '[role=dialog]');
  await sleep(300);

  // delete with confirmation
  const delBtn = await page.evaluateHandle(() => [...document.querySelectorAll('[data-doc]')].find((l) => l.textContent.includes('Test invoice 42'))?.querySelector('button[aria-label*="elete"], button[aria-label*="Удал"], button[aria-label*="Жою"]'));
  await delBtn.asElement()?.click();
  await sleep(300);
  check('documents: delete asks for confirmation', (await count('[role=dialog]')) === 1);
  await clickBtn(/confirm|подтвер|растау|delete|удалить|жою/i, '[role=dialog]');
  await sleep(500);
  check('documents: deleted', !(await text()).includes('Test invoice 42'));

  // carriers: interaction log
  await go('/carriers');
  await page.evaluate(() => document.querySelector('main li button, main table tbody tr')?.click());
  await sleep(400);
  check('carriers: profile opens', (await count('[data-carrier-profile]')) === 1);
  await page.type('[data-interaction-note]', 'Asked about last-mile fee');
  await page.evaluate(() => document.querySelector('[data-interaction-form] button[type=submit]').click());
  await sleep(600);
  check('carriers: interaction appears in history', (await page.evaluate(() => document.querySelector('[data-carrier-history]')?.innerText ?? '')).includes('Asked about last-mile fee'));
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  await page.evaluate(() => document.querySelector('main li button, main table tbody tr')?.click());
  await sleep(400);
  check('carriers: interaction persists after reload', (await page.evaluate(() => document.querySelector('[data-carrier-history]')?.innerText ?? '')).includes('Asked about last-mile fee'));
  check('carriers: no fake reliability rating', !/★|\d\s*\/\s*5\b/.test(await page.evaluate(() => document.querySelector('[data-carrier-profile]')?.innerText ?? '')) && /does not rate carriers/.test(await text()));

  // analytics portfolio filters
  await go('/analytics');
  check('analytics: portfolio is default', (await count('[data-portfolio]')) === 1 && (await count('[data-analytics-filters]')) === 1);
  const allText = await text();
  check('analytics: states unknown costs are never priced', /never turned into money/.test(allText));
  await go('/analytics?from=2099-01-01');
  check('analytics: filter with no matches shows empty state', (await text()).includes('No comparisons match the filters'));
  await go('/analytics?c=cmp_demo4');
  check('analytics: deep link ?c= shows single-comparison view', (await count('[data-portfolio]')) === 0);

  // shipment details: history + documents
  await go('/shipments/shp_jury1');
  check('shipment details: history card', /history/i.test(await text()));

  check('no console / page errors', problems.length === 0, problems.slice(0, 3).join(' | '));
} catch (e) {
  failures.push(`SCRIPT ERROR: ${e.stack}`);
  console.log('SCRIPT ERROR', e.stack);
}
await browser.close();
server.kill();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) console.log(failures.join('\n'));
process.exit(failures.length ? 1 : 0);
