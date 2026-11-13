/** Suggested questions derived from the actual data in scope. Each carries an explicit intent, so no parsing is needed. */
export function suggestQuestions(ctx) {
  const view = ctx.view;
  const out = [];
  if (!view) return [{ id: 'term', key: 'as.sug.term', params: { term: { $t: 'gloss.lastMile.t' } }, intent: 'term', term: 'lastMile' }];
  const { entries, result } = view;
  const lowest = entries.find((e) => e.offer.id === result.baseCheapestOfferId);
  if (lowest && entries.length > 1) out.push({ id: 'why', key: 'as.sug.why', params: { carrier: lowest.carrier?.name ?? '—' }, intent: 'why_not_cheapest', offerId: lowest.offer.id });
  for (const e of entries.filter((x) => x.questions.length > 0).slice(0, 2))
    out.push({ id: `ask:${e.offer.id}`, key: 'as.sug.ask', params: { carrier: e.carrier?.name ?? '—' }, intent: 'ask_carrier', offerId: e.offer.id });
  if (entries.length > 1) out.push({ id: 'compare', key: 'as.sug.compare', params: { count: entries.length }, intent: 'compare_all' });
  if (view.missingCount > 0) out.push({ id: 'missing', key: 'as.sug.missing', params: {}, intent: 'missing' });
  if (entries.some((e) => e.analysis.destination.gap)) out.push({ id: 'mismatch', key: 'as.sug.mismatch', params: {}, intent: 'mismatch' });
  out.push({ id: 'recommend', key: 'as.sug.recommend', params: {}, intent: 'recommend' });
  const open = ['lastMile', 'terminal', 'unloading', 'handling'].find((k) => entries.some((e) => e.analysis.rows.some((r) => r.key === k && (r.state === 'unknown' || r.state === 'excluded'))));
  if (open) out.push({ id: `term:${open}`, key: 'as.sug.term', params: { term: { $t: `gloss.${open}.t` } }, intent: 'term', term: open });
  return out.slice(0, 7);
}
