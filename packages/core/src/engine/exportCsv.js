import { COST_COMPONENTS } from '../constants.js';
import { formatMoney } from '../money.js';

// Neutralise spreadsheet formula injection: a cell that starts with = + - @ is prefixed with '.
const safe = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const row = (cells) => cells.map(safe).join(',');

/**
 * One comparison -> CSV text (sections separated by a blank line):
 * shipment, offers + status, expense breakdown, unknown expenses.
 * Unknown amounts are exported as empty cells with the state spelled out, never as 0.
 */
export function comparisonToCsv(view, t, lang = 'ru') {
  const { shipment: s, entries, result } = view;
  const out = [];
  const money = (v, c) => (v === null || v === undefined ? '' : v);
  const stateText = (st) => t(`state.${st}`);

  out.push(row([t('csv.section.shipment')]));
  out.push(row([t('ship.name'), s.name]));
  out.push(row([t('csv.route'), `${s.origin} → ${s.destination}`]));
  out.push(row([t('ship.deliveryPoint'), s.deliveryPoint]));
  out.push(row([t('ship.category'), t(`cat.${s.category}`)]));
  out.push(row([t('csv.weight'), s.weightKg]));
  out.push(row([t('csv.volume'), s.volumeM3]));
  out.push(row([t('csv.packages'), s.packages]));
  out.push(row([t('csv.comparison'), view.comparison.name]));
  out.push(row([t('csv.status'), t(`status.${result.status}`)]));
  out.push(row([t('csv.demo'), view.comparison.isDemo ? t('common.demo') : '']));
  out.push('');

  out.push(row([t('csv.section.offers')]));
  out.push(
    row([
      t('csv.carrier'), t('csv.currency'), t('csv.quoted'), t('csv.confirmedExtra'), t('csv.knownCost'),
      `${t('csv.comparableTotal')} (${result.baseCurrency})`, t('csv.endpoint'), t('csv.days'), t('csv.offerStatus'), t('csv.unknownCount'),
    ]),
  );
  for (const e of entries) {
    const a = e.analysis;
    out.push(
      row([
        e.carrier?.name ?? '', a.currency, money(a.price), money(Math.round((a.lowerBound - (a.price ?? 0)) * 100) / 100),
        money(a.lowerBound), money(e.item.total), t(`endpoint.${e.offer.endpoint}`), a.deliveryDays ?? '',
        t(`status.${e.item.comparability === 'comparable' ? 'complete' : e.item.comparability === 'partial' ? 'partial' : 'incomplete'}`),
        a.missing.length,
      ]),
    );
  }
  out.push('');

  out.push(row([t('csv.section.breakdown')]));
  out.push(row([t('csv.carrier'), t('csv.item'), t('csv.itemState'), t('csv.amount'), t('csv.currency')]));
  for (const e of entries) {
    out.push(row([e.carrier?.name ?? '', t('comp.base'), e.analysis.price === null ? stateText('unknown') : t('state.charged'), money(e.analysis.price), e.analysis.currency]));
    for (const r of e.analysis.rows) {
      out.push(row([e.carrier?.name ?? '', t(`comp.${r.key}`), stateText(r.state), money(r.amount), e.analysis.currency]));
    }
    for (const c of e.analysis.additional.items) {
      out.push(row([e.carrier?.name ?? '', c.name || t('comp.additional'), c.amount === null ? stateText('unknown') : stateText('charged'), money(c.amount), e.analysis.currency]));
    }
  }
  out.push('');

  out.push(row([t('csv.section.unknown')]));
  out.push(row([t('csv.carrier'), t('csv.item'), t('csv.question')]));
  for (const e of entries) {
    for (const q of e.questions) out.push(row([e.carrier?.name ?? '', q.id.startsWith('charge:') ? q.id.slice(7) : t(`comp.${q.id === 'endpoint' ? 'lastMile' : q.id}`), t(q.key, q.params)]));
  }
  out.push('');
  out.push(row([t('csv.generated'), new Date().toISOString().slice(0, 10)]));
  return '﻿' + out.join('\r\n');
}

