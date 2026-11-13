/**
 * Business rules for the assistant. Every number comes from the calculation engine (entry.analysis /
 * entry.item / view.result); nothing is recomputed or estimated here.
 * Output is a structured answer: blocks of { kind, key, params, sources } - i18n keys, not prose.
 *   kind: fact (confirmed from entered data) | assumption (user estimate / inference) | unknown |
 *         question | verdict (conclusion drawn from the facts above it) | note (general info / limits)
 */
export const M = (v, cur) => ({ $money: [v, cur] });
export const T = (k) => ({ $t: k });
const L = (k) => (k === 'base' ? T('comp.base') : k === 'charge' || k === 'additional' ? T('comp.additional') : T(`comp.${k}`));
const nm = (e) => e.carrier?.name ?? '—';

const blk = (kind, key, params = {}, sources = []) => ({ kind, key, params, sources });
const offerSrc = (view, e, component) => ({
  type: component ? 'cost' : 'offer',
  comparisonId: view.comparison.id,
  offerId: e.offer.id,
  carrier: nm(e),
  component: component ?? null,
});
const shipSrc = (view) => ({ type: 'shipment', comparisonId: view.comparison.id, shipmentId: view.shipment.id, label: view.shipment.name });
const cmpSrc = (view) => ({ type: 'comparison', comparisonId: view.comparison.id, label: view.comparison.name });
const statusKey = (c) => (c === 'comparable' ? 'status.complete' : c === 'not_comparable' ? 'status.incomplete' : 'status.partial');
const entryOf = (view, id) => view.entries.find((e) => e.offer.id === id) ?? null;
const bestEntry = (view) => entryOf(view, view.result.bestOfferId);
const lowestQuoteEntry = (view) => entryOf(view, view.result.baseCheapestOfferId);
const noteOf = (e, key) => (e.offer.costs?.[key]?.note ?? '').trim();

function unknownBlocks(view, e) {
  return e.analysis.missing.map((m) => {
    if (m.key === 'charge') return blk('unknown', 'as.unk.charge', { carrier: nm(e), name: m.name || '—' }, [offerSrc(view, e, 'additional')]);
    const note = noteOf(e, m.key);
    const reason = m.reason === 'excluded' ? 'as.unk.excluded' : 'as.unk.unknown';
    if (m.key === 'base') return blk('unknown', 'as.unk.base', { carrier: nm(e) }, [offerSrc(view, e, 'base')]);
    return blk('unknown', note ? `${reason}Note` : reason, { carrier: nm(e), label: L(m.key), note }, [offerSrc(view, e, m.key)]);
  });
}

