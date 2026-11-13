import { isNum, round2 } from '../money.js';
import { COST_COMPONENTS } from '../constants.js';

/**
 * Portfolio analytics over saved comparisons. All money is in the base currency and comes from the
 * calculation engine: a comparison contributes a "best comparable total" only if it HAS a comparable winner.
 * Offers with unknown costs or unusable currencies are counted, never priced.
 */
export const routeOf = (shipment) => `${shipment.origin} → ${shipment.destination}`;
const day = (iso) => String(iso ?? '').slice(0, 10);

export function listRoutes(views) {
  return [...new Set(views.map((v) => routeOf(v.shipment)))].sort((a, b) => a.localeCompare(b));
}

/** Filters: from/to are YYYY-MM-DD (inclusive, by comparison creation date); route; carrierId. */
export function filterViews(views, { from = '', to = '', route = '', carrierId = '' } = {}) {
  return views.filter((v) => {
    const d = day(v.comparison.createdAt);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (route && routeOf(v.shipment) !== route) return false;
    if (carrierId && !v.entries.some((e) => e.offer.carrierId === carrierId)) return false;
    return true;
  });
}

const winnerOf = (v) => v.entries.find((e) => e.offer.id === v.result.bestOfferId) ?? null;

/** Best comparable total per comparison over time (one point per comparison that has a winner). */
export function costDynamics(views) {
  return views
    .filter((v) => isNum(v.result.bestTotal) && v.comparison.createdAt)
    .map((v) => ({ id: v.comparison.id, date: day(v.comparison.createdAt), name: v.comparison.name, total: v.result.bestTotal, route: routeOf(v.shipment) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** granularity: 'month' | 'week'. Sums best comparable totals; `comparisons` counts all, `priced` those with a winner. */
export function spendByPeriod(views, granularity = 'month') {
  const key = (iso) => {
    if (granularity === 'month') return day(iso).slice(0, 7);
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const map = new Map();
  for (const v of views) {
    if (!v.comparison.createdAt) continue;
    const k = key(v.comparison.createdAt);
    const r = map.get(k) ?? { period: k, total: 0, comparisons: 0, priced: 0 };
    r.comparisons += 1;
    if (isNum(v.result.bestTotal)) { r.total = round2(r.total + v.result.bestTotal); r.priced += 1; }
    map.set(k, r);
  }
  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export function spendByRoute(views) {
  const map = new Map();
  for (const v of views) {
    const k = routeOf(v.shipment);
    const r = map.get(k) ?? { route: k, total: 0, comparisons: 0, priced: 0 };
    r.comparisons += 1;
    if (isNum(v.result.bestTotal)) { r.total = round2(r.total + v.result.bestTotal); r.priced += 1; }
    map.set(k, r);
  }
  return [...map.values()].map((r) => ({ ...r, average: r.priced ? round2(r.total / r.priced) : null })).sort((a, b) => b.total - a.total);
}

/**
 * Structure of additional costs: confirmed money per category over the winning offers (never unknowns),
 * plus how many unknown items remain per category across ALL offers.
 */
export function extraCostStructure(views) {
  const money = {};
  const unknown = {};
  for (const v of views) {
    const w = winnerOf(v);
    if (w && !w.item.currencyBlocked) {
      for (const r of w.analysis.rows) if ((r.state === 'charged' || r.state === 'extra') && r.amount > 0) money[r.key] = round2((money[r.key] ?? 0) + r.amount * w.item.rate);
      if (w.analysis.additional.knownSum > 0) money.additional = round2((money.additional ?? 0) + w.analysis.additional.knownSum * w.item.rate);
    }
    for (const e of v.entries)
      for (const m of e.analysis.missing) {
        const k = m.key === 'charge' ? 'additional' : m.key;
        unknown[k] = (unknown[k] ?? 0) + 1;
      }
  }
  const keys = [...new Set([...COST_COMPONENTS, 'additional', 'base'])].filter((k) => k !== 'base');
  return keys.map((key) => ({ key, money: money[key] ?? 0, unknown: unknown[key] ?? 0 })).filter((r) => r.money > 0 || r.unknown > 0);
}

/** One row per carrier. avgQuote = mean of QUOTED base prices (not total cost), base currency only. */
export function carrierComparison(views) {
  const map = new Map();
  for (const v of views)
    for (const e of v.entries) {
      const id = e.offer.carrierId;
      const r = map.get(id) ?? { carrierId: id, carrier: e.carrier?.name ?? '—', offers: 0, comparable: 0, wins: 0, quotes: [], unknownItems: 0 };
      r.offers += 1;
      if (e.item.comparability === 'comparable') r.comparable += 1;
      if (e.offer.id === v.result.bestOfferId) r.wins += 1;
      if (isNum(e.item.base)) r.quotes.push(e.item.base);
      r.unknownItems += e.analysis.missing.length;
      map.set(id, r);
    }
  return [...map.values()]
    .map(({ quotes, ...r }) => ({ ...r, avgQuote: quotes.length ? round2(quotes.reduce((s, x) => s + x, 0) / quotes.length) : null, minQuote: quotes.length ? Math.min(...quotes) : null, avgUnknown: r.offers ? round2(r.unknownItems / r.offers) : 0 }))
    .sort((a, b) => b.offers - a.offers || a.carrier.localeCompare(b.carrier));
}

/** Everything one carrier did: offers (newest first) with their comparison, status and rank. */
export function carrierHistory(views, carrierId) {
  const rows = [];
  for (const v of views)
    for (const e of v.entries)
      if (e.offer.carrierId === carrierId)
        rows.push({
          offerId: e.offer.id, comparisonId: v.comparison.id, comparisonName: v.comparison.name, shipmentId: v.shipment.id,
          route: routeOf(v.shipment), date: v.comparison.createdAt, quote: e.analysis.price, currency: e.analysis.currency,
          base: e.item.base, comparability: e.item.comparability, total: e.item.total, won: e.offer.id === v.result.bestOfferId,
          unknown: e.analysis.missing.length,
        });
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
