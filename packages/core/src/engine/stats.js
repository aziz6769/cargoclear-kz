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