export function whyNotCheapest(view, target) {
  const { result } = view;
  const e = target ?? lowestQuoteEntry(view) ?? view.entries[0];
  const a = e.analysis;
  const cur = a.currency;
  const out = [];
  const best = bestEntry(view);
  const lowest = lowestQuoteEntry(view);

  if (a.price === null) out.push(blk('unknown', 'as.unk.base', { carrier: nm(e) }, [offerSrc(view, e, 'base')]));
  else out.push(blk('fact', 'as.why.quote', { carrier: nm(e), amount: M(a.price, cur) }, [offerSrc(view, e, 'base')]));

  if (lowest && lowest.offer.id !== e.offer.id)
    out.push(blk('fact', 'as.why.notLowestQuote', { carrier: nm(e), other: nm(lowest), amount: M(lowest.analysis.price, lowest.analysis.currency) }, [offerSrc(view, lowest, 'base')]));
  else if (lowest && view.entries.length > 1) out.push(blk('fact', 'as.why.lowestQuote', { carrier: nm(e) }, [offerSrc(view, e, 'base')]));

  for (const r of a.rows) {
    if (r.state === 'charged') out.push(blk('fact', 'as.why.charged', { label: L(r.key), amount: M(r.amount, cur) }, [offerSrc(view, e, r.key)]));
    if (r.state === 'extra') out.push(blk('assumption', 'as.why.extra', { label: L(r.key), amount: M(r.amount, cur) }, [offerSrc(view, e, r.key)]));
  }
  for (const c of a.additional.items.filter((c) => c.amount !== null))
    out.push(blk('fact', 'as.why.charge', { name: c.name || '—', amount: M(c.amount, cur) }, [offerSrc(view, e, 'additional')]));

  const billed = a.knownTotal - (a.price ?? 0);
  if (a.price !== null && billed > 0) out.push(blk('fact', 'as.why.confirmed', { amount: M(a.knownTotal, cur) }, [offerSrc(view, e)]));
  if (a.extraTotal > 0) out.push(blk('assumption', 'as.why.withEstimates', { amount: M(a.lowerBound, cur) }, [offerSrc(view, e)]));

  out.push(...unknownBlocks(view, e));
  if (a.destination.gap)
    out.push(blk('fact', 'as.why.gap', { endpoint: T(`endpoint.${e.offer.endpoint}`), target: T(`endpoint.${view.shipment.deliveryLevel}`) }, [offerSrc(view, e, 'lastMile'), shipSrc(view)]));

  // verdict - strictly from engine fields
  const it = e.item;
  if (it.currencyBlocked) out.push(blk('verdict', 'as.v.currencyBlocked', { cur }, [offerSrc(view, e)]));
  else if (it.comparability === 'comparable') {
    if (best && best.offer.id === e.offer.id) out.push(blk('verdict', 'as.v.bestComparable', { carrier: nm(e), amount: M(it.total, result.baseCurrency) }, [offerSrc(view, e)]));
    else if (best) out.push(blk('verdict', 'as.v.comparableHigher', { carrier: nm(e), amount: M(it.total, result.baseCurrency), best: nm(best), bestAmount: M(result.bestTotal, result.baseCurrency), diff: M(it.diffAbs, result.baseCurrency) }, [offerSrc(view, e), offerSrc(view, best)]));
  } else {
    out.push(blk('verdict', it.comparability === 'not_comparable' ? 'as.v.notComparable' : 'as.v.partial', { carrier: nm(e), count: a.missing.length }, [offerSrc(view, e)]));
    if (!best) out.push(blk('verdict', 'as.v.noBest', {}, [cmpSrc(view)]));
    else if (it.bound === 'exceeds_best') out.push(blk('verdict', 'as.v.exceeds', { carrier: nm(e), known: M(it.lowerBound, result.baseCurrency), best: nm(best), bestAmount: M(result.bestTotal, result.baseCurrency) }, [offerSrc(view, e), offerSrc(view, best)]));
    else if (it.bound === 'may_be_cheaper') out.push(blk('verdict', 'as.v.mayBeCheaper', { carrier: nm(e), known: M(it.lowerBound, result.baseCurrency), best: nm(best), bestAmount: M(result.bestTotal, result.baseCurrency) }, [offerSrc(view, e), offerSrc(view, best)]));
  }
  return out;
}

export function askCarrier(view, target) {
  const entries = target ? [target] : view.entries.filter((e) => e.questions.length > 0);
  const out = [];
  for (const e of entries) {
    if (e.questions.length === 0) {
      out.push(blk('note', 'as.ask.none', { carrier: nm(e) }, [offerSrc(view, e)]));
      continue;
    }
    out.push(blk('note', 'as.ask.head', { carrier: nm(e) }, [offerSrc(view, e)]));
    for (const q of e.questions) {
      const comp = q.id.startsWith('charge:') ? 'additional' : q.id === 'endpoint' ? 'lastMile' : q.id;
      out.push(blk('question', q.key, { ...q.params, carrier: nm(e) }, [offerSrc(view, e, comp)]));
    }
    if (e.item.currencyBlocked) out.push(blk('note', 'as.ask.rate', { cur: e.analysis.currency }, [offerSrc(view, e)]));
  }
  if (!entries.length) out.push(blk('fact', 'as.ask.allClear', {}, [cmpSrc(view)]));
  return out;
}

