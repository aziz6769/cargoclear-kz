// Jury-flow check in a real browser: launch demo -> 8 presentation steps -> results -> CSV -> report -> RU/KK/EN -> mobile,
// plus proof that launching/resetting the demo never touches user-created data.
// Usage: npm run build && node scripts/jury-flow.mjs [--shots]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const SHOTS_ON = process.argv.includes('--shots');
const PORT = 4175;
const BASE = `http://localhost:${PORT}`;
const SHOTS = new URL('../../../shots/jury/', import.meta.url).pathname;
if (SHOTS_ON) mkdirSync(SHOTS, { recursive: true });
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
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error@${page.url()}: ${m.text()}`); });
const dl = mkdtempSync(join(tmpdir(), 'cc-dl-'));
const cdp = await page.createCDPSession();
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });

let passed = 0;
const failures = [];
const check = (name, cond, extra = '') => {
  if (cond) passed++; else failures.push(`${name} ${extra}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' ' + extra}`);
};
const text = () => page.evaluate(() => document.body.innerText);
const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle0' }); await sleep(300); };
const shot = async (n) => { if (SHOTS_ON) await page.screenshot({ path: `${SHOTS}${n}.png`, fullPage: true }); };
const clickSel = async (sel) => { await page.waitForSelector(sel, { timeout: 5000 }); await page.click(sel); await sleep(250); };
const clickText = (sel, label) =>
  page.evaluate((sel, label) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(label));
    if (!el) return false;
    el.click();
    return true;
  }, sel, label);
const next = async () => { await clickSel('[data-demo-next]'); };
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const money = (n) => new RegExp(`${String(n).slice(0, -3)}[\\s\\u00a0\\u202f]000`);

try {
  // 1. open the application (first visit): onboarding explains the product
  await go('/');
  let t = await text();
  check('1. first visit: value proposition visible', t.includes('Сравнивайте реальную стоимость доставки, а не только цену в предложении'));
  check('1. first visit: "Запустить демо" and "Новое сравнение" actions', t.includes('Запустить демо') && t.includes('Новое сравнение'));
  check('1. local-storage honesty note', t.includes('только в вашем браузере'));
  await shot('01-welcome');

  // seed a USER record that must survive every demo launch/reset
  await page.evaluate(() => new Promise((res, rej) => {
    const rq = indexedDB.open('cargoclear-kz');
    rq.onerror = () => rej(rq.error);
    rq.onsuccess = () => {
      const db = rq.result;
      const tx = db.transaction('shipments', 'readwrite');
      tx.objectStore('shipments').put({
        id: 'shp_user_marker', name: 'USER-MARKER-ГРУЗ', origin: 'Тест', destination: 'Тест', deliveryPoint: 'Тест', weightKg: 1, volumeM3: 1,
        category: 'general', packages: 1, requirements: '', deliveryLevel: 'warehouse', storageDays: 0, insuranceRequired: false,
        customsRequired: false, specialHandling: false, status: 'draft', isDemo: false, createdAt: new Date().toISOString(),
      });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    };
  }));
  await go('/');

  // 2. launch the demo
  await clickSel('[data-welcome-demo]');
  await page.waitForFunction(() => location.pathname === '/demo', { timeout: 8000 });
  await sleep(600);
  t = await text();
  check('2. demo opens at /demo with the fictional-data banner', t.includes('все цифры вымышленные'));
  check('3. shipment overview: Алматы → Туркестан', t.includes('Алматы → Туркестан') && t.includes('Товары для магазина'));
  await shot('02-demo-overview');

  // 4. three offers, lowest quote highlighted
  await next();
  t = await text();
  check('4. three offers with quoted prices 180 000 / 215 000 / 165 000', money(180000).test(t) && money(215000).test(t) && money(165000).test(t) && t.includes('Carrier A') && t.includes('Carrier C'));
  check('4. lowest quote is marked', t.includes('Самая низкая цена'));
  await shot('03-demo-offers');

  // cost comparison
  await next();
  t = await text();
  check('5. cost comparison: only Carrier B has a comparable total (215 000)', money(215000).test(t) && t.includes('Сопоставимо') && t.includes('Несопоставимо') && t.includes('Частично сопоставимо'));
  check('5. incomplete offers do not show a total', (t.match(/Требуется дополнительная информация/g) ?? []).length === 2);
  await shot('04-demo-cost');

  // coverage
  await next();
  t = await text();
  check('6. coverage matrix: included vs excluded vs not confirmed', t.includes('Включено') && t.includes('Не входит в предложение') && t.includes('Стоимость не подтверждена'));

  // unknown expenses
  await next();
  t = await text();
  check('7. unknown expenses listed per carrier (unloading, last mile, fuel, terminal handling)', ['Разгрузка', 'Доставка последней мили', 'Топливная надбавка', 'Терминальная обработка'].every((x) => t.includes(x)));
  check('7. "never zero" statement shown', t.includes('никогда не считаются нулём'));
  await shot('05-demo-unknown');

  // endpoint warnings
  await next();
  t = await text();
  check('8. delivery endpoint warnings for A and C, B reaches destination', (t.match(/до конечной точки нужны доп\. расходы/g) ?? []).length === 2 && t.includes('Доезжает до конечной точки'));

  // questions
  await next();
  t = await text();
  check('9. clarification questions generated', t.includes('Включена ли разгрузка') && t.includes('топливная надбавка') && t.includes('Терминальная обработка'));
  await shot('06-demo-questions');

  // final
  await next();
  t = await text();
  check('10. final: lowest quote is not the best comparable offer', t.includes('Самая низкая цена в предложении — не лучшее сопоставимое предложение'));
  check('10. final: automated analysis labelled as not AI', t.includes('а не модель ИИ'));
  check('10. final: step-by-step lines present', t.includes('Базовая цена по предложению') && t.includes('Подтверждённая стоимость'));
  check('10. final: no fabricated savings claim', !/гарантированн[а-я]+ экономи/.test(t.replace('не гарантированная экономия', '').replace('не гарантирует экономию', '')));
  await shot('07-demo-final');

  // keyboard navigation
  await page.keyboard.press('ArrowLeft');
  await sleep(200);
  check('keyboard ← goes back a step', (await text()).includes('Вопросы перевозчикам'));

  // 11. reset demo leaves user data alone, and restores edited demo data
  await clickSel('[data-demo-reset]');
  await sleep(500);
  check('reset demo returns to step 1', (await text()).includes('Ситуация'));
  await go('/shipments');
  t = await text();
  check('user data survives launch + reset of the demo', t.includes('USER-MARKER-ГРУЗ'));
  check('demo shipment present exactly once after reset', (t.match(/Товары для магазина/g) ?? []).length === 1, String((t.match(/Товары для магазина/g) ?? []).length));

  // 12. shipment details page
  await go('/shipments/shp_jury1');
  t = await text();
  check('shipment details: fields, comparison and 3 offers', t.includes('Данные груза') && t.includes('Демо: Алматы → Туркестан') && t.includes('Carrier B') && t.includes('Полученные предложения'));
  await shot('08-shipment-details');

  // full results: expand + calculation + status column
  await go('/comparisons/cmp_jury1');
  t = await text();
  check('results: auto-analysis card + comparison statuses', t.includes('Автоматический анализ') && t.includes('Статус сравнения'));
  const before = await page.$$eval('[data-expand][aria-expanded="true"]', (n) => n.length);
  await clickText('[data-expand]', 'Как рассчитано');
  await sleep(250);
  const after = await page.$$eval('[data-expand][aria-expanded="true"]', (n) => n.length);
  check('results: expandable calculation section opens', after === before + 1);
  t = await text();
  check('results: expansion explains why the offer is (not) comparable', t.includes('Подтверждённая стоимость') && (t.includes('Не подтверждено, нулём не считается') || t.includes('Несопоставимо:')));
  await shot('09-results-desktop');

  // CSV export
  await page.evaluate(() => {
    window.__dl = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patched() { window.__dl.push(this.download); return orig.call(this); };
  });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Экспорт CSV'))?.click());
  let file = null;
  for (let i = 0; i < 20 && !file; i++) { await sleep(250); file = readdirSync(dl)[0]; }
  check('13. CSV downloaded', !!file);
  const names = await page.evaluate(() => window.__dl);
  check('13. CSV file name is meaningful (.csv)', /^cargoclear-.+\.csv$/.test(names[0] ?? ''), JSON.stringify(names));
  if (file) {
    const csv = readFileSync(join(dl, file), 'utf8');
    check('13. CSV sections: shipment, offers, breakdown, unknown list', ['ГРУЗ', 'ПРЕДЛОЖЕНИЯ', 'СТРУКТУРА ЗАТРАТ', 'НЕПОДТВЕРЖДЁННЫЕ ЗАТРАТЫ'].every((x) => csv.includes(x)));
    check('13. CSV has no zero for unknown amounts', !/Топливная надбавка,Стоимость не подтверждена,0/.test(csv) && /Carrier A,KZT,180000/.test(csv));
    check('13. CSV is UTF-8 with BOM (opens in Excel)', csv.charCodeAt(0) === 0xfeff);
  }

  // printable report
  await go('/comparisons/cmp_jury1/report');
  t = await text();
  check('13. report: branding, date, shipment, table, breakdown, missing info, questions, calculation, methodology', ['CargoClear', 'Отчёт о сравнении', 'Дата отчёта', 'Сравнение предложений', 'Структура затрат', 'Недостающая информация', 'Расчёт по каждому предложению', 'Методология расчёта'].every((x) => t.includes(x)));
  check('13. report: demo + local-storage notes', t.includes('Демонстрационные данные') && t.includes('IndexedDB'));
  await page.emulateMediaType('print');
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  await page.emulateMediaType('screen');
  check('13. report prints to PDF (A4, non-empty, multi-page ok)', pdf.length > 20000, String(pdf.length));
  check('13. report: toolbar hidden in print', await (async () => { await page.emulateMediaType('print'); const r = await page.evaluate(() => [...document.querySelectorAll('button')].every((b) => b.offsetParent === null || getComputedStyle(b).display === 'none')); await page.emulateMediaType('screen'); return r; })());
  await shot('10-report');

  // 14. languages inside the demo
  await go('/demo');
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="language"] button')].find((b) => b.textContent.trim() === 'en').click());
  await sleep(900);
  t = await text();
  check('14. EN: demo regenerated in English (names, texts)', t.includes('The situation') && t.includes('Almaty → Turkestan') && t.includes('Retail store goods'), t.slice(0, 200));
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="language"] button')].find((b) => b.textContent.trim() === 'kk').click());
  await sleep(900);
  t = await text();
  check('14. KK: demo regenerated in Kazakh', t.includes('Жағдай') && t.includes('Алматы → Түркістан'), t.slice(0, 200));
  await next(); await next();
  check('14. KK: statuses localized', (await text()).includes('Салыстыруға') );
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="language"] button')].find((b) => b.textContent.trim() === 'ru').click());
  await sleep(900);
  await go('/shipments');
  check('14. user data still intact after language-triggered rebuilds', (await text()).includes('USER-MARKER-ГРУЗ'));

  // 15. mobile
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  for (const path of ['/', '/demo', '/comparisons/cmp_jury1', '/comparisons/cmp_jury1/report', '/shipments/shp_jury1']) {
    await go(path);
    const o = await overflow();
    check(`15. mobile 390px no horizontal overflow: ${path}`, o <= 1, `overflow=${o}`);
  }
  await go('/demo');
  for (let i = 0; i < 7; i++) {
    await next();
    const o = await overflow();
    if (o > 1) { check(`15. mobile demo step ${i + 2} no overflow`, false, `overflow=${o}`); break; }
    if (i === 6) check('15. mobile demo: all 8 steps without horizontal overflow', true);
  }
  await shot('11-demo-mobile-final');
  await go('/comparisons/cmp_jury1');
  await shot('12-results-mobile');
} catch (e) {
  failures.push(`SCRIPT ERROR: ${e.stack}`);
  console.log('SCRIPT ERROR', e);
}
check('no console errors / page errors', problems.length === 0, problems.slice(0, 5).join(' | '));
await browser.close();
server.kill();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
