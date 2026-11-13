// Responsive audit in real Chrome: horizontal overflow, clipped numbers, tap-target size, per width x route x language.
// Usage: npm run build && node scripts/responsive.mjs [--shots]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 4174;
const BASE = `http://localhost:${PORT}`;
const SHOTS = new URL('../../../shots/resp/', import.meta.url).pathname;
const withShots = process.argv.includes('--shots');
if (withShots) mkdirSync(SHOTS, { recursive: true });

const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* wait */ }
  await sleep(250);
}
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// Pages: [name, path, optional action]
const clickText = (sel, label) => page.evaluate((sel, label) => { const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(label)); if (el) el.click(); return !!el; }, sel, label);
const ROUTES = [
  ['dashboard', '/'],
  ['results', '/comparisons/cmp_demo1'],
  ['results-expanded', '/comparisons/cmp_demo1', async () => { for (let i = 0; i < 6; i++) await page.evaluate(() => document.querySelectorAll('[data-expand]').forEach((b) => b.getAttribute('aria-expanded') === 'false' && b.click())); await sleep(150); }],
  ['results-usd', '/comparisons/cmp_demo3'],
  ['wizard-step1', '/compare/new?shipmentId=shp_demo01'],
  ['wizard-step2', '/comparisons/cmp_demo1/edit', async () => { await clickText('button', t.next); await sleep(300); }],
  ['comparisons', '/comparisons'],
  ['history', '/history'],
  ['shipments', '/shipments'],
  ['shipment-modal', '/shipments', async () => { await clickText('button', t.newShipment); await sleep(300); }],
  ['carriers', '/carriers'],
  ['carrier-modal', '/carriers', async () => { await clickText('button', t.newCarrier); await sleep(300); }],
  ['analytics', '/analytics?c=cmp_demo4'],
  ['settings', '/settings'],
];
let t = {};
const LANGS = {
  ru: { next: 'Далее', newShipment: 'Новый груз', newCarrier: 'Новый перевозчик' },
  kk: { next: 'Әрі қарай', newShipment: 'Жаңа жүк', newCarrier: 'Жаңа тасымалдаушы' },
  en: { next: 'Next', newShipment: 'New shipment', newCarrier: 'New carrier' },
};

async function audit() {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const doc = document.documentElement;
    const out = { pageOverflow: doc.scrollWidth - vw, offenders: [], clipped: [], smallTargets: [] };
    const scrollAncestor = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (getComputedStyle(el).position === 'fixed') continue;
      if ((r.right > vw + 1 || r.left < -1) && !scrollAncestor(el)) {
        out.offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} "${el.textContent.trim().slice(0, 25)}" right=${Math.round(r.right)}`);
      }
      // financial values must not be cut off
      if (el.classList.contains('tabular') && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') {
        out.clipped.push(el.textContent.trim().slice(0, 30));
      }
      if (vw < 768 && ['BUTTON', 'A', 'SELECT', 'INPUT'].includes(el.tagName) && !el.closest('[data-skip-target]')) {
        if ((r.height < 36 || r.width < 36) && el.type !== 'checkbox' && el.type !== 'hidden') {
          out.smallTargets.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
    }
    out.offenders = [...new Set(out.offenders)].slice(0, 5);
    out.smallTargets = [...new Set(out.smallTargets)].slice(0, 5);
    return out;
  });
}

let bad = 0;
let total = 0;
const report = [];
for (const [lang, labels] of Object.entries(LANGS)) {
  t = labels;
  const widths = lang === 'ru' ? WIDTHS : [320, 390, 768];
  for (const w of widths) {
    await page.setViewport({ width: w, height: 800, isMobile: w < 768, hasTouch: w < 768, deviceScaleFactor: 1 });
    // set language via IndexedDB-backed settings: go to page, use the topbar switcher
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await page.evaluate((l) => [...document.querySelectorAll('header button')].find((b) => b.textContent.trim().toLowerCase() === l)?.click(), lang);
    await sleep(300);
    for (const [name, path, action] of ROUTES) {
      await page.goto(BASE + path, { waitUntil: 'networkidle0' });
      await sleep(250);
      if (action) await action();
      const a = await audit();
      total++;
      const problems = [];
      if (a.pageOverflow > 0) problems.push(`page overflow +${a.pageOverflow}px`);
      if (a.offenders.length) problems.push(`offenders: ${a.offenders.join(' | ')}`);
      if (a.clipped.length) problems.push(`clipped numbers: ${a.clipped.join(', ')}`);
      if (a.smallTargets.length) problems.push(`small targets: ${a.smallTargets.join(' | ')}`);
      if (problems.length) { bad++; report.push(`[${lang} ${w}px ${name}] ${problems.join(' ; ')}`); }
      if (withShots && (lang === 'ru' ? [320, 390, 768, 1024].includes(w) : w === 320)) {
        await page.screenshot({ path: `${SHOTS}${lang}-${w}-${name}.png`, fullPage: true });
      }
    }
  }
}
await browser.close();
server.kill();
console.log(report.join('\n'));
console.log(`\n${total - bad}/${total} page-states clean; page errors: ${errors.length}${errors.length ? ' ' + errors.slice(0, 3).join(' | ') : ''}`);
process.exit(bad || errors.length ? 1 : 0);
