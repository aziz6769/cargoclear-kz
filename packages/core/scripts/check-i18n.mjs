// Verifies every i18n key used in the web app exists in ru/kk/en and that the three dictionaries have identical key sets.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ru } from '../src/i18n/ru.js';
import { kk } from '../src/i18n/kk.js';
import { en } from '../src/i18n/en.js';
import { COST_COMPONENTS, CARGO_CATEGORIES, ENDPOINTS, SHIPMENT_STATUSES, TRANSPORT_TYPES } from '../src/constants.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(p) ? [p] : [];
});
const PREFIXES = 'nav|common|dash|wiz|ship|offer|res|state|status|endpoint|comp|cs|cat|transport|shipStatus|hist|cmp|car|ana|set|empty|err|demo|app|q|v|an|ex|csv|rep|onb|gloss|country|as|doc|hx|svc';
const re = new RegExp(`['"\`]((?:${PREFIXES})\\.[A-Za-z0-9]+(?:\\.[A-Za-z0-9]+)*)['"\`]`, 'g');

const used = new Set();
for (const f of [...walk(join(root, 'apps/web/src')), ...walk(join(root, 'packages/core/src/engine')), ...walk(join(root, 'packages/core/src/assistant')), join(root, 'packages/core/src/schemas.js')]) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(re)) used.add(m[1]);
}
// dynamic keys
for (const k of ['quote', 'invoice', 'contract', 'transport']) used.add(`doc.type.${k}`);
for (const k of ['name', 'origin', 'destination', 'originCountry', 'destinationCountry', 'cargoDescription', 'requiredDate', 'shipDate', 'deliveryPoint', 'weightKg', 'volumeM3', 'category', 'packages', 'requirements', 'deliveryLevel', 'storageDays', 'insuranceRequired', 'customsRequired', 'specialHandling', 'contactName', 'phone', 'email', 'notes', 'routes', 'services']) used.add(`hx.field.${k}`);
for (const k of ['call', 'email', 'meeting', 'message', 'other']) used.add(`hx.channel.${k}`);
for (const k of ['shipment', 'carrier']) used.add(`hx.${k}.created`);
for (const k of ['pickup', 'loading', 'unloading', 'insurance', 'customs', 'storage', 'lastMile', 'handling']) used.add(`svc.${k}`);
for (const k of ['newest', 'oldest', 'name', 'weight', 'required']) used.add(`ship.sort.${k}`);
for (const k of ['fact', 'assumption', 'unknown', 'question', 'verdict', 'note']) used.add(`as.kind.${k}`);
for (const k of ['unknown', 'unknownNote', 'excluded', 'excludedNote']) used.add(`as.unk.${k}`);
for (const k of [...COST_COMPONENTS, 'base', 'additional']) used.add(`comp.${k}`);
for (const k of ['included', 'charged', 'excluded', 'unknown', 'na']) used.add(`cs.${k}`);
for (const k of CARGO_CATEGORIES) used.add(`cat.${k}`);
for (const k of TRANSPORT_TYPES) used.add(`transport.${k}`);
for (const k of ENDPOINTS) used.add(`endpoint.${k}`);
for (const k of SHIPMENT_STATUSES) used.add(`shipStatus.${k}`);
for (const k of ['included', 'charged', 'extra', 'excluded', 'unknown', 'na']) used.add(`state.${k}`);
for (const k of ['complete', 'partial', 'incomplete']) used.add(`status.${k}`);
for (const k of ['base', 'charge', 'endpoint', ...COST_COMPONENTS]) used.add(`q.${k}`);
for (const k of ['not_found', 'in_use', 'invalid']) used.add(`err.${k}`);
for (const k of ['wiz.step1', 'wiz.step2']) used.add(k);
for (const term of ['terminal', 'lastMile', 'storage', 'customs', 'handling', 'unloading', 'fuel', 'pickup', 'endpoint']) {
  used.add(`gloss.${term}.t`);
  used.add(`gloss.${term}.d`);
}
for (const c of ['KZ', 'RU', 'CN', 'KG', 'UZ', 'TR', 'DE', 'OTHER']) used.add(`country.${c}`);
for (const k of ['overview', 'offers', 'cost', 'coverage', 'unknown', 'endpoint', 'questions', 'final']) {
  used.add(`demo.s.${k}.title`);
  used.add(`demo.s.${k}.text`);
}
for (const k of ['base_missing', 'amount_missing', 'excluded', 'unknown']) used.add(`demo.reason.${k}`);
for (const k of [1, 2, 3, 4, 5, 6, 7]) used.add(`rep.method.${k}`);
for (const k of [1, 2, 3]) { used.add(`onb.step${k}.t`); used.add(`onb.step${k}.d`); }
for (const k of ['comparable', 'not', 'partial']) used.add(`ex.verdict.${k}`);
for (const k of ['currency', 'endpoint']) used.add(`ex.reason.${k}`);
for (const k of ['exceeds', 'may']) used.add(`ex.bound.${k}`);

let bad = 0;
for (const [name, d] of Object.entries({ ru, kk, en })) {
  const missing = [...used].filter((k) => !(k in d));
  if (missing.length) { bad++; console.log(`${name}: MISSING ${missing.length}\n  ${missing.join('\n  ')}`); }
}
const keys = (d) => new Set(Object.keys(d));
for (const [n, d] of [['kk', kk], ['en', en]]) {
  const extra = [...keys(d)].filter((k) => !(k in ru));
  const lack = [...keys(ru)].filter((k) => !(k in d));
  if (extra.length || lack.length) { bad++; console.log(`${n}: extra=[${extra}] lacking=[${lack}]`); }
}
const unused = Object.keys(ru).filter((k) => !used.has(k));
if (unused.length) console.log(`note: ${unused.length} keys not referenced by a literal: ${unused.slice(0, 15).join(', ')}${unused.length > 15 ? '…' : ''}`);
console.log(bad ? 'i18n check FAILED' : `i18n OK (${used.size} keys used, ${Object.keys(ru).length} defined)`);
process.exit(bad ? 1 : 0);
