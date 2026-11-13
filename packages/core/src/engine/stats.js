import { COST_COMPONENTS } from '../constants.js';
import { isNum, round2 } from '../money.js';

/** Dashboard numbers. Averages/savings only use COMPLETE comparisons in the base currency. */
export function dashboardStats(views, shipments) {
  const bestTotals = views.map((v) => v.result.bestTotal).filter(isNum);
  const savings = views.map((v) => v.result.potentialSavings).filter(isNum);
  const notifications = views
    .filter((v) => v.missingCount > 0)
    .map((v) => ({
      comparisonId: v.comparison.id,
      name: v.comparison.name,
      missingCount: v.missingCount,
      incompleteOffers: v.incompleteCount,
    }))
    .sort((a, b) => b.missingCount - a.missingCount);

  return {
    totalComparisons: views.length,
    activeShipments: shipments.filter((s) => s.status === 'active').length,
    averageOffers: views.length ? round2(views.reduce((s, v) => s + v.entries.length, 0) / views.length) : null,
    incompleteComparisons: views.filter((v) => v.missingCount > 0).length,
    completeComparisons: views.filter((v) => v.missingCount === 0).length,
    averageBestCost: bestTotals.length ? round2(bestTotals.reduce((s, x) => s + x, 0) / bestTotals.length) : null,
    averageSample: bestTotals.length,
    potentialSavings: savings.length ? round2(savings.reduce((s, x) => s + x, 0)) : null,
    savingsSample: savings.length,
    notifications,
  };
}

/** Rows for a donut: confirmed money per component for one offer (base currency not applied; offer currency). */
export function componentDistribution(entry) {
  const a = entry.analysis;
  const out = [];
  if (isNum(a.price) && a.price > 0) out.push({ key: 'base', value: a.price });
  for (const r of a.rows) {
    if ((r.state === 'charged' || r.state === 'extra') && r.amount > 0) out.push({ key: r.key, value: r.amount });
  }
  if (a.additional.knownSum > 0) out.push({ key: 'additional', value: a.additional.knownSum });
  return out;
}

/** Stacked-bar rows per offer, converted to the base currency. Currency-blocked offers are omitted. */
export function carrierBreakdown(entries) {
  return entries
    .filter((e) => !e.item.currencyBlocked)
    .map((e) => {
      const rate = e.item.rate;
      const row = { offerId: e.offer.id, carrier: e.carrier?.name ?? '—', base: round2((e.analysis.price ?? 0) * rate) };
      for (const k of COST_COMPONENTS) {
        const r = e.analysis.rows.find((x) => x.key === k);
        row[k] = r && (r.state === 'charged' || r.state === 'extra') ? round2(r.amount * rate) : 0;
      }
      row.additional = round2(e.analysis.additional.knownSum * rate);
      row.extras = round2(
        COST_COMPONENTS.reduce((s, k) => s + row[k], 0) + row.additional,
      );
      return row;
    });
}

/** Counts of confirmed vs unconfirmed cost items per offer (unknown amounts are never charted as money). */
export function knownVsUnknown(entries) {
  return entries.map((e) => {
    const a = e.analysis;
    let known = 0;
    let unknown = 0;
    if (a.price !== null) known += 1;
    else unknown += 1;
    for (const r of a.rows) {
      if (r.state === 'included' || r.state === 'charged' || r.state === 'extra') known += 1;
      else if (r.state === 'excluded' || r.state === 'unknown') unknown += 1;
    }
    known += a.additional.items.length - a.additional.unknownCount;
    unknown += a.additional.unknownCount;
    return { offerId: e.offer.id, carrier: e.carrier?.name ?? '—', known, unknown };
  });
}

/**
 * Confirmed money per cost category, summed over the LEADING offer of every comparison that has one
 * (best comparable offer), in the base currency. Unknown amounts are never included.
 */
export function expenseByCategory(views) {
  const totals = {};
  let counted = 0;
  for (const v of views) {
    const best = v.entries.find((e) => e.offer.id === v.result.bestOfferId);
    if (!best || best.item.currencyBlocked) continue;
    counted += 1;
    const rate = best.item.rate;
    const add = (k, x) => {
      if (x > 0) totals[k] = round2((totals[k] ?? 0) + x * rate);
    };
    add('base', best.analysis.price ?? 0);
    for (const r of best.analysis.rows) if (r.state === 'charged' || r.state === 'extra') add(r.key, r.amount);
    add('additional', best.analysis.additional.knownSum);
  }
  return { totals, counted };
}

/** Per ISO week (Monday start), oldest first: comparisons created, and the sum of their best comparable totals (`spend`, only comparisons with a winner). */
export function activityByWeek(views, weeks = 8) {
  const monday = (iso) => {
    const d = new Date(iso);
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  };
  const map = new Map();
  for (const v of views) {
    if (!v.comparison.createdAt) continue;
    const k = monday(v.comparison.createdAt);
    const r = map.get(k) ?? { count: 0, spend: 0, priced: 0 };
    r.count += 1;
    if (isNum(v.result.bestTotal)) { r.spend = round2(r.spend + v.result.bestTotal); r.priced += 1; }
    map.set(k, r);
  }
  const keys = [...map.keys()].sort();
  if (!keys.length) return [];
  // fill gaps so the time axis is honest
  const out = [];
  const last = new Date(`${keys[keys.length - 1]}T00:00:00Z`);
  const first = new Date(`${keys[0]}T00:00:00Z`);
  for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 7)) {
    const k = d.toISOString().slice(0, 10);
    const r = map.get(k);
    out.push({ week: k, count: r?.count ?? 0, spend: r?.spend ?? 0, priced: r?.priced ?? 0 });
  }
  return out.slice(-weeks);
}

/** How many offers each carrier has submitted across all comparisons. */
export function offersByCarrier(views) {
  const map = new Map();
  for (const v of views)
    for (const e of v.entries) {
      const name = e.carrier?.name ?? '—';
      map.set(name, (map.get(name) ?? 0) + 1);
    }
  return [...map.entries()].map(([carrier, offers]) => ({ carrier, offers })).sort((a, b) => b.offers - a.offers);
}
