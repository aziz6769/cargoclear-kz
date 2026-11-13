// Real-browser end-to-end check against the production build (vite preview) using system Chrome.
// Usage: npm run build && node scripts/e2e.mjs
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const SHOTS = new URL('../../../shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* wait */ }
  await sleep(250);
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', async (m) => {
  if (m.type() !== 'error') return;
  const parts = await Promise.all(m.args().map((a) => a.evaluate((x) => (x instanceof Error ? x.stack : String(x))).catch(() => '?')));
  problems.push(`console.error@${page.url()}: ${m.text()} ${parts.join(' ')}`);
});

let passed = 0;
const failures = [];
const check = (name, cond, extra = '') => {
  if (cond) passed++;
  else failures.push(`${name} ${extra}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' ' + extra}`);
};
const text = () => page.evaluate(() => document.body.innerText);
const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle0' }); await sleep(250); };
const shot = (n) => page.screenshot({ path: `${SHOTS}${n}.png`, fullPage: true });
const clickText = (sel, label) =>
  page.evaluate((sel, label) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(label));
    if (!el) return false;
    el.click();
    return true;
  }, sel, label);
const seg = (row, option) =>
  page.evaluate((row, option) => {
    const r = [...document.querySelectorAll('[class*="170px_auto_1fr"]')].find((d) => d.firstElementChild.textContent.trim().startsWith(row));
    const b = r && [...r.querySelectorAll('button')].find((x) => x.textContent.trim() === option);
    if (!b) return false;
    b.click();
    return true;
  }, row, option);

