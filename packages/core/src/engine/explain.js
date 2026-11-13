import { formatMoney } from '../money.js';

/**
 * Human-readable, step-by-step explanation of how one offer's result was obtained.
 * Pure: takes a translator `t` and language, returns { lines, verdict, reasons }.
 * Every number comes from the analysis; nothing is recomputed differently from the engine.
 */
export function explainOffer(entry, result, t, lang = 'ru') {
  const { analysis: a, item, offer } = entry;
  const money = (v, cur = a.currency) => formatMoney(v, cur, lang);
  const label = (k) => (k === 'additional' ? t('comp.additional') : t(`comp.${k}`));
  const lines = [];

  lines.push({ kind: 'base', text: a.price === null ? t('ex.baseMissing') : t('ex.base', { amount: money(a.price) }) });

  const included = a.rows.filter((r) => r.state === 'included').map((r) => label(r.key));
  for (const r of a.rows) {
    if (r.state === 'charged') lines.push({ kind: 'plus', text: t('ex.charged', { label: label(r.key), amount: money(r.amount) }) });
    if (r.state === 'extra') lines.push({ kind: 'plus', text: t('ex.extra', { label: label(r.key), amount: money(r.amount) }) });
  }
  for (const c of a.additional.items) {
    lines.push({
      kind: c.amount === null ? 'missing' : 'plus',
      text: c.amount === null ? t('ex.chargeUnknown', { name: c.name || '—' }) : t('ex.charge', { name: c.name || '—', amount: money(c.amount) }),
    });
  }
  if (included.length) lines.push({ kind: 'info', text: t('ex.included', { list: included.join(', ') }) });
  const na = a.rows.filter((r) => r.state === 'na').map((r) => label(r.key));
  if (na.length) lines.push({ kind: 'info', text: t('ex.na', { list: na.join(', ') }) });

  lines.push({ kind: 'sum', text: t('ex.known', { amount: money(a.lowerBound) }) });

  const missingLabels = [
    ...new Set(a.missing.filter((m) => m.key !== 'charge').map((m) => (m.key === 'base' ? t('comp.base') : label(m.key)))),
  ];
  if (missingLabels.length) lines.push({ kind: 'missing', text: t('ex.missingHead', { list: missingLabels.join(', ') }) });

  if (a.currency !== result.baseCurrency) {
    lines.push({
      kind: 'info',
      text: item.currencyBlocked
        ? t('ex.noRate', { cur: a.currency, base: result.baseCurrency })
        : t('ex.rate', { cur: a.currency, rate: item.rate, base: result.baseCurrency, amount: money(item.total ?? item.lowerBound, result.baseCurrency) }),
    });
  }

  const reasons = [];
  if (item.currencyBlocked) reasons.push(t('ex.reason.currency', { cur: a.currency }));
  if (a.destination.gap)
    reasons.push(
      t('ex.reason.endpoint', { endpoint: t(`endpoint.${offer.endpoint}`), target: t('ex.target') }),
    );

  let verdict;
  if (item.comparability === 'comparable') verdict = t('ex.verdict.comparable', { amount: money(item.total, result.baseCurrency) });
  else if (item.comparability === 'not_comparable') verdict = t('ex.verdict.not', { reasons: reasons.join('; ') });
  else verdict = t('ex.verdict.partial', { amount: money(a.lowerBound) });

  const bound =
    item.bound === 'exceeds_best' ? t('ex.bound.exceeds') : item.bound === 'may_be_cheaper' ? t('ex.bound.may') : null;

  return { lines, verdict, reasons, bound, comparability: item.comparability };
}
