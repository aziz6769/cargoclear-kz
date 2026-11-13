import { DEFAULT_CURRENCY } from '../constants.js';
import { isNum, pct, round2 } from '../money.js';

const validRate = (r) => (isNum(r) && r > 0 ? r : null);

/**
 * Compare analysed offers.
 *
 * Currencies are only combined when an explicit rate exists:
 *   rates[cur] = units of baseCurrency per 1 unit of `cur`.
 * Offers whose currency has no rate are marked currencyBlocked and are not ranked.
 *
 * Only COMPLETE offers get a rank and a comparable total.
 * Incomplete offers get a `bound`:
 *   exceeds_best   - even the confirmed part already costs at least as much as the best complete offer
 *   may_be_cheaper - confirmed part is below the best complete offer; cannot be decided until the gaps are filled
 */
export function compareAnalyses(analyses, { baseCurrency = DEFAULT_CURRENCY, rates = {} } = {}) {
  const items = analyses.map((a) => {
    const rate = a.currency === baseCurrency ? 1 : validRate(rates[a.currency]);
    const blocked = rate === null;
    const conv = (v) => (v === null || v === undefined || blocked ? null : round2(v * rate));
    return {
      offerId: a.offerId,
      currency: a.currency,
      rate,
      currencyBlocked: blocked,
      base: conv(a.price),
      known: conv(a.knownTotal),
      extra: conv(a.extraTotal),
      lowerBound: conv(a.lowerBound),
      total: conv(a.comparableTotal),
      comparability: 'partial',
      rank: null,
      diffAbs: null,
      diffPct: null,
      bound: null,
    };
  });

  // Per-offer comparability:
  //   comparable     - every required cost is confirmed, currency usable -> ranked
  //   not_comparable - a currency without a rate, or the offer stops 2+ levels short of the
  //                    common destination (e.g. terminal only) so delivery conditions are too different
  //   partial        - otherwise: something important is still unconfirmed
  items.forEach((i, idx) => {
    const a = analyses[idx];
    const farShort = a.destination.gap && a.destination.targetLevel - a.destination.endpointLevel >= 2;
    if (i.currencyBlocked || (farShort && i.total === null)) i.comparability = 'not_comparable';
    else if (i.total !== null) i.comparability = 'comparable';
  });

  const ranked = items.filter((i) => i.total !== null).sort((x, y) => x.total - y.total);
  const best = ranked[0] ?? null;
  ranked.forEach((i, idx) => {
    i.rank = idx + 1;
    i.diffAbs = round2(i.total - best.total);
    i.diffPct = pct(i.total, best.total);
  });

  if (best) {
    for (const i of items) {
      if (i.total === null && i.lowerBound !== null) {
        i.bound = i.lowerBound >= best.total ? 'exceeds_best' : 'may_be_cheaper';
      }
    }
  }

  const withBase = items.filter((i) => i.base !== null);
  const baseCheapest = withBase.length ? withBase.reduce((m, i) => (i.base < m.base ? i : m)) : null;

  const levels = new Set(analyses.map((a) => a.destination.endpointLevel));
  const endpointMismatch = analyses.some((a) => a.destination.gap) || levels.size > 1;

  const n = items.length;
  let status = 'incomplete';
  if (n > 0 && ranked.length === n) status = 'complete';
  else if (ranked.length > 0) status = 'partial';

  return {
    baseCurrency,
    items,
    status,
    bestOfferId: best?.offerId ?? null,
    bestTotal: best?.total ?? null,
    baseCheapestOfferId: baseCheapest?.offerId ?? null,
    baseFinalMismatch: !!(best && baseCheapest && best.offerId !== baseCheapest.offerId),
    potentialSavings: ranked.length >= 2 ? round2(ranked[ranked.length - 1].total - best.total) : null,
    endpointMismatch,
    currencyBlockedIds: items.filter((i) => i.currencyBlocked).map((i) => i.offerId),
  };
}