try {
  // ---- Dashboard ----
  await go('/');
  let t = await text();
  check('dashboard: welcome', t.includes('Добро пожаловать в CargoClear KZ'));
  check('dashboard: +New Comparison button', t.includes('Новое сравнение'));
  check('dashboard: demo disclaimer', t.includes('вымышленные'));
  check('dashboard: 5 comparisons shown in stats', /Всего сравнений\s*\n?\s*5/.test(t));
  check('dashboard: onboarding welcome (30-second explanation)', t.includes('Сравнивайте реальную стоимость доставки') && t.includes('Запустить демо'));
  check('dashboard: avg offers per comparison = 3', /Предложений на сравнение\s*\n?\s*3/.test(t), t.match(/Предложений на сравнение[\s\S]{0,40}/)?.[0]);
  check('dashboard: incomplete comparisons KPI', /Сравнения с неполными данными\s*\n?\s*[1-5]/.test(t));
  check('dashboard: 3 charts rendered', (await page.$$eval('[data-charts] .recharts-responsive-container', (n) => n.length)) === 3);
  check('dashboard: recent shipments section', t.includes('Последние грузы'));
  // hand-computed: cmp1 30k + cmp2 25k + cmp3 (single complete offer, no rate) 0 + cmp4 32k + cmp5 33k
  const sav = t.match(/Потенциальная экономия[\s\S]{0,40}/)?.[0] ?? '';
  check('dashboard: potential savings = 120 000 ₸', /120[\s\u00a0\u202f]000/.test(sav), JSON.stringify(sav));
  await shot('01-dashboard');

  // ---- Results: terminal vs warehouse case ----
  await go('/comparisons/cmp_demo1');
  t = await text();
  check('results: best offer total 515 000 ₸', /515[\s  ]000/.test(t));
  check('results: shows "Стоимость не подтверждена"', t.includes('Стоимость не подтверждена'));
  check('results: shows "Не входит в предложение"', t.includes('Не входит в предложение'));
  check('results: shows "Требуется дополнительная информация"', t.includes('Требуется дополнительная информация'));
  check('results: endpoint mismatch warning', t.includes('Предложения заканчиваются в разных точках'));
  check('results: cheapest-base != best warning', t.includes('Самая низкая цена перевозки'));
  check('results: questions list', t.includes('Что спросить у перевозчиков') && t.includes('Включена ли доставка последней мили'));
  check('results: unknown never shown as 0 ₸ for КазТранзит final', !/Итоговая сопоставимая стоимость[^\n]*\n?[^\n]*\b0 ₸/.test(t));
  await shot('02-results-cmp1');

  await go('/comparisons/cmp_demo3');
  t = await text();
  check('results: USD offer demands exchange rate', t.includes('Нужен курс валюты'));
  await shot('03-results-currency');

  // ---- Wizard: create a comparison ----
  await go('/compare/new');
  await page.type('input[name="shipment.name"]', 'E2E груз');
  await page.type('input[name="shipment.origin"]', 'Алматы');
  await page.type('input[name="shipment.destination"]', 'Астана');
  await page.type('input[name="shipment.deliveryPoint"]', 'Склад E2E');
  await page.type('input[name="shipment.weightKg"]', '1000');
  await page.type('input[name="shipment.volumeM3"]', '10');
  // validation: leave packages default, trigger errors by clearing name first
  await page.$eval('input[name="shipment.name"]', (el) => { el.focus(); });
  await clickText('button', 'Далее');
  await sleep(300);
  await page.type('input[name="name"]', 'E2E сравнение');
  check('wizard: reached step 2', (await text()).includes('Общая точка назначения'));

  await page.type('input[name="offers.0.carrierName"]', 'E2E Перевозчик А');
  await page.type('input[name="offers.0.price"]', '100000');
  check('wizard: segmented row present', await seg('Погрузка', 'Включено'));
  check('wizard: unloading -> billed', await seg('Разгрузка', 'Отдельно'));
  await page.type('input[name="offers.0.costs.unloading.amount"]', '10000');

  // open offer 2
  await clickText('button[aria-expanded]', 'Предложение 2');
  await sleep(150);
  await page.type('input[name="offers.1.carrierName"]', 'E2E Перевозчик Б');
  await page.type('input[name="offers.1.price"]', '90000');
  await page.select('select[name="offers.1.endpoint"]', 'terminal');
  await seg('Погрузка', 'Включено');
  await shot('04-wizard-step2');
  await clickText('button[type="submit"]', 'Сравнить');
  await page.waitForFunction(() => location.pathname.startsWith('/comparisons/') && !location.pathname.endsWith('/edit'), { timeout: 8000 });
  await sleep(400);
  const newUrl = page.url();
  t = await text();
  check('wizard: redirected to saved comparison', /\/comparisons\/[0-9a-f-]{36}/.test(newUrl), newUrl);
  check('wizard: offer A total = 110 000 ₸ (100k + 10k unloading)', /110[\s  ]000/.test(t));
  check('wizard: terminal offer B flagged incomplete, not ranked', t.includes('Нельзя сравнить, пока не уточнены затраты'));
  check('wizard: B questions include last mile + storage', t.includes('последней мили') && t.includes('хранение'));
  await shot('05-wizard-result');

  // ---- Persistence ----
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  check('persistence: comparison survives reload', (await text()).includes('E2E сравнение'));
  await go('/carriers');
  check('persistence: carrier auto-created from wizard', (await text()).includes('E2E Перевозчик А'));

  // ---- History: search, duplicate, delete ----
  await go('/history');
  await page.type('input[aria-label="Поиск"]', 'E2E');
  await sleep(200);
  t = await text();
  check('history: search narrows list', t.includes('E2E сравнение') && !t.includes('Стройматериалы в Шымкент'));
  await page.click('button[aria-label="Дублировать"]');
  await page.waitForFunction(() => /\/comparisons\/[0-9a-f-]{36}/.test(location.pathname), { timeout: 8000 });
  await sleep(300);
  check('history: duplicate opens copy', (await text()).includes('(копия)'));
  await go('/history');
  const rowsBefore = await page.$$eval('tbody tr', (r) => r.length);
  await page.type('input[aria-label="Поиск"]', 'E2E');
  await sleep(150);
  await page.click('button[aria-label="Удалить"]');
  await sleep(150);
  await clickText('div[role="dialog"] button', 'Удалить');
  await sleep(500);
  const rowsAfter = await page.$$eval('tbody tr', (r) => r.length);
  check('history: delete removes a row', rowsAfter === rowsBefore - 1 || rowsAfter < 2, `${rowsBefore}->${rowsAfter}`);
  await shot('06-history');

  // ---- Shipments guard ----
  await go('/shipments');
  check('shipments: list populated', (await text()).includes('Офисная мебель'));
  await page.click('button[aria-label="Удалить"]');
  await sleep(150);
  await clickText('div[role="dialog"] button', 'Удалить');
  await sleep(400);
  check('shipments: deleting a shipment used by a comparison is refused', (await text()).includes('Нельзя удалить'));
  await shot('07-shipments');

  // ---- Carriers ----
  await go('/carriers');
  check('carriers: demo carriers flagged', (await text()).includes('ДЕМО') || (await text()).includes('Демо'));
  await shot('08-carriers');

  // ---- Analytics ----
  await go('/analytics?c=cmp_demo4');
  await sleep(600);
  const svgs = await page.$$eval('.recharts-wrapper svg', (e) => e.length);
  check('analytics: 5 Recharts charts rendered', svgs >= 5, `svgs=${svgs}`);
  const bars = await page.$$eval('.recharts-bar-rectangle', (e) => e.length);
  check('analytics: bars drawn from real data', bars >= 10, `bars=${bars}`);
  await shot('09-analytics');

  // ---- Settings: language + exchange rate effect ----
  await go('/settings');
  await page.type('input[name="rates.USD"]', '480');
  await clickText('button[type="submit"]', 'Сохранить');
  await sleep(500);
  await go('/comparisons/cmp_demo3');
  t = await text();
  check('settings: USD rate 480 unblocks offer, best = 600 000 ₸', /600[\s  ]000/.test(t) && !t.includes('Нужен курс валюты'));
  await shot('10-results-with-rate');

  await go('/settings');
  await clickText('button', 'English');
  await sleep(500);
  t = await text();
  check('i18n: switch to English works', t.includes('Interface language') && t.includes('Dashboard'));
  await go('/');
  check('i18n: English persists across reload', (await text()).includes('Welcome to CargoClear KZ'));
  await go('/settings');
  await clickText('button', 'Қазақша');
  await sleep(400);
  await go('/');
  check('i18n: Kazakh works', (await text()).includes('CargoClear KZ-ке қош келдіңіз'));
  await shot('11-dashboard-kk');
  await go('/settings');
  await clickText('button', 'Русский');
  await sleep(300);

  // ---- Mobile viewport smoke ----
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await go('/');
  const nav = await page.$('nav.fixed');
  check('mobile: bottom navigation visible', !!nav && (await nav.isIntersectingViewport()));
  await shot('12-mobile-dashboard');
  await go('/comparisons/cmp_demo1');
  await shot('13-mobile-results');

  check('no console errors / page errors', problems.length === 0, problems.slice(0, 5).join(' | '));
} catch (e) {
  failures.push(`SCRIPT ERROR: ${e.stack}`);
  console.log('SCRIPT ERROR', e);
  await shot('error').catch(() => {});
} finally {
  await browser.close();
  server.kill();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) console.log(failures.join('\n'));
process.exit(failures.length ? 1 : 0);
