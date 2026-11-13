/**
 * Transparent, rule-based analysis of one comparison. This is automated analysis, NOT an AI model:
 * every statement below is derived from entered data by a fixed rule.
 */
export function buildAnalysis(view) {
  const { entries, result } = view;
  const best = entries.find((e) => e.offer.id === result.bestOfferId) ?? null;
  const baseCheapest = entries.find((e) => e.offer.id === result.baseCheapestOfferId) ?? null;

  const withMissing = entries
    .filter((e) => e.analysis.missing.length > 0)
    .map((e) => ({ entry: e, count: e.analysis.missing.length }))
    .sort((a, b) => b.count - a.count);

  const mostComplete = [...entries].sort((a, b) => a.analysis.missing.length - b.analysis.missing.length)[0] ?? null;
  const mismatched = entries.filter((e) => e.analysis.destination.gap || e.item.comparability === 'not_comparable');

  const openKeys = [];
  for (const e of entries)
    for (const m of e.analysis.missing) {
      const k = m.key === 'charge' ? 'additional' : m.key;
      if (!openKeys.includes(k)) openKeys.push(k);
    }

  return {
    best,
    baseCheapest,
    lowestQuoteNotBest: !!(best && baseCheapest && best.offer.id !== baseCheapest.offer.id),
    mostComplete: mostComplete && mostComplete.analysis.missing.length === 0 ? mostComplete : null,
    withMissing,
    mismatched,
    openKeys,
    comparableCount: entries.filter((e) => e.item.comparability === 'comparable').length,
    total: entries.length,
  };
}