export function compareAll(view) {
  const { entries, result } = view;
  if (entries.length < 2) return [blk('note', 'as.cmp.tooFew', { count: entries.length }, [cmpSrc(view)])];
  const out = [];
  for (const e of entries) {
    const a = e.analysis;
    const it = e.item;
    if (it.comparability === 'comparable')
      out.push(blk('fact', 'as.cmp.ok', { carrier: nm(e), quote: M(a.price, a.currency), total: M(it.total, result.baseCurrency), rank: it.rank }, [offerSrc(view, e)]));
    else
      out.push(blk('fact', it.comparability === 'not_comparable' ? 'as.cmp.notOk' : 'as.cmp.partial', { carrier: nm(e), quote: a.price === null ? T('as.none') : M(a.price, a.currency), known: M(a.lowerBound, a.currency), count: a.missing.length }, [offerSrc(view, e)]));
    out.push(blk('fact', 'as.cmp.status', { carrier: nm(e), status: T(statusKey(it.comparability)) }, [offerSrc(view, e)]));
  }
  const best = bestEntry(view);
  const lowest = lowestQuoteEntry(view);
  if (best) out.push(blk('verdict', 'as.cmp.best', { carrier: nm(best), amount: M(result.bestTotal, result.baseCurrency) }, [offerSrc(view, best)]));
  else out.push(blk('verdict', 'as.cmp.noBest', {}, [cmpSrc(view)]));
  if (best && lowest && best.offer.id !== lowest.offer.id)
    out.push(blk('verdict', 'as.cmp.lowestNotBest', { lowest: nm(lowest), quote: M(lowest.analysis.price, lowest.analysis.currency), best: nm(best) }, [offerSrc(view, lowest, 'base'), offerSrc(view, best)]));
  for (const e of entries.filter((x) => x.item.comparability !== 'comparable' && x.item.bound)) {
    const key = e.item.bound === 'exceeds_best' ? 'as.cmp.exceeds' : 'as.cmp.may';
    out.push(blk('verdict', key, { carrier: nm(e), known: M(e.item.lowerBound, result.baseCurrency), best: best ? nm(best) : '—' }, [offerSrc(view, e)]));
  }
  if (result.potentialSavings !== null && result.potentialSavings > 0)
    out.push(blk('fact', 'as.cmp.spread', { amount: M(result.potentialSavings, result.baseCurrency) }, [cmpSrc(view)]));
  return out;
}

export function missingInfo(view) {
  const out = [];
  for (const e of view.entries) out.push(...unknownBlocks(view, e));
  if (!out.length) out.push(blk('fact', 'as.miss.none', {}, [cmpSrc(view)]));
  else out.unshift(blk('note', 'as.miss.head', { count: out.length }, [cmpSrc(view)]));
  return out;
}

export function mismatches(view) {
  const out = [];
  const { shipment, entries, result } = view;
  for (const e of entries) {
    const a = e.analysis;
    if (a.destination.gap)
      out.push(blk('fact', 'as.mm.gap', { carrier: nm(e), endpoint: T(`endpoint.${e.offer.endpoint}`), target: T(`endpoint.${shipment.deliveryLevel}`) }, [offerSrc(view, e, 'lastMile'), shipSrc(view)]));
    for (const r of a.rows)
      if (['insurance', 'customs', 'handling', 'storage'].includes(r.key) && r.required && (r.state === 'unknown' || r.state === 'excluded'))
        out.push(blk('unknown', 'as.mm.req', { carrier: nm(e), label: L(r.key) }, [offerSrc(view, e, r.key), shipSrc(view)]));
    if (a.currency !== result.baseCurrency)
      out.push(blk(e.item.currencyBlocked ? 'unknown' : 'fact', e.item.currencyBlocked ? 'as.mm.curBlocked' : 'as.mm.cur', { carrier: nm(e), cur: a.currency, base: result.baseCurrency, rate: e.item.rate ?? '' }, [offerSrc(view, e)]));
  }
  if (new Set(entries.map((e) => e.offer.endpoint)).size > 1)
    out.push(blk('fact', 'as.mm.levels', {}, [cmpSrc(view)]));
  return out.length ? out : [blk('fact', 'as.mm.none', {}, [cmpSrc(view)])];
}

export function recommend(view) {
  const { result, entries } = view;
  const best = bestEntry(view);
  const out = [];
  if (!best) {
    out.push(blk('verdict', 'as.rec.none', {}, [cmpSrc(view)]));
    out.push(...missingInfo(view).filter((b) => b.kind === 'unknown'));
    return out;
  }
  out.push(blk('verdict', 'as.rec.best', { carrier: nm(best), amount: M(result.bestTotal, result.baseCurrency) }, [offerSrc(view, best)]));
  for (const e of entries.filter((x) => x.offer.id !== best.offer.id)) {
    if (e.item.comparability === 'comparable')
      out.push(blk('fact', 'as.rec.higher', { carrier: nm(e), amount: M(e.item.total, result.baseCurrency), diff: M(e.item.diffAbs, result.baseCurrency) }, [offerSrc(view, e)]));
    else if (e.item.bound === 'exceeds_best') out.push(blk('fact', 'as.rec.exceeds', { carrier: nm(e), known: M(e.item.lowerBound, result.baseCurrency) }, [offerSrc(view, e)]));
    else out.push(blk('unknown', 'as.rec.pending', { carrier: nm(e), count: e.analysis.missing.length }, [offerSrc(view, e)]));
  }
  out.push(blk('note', 'as.rec.scope', {}, [cmpSrc(view)]));
  return out;
}

export function summary(view) {
  const { result, shipment, entries } = view;
  const out = [
    blk('fact', 'as.sum.shipment', { name: shipment.name, from: shipment.origin, to: shipment.destination, kg: shipment.weightKg, m3: shipment.volumeM3 }, [shipSrc(view)]),
    blk('fact', 'as.sum.counts', { total: entries.length, comparable: entries.filter((e) => e.item.comparability === 'comparable').length, unknown: view.missingCount }, [cmpSrc(view)]),
    blk('fact', 'as.sum.status', { status: T(`status.${result.status}`) }, [cmpSrc(view)]),
  ];
  out.push(...compareAll(view).filter((b) => ['as.cmp.best', 'as.cmp.noBest', 'as.cmp.lowestNotBest'].includes(b.key)));
  return out;
}

export function shipmentInfo(view, ctx) {
  const s = view.shipment;
  const yes = (v) => T(v ? 'as.yes' : 'as.no');
  return [
    blk('fact', 'as.ship.route', { name: s.name, from: s.origin, to: s.destination, point: s.deliveryPoint, level: T(`endpoint.${s.deliveryLevel}`) }, [shipSrc(view)]),
    blk('fact', 'as.ship.cargo', { kg: s.weightKg, m3: s.volumeM3, category: T(`cat.${s.category}`) }, [shipSrc(view)]),
    blk('fact', 'as.ship.reqs', { insurance: yes(s.insuranceRequired), customs: yes(s.customsRequired), special: yes(s.specialHandling), days: s.storageDays }, [shipSrc(view)]),
    blk('fact', 'as.ship.linked', { count: ctx.comparisons.filter((c) => c.shipmentId === s.id).length }, [shipSrc(view)]),
  ];
}

export function history(ctx) {
  return ctx.views.slice(0, 5).map((v) => {
    const best = bestEntry(v);
    return blk('fact', best ? 'as.hist.withBest' : 'as.hist.noBest', { name: v.comparison.name, status: T(`status.${v.result.status}`), best: best ? nm(best) : '', amount: best ? M(v.result.bestTotal, v.result.baseCurrency) : '' }, [cmpSrc(v)]);
  });
}

export function termInfo(term, ctx) {
  const out = [blk('note', 'as.term.def', { term: T(`gloss.${term}.t`), text: T(`gloss.${term}.d`) }, [{ type: 'glossary', term }])];
  const view = ctx.view;
  if (view && ['terminal', 'lastMile', 'storage', 'customs', 'handling', 'unloading', 'fuel', 'pickup'].includes(term)) {
    for (const e of view.entries) {
      const r = e.analysis.rows.find((x) => x.key === term);
      if (!r) continue;
      const key = { included: 'as.term.included', charged: 'as.term.charged', extra: 'as.term.extra', unknown: 'as.term.unknown', excluded: 'as.term.excluded', na: 'as.term.na' }[r.state];
      const kind = r.state === 'unknown' || r.state === 'excluded' ? 'unknown' : r.state === 'extra' ? 'assumption' : 'fact';
      out.push(blk(kind, key, { carrier: nm(e), label: L(term), amount: r.amount === null ? '' : M(r.amount, e.analysis.currency) }, [offerSrc(view, e, term)]));
    }
  }
  return out;
}
