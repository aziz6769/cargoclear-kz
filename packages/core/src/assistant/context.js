import { buildAllViews } from '../engine/view.js';

const stamp = (c) => String(c.updatedAt ?? c.createdAt ?? '');

/**
 * Context retrieval. Pure: reads the already-stored data and runs the calculation engine.
 * Nothing here talks to a model, and nothing is invented - if a comparison does not exist the scope is null.
 * Returns the full set of views (newest first) and the one the question is about.
 */
export function retrieveContext(data, { comparisonId = null } = {}) {
  const views = buildAllViews(data).sort((a, b) => stamp(b.comparison).localeCompare(stamp(a.comparison)));
  // No silent guess: with several comparisons and no explicit choice, the scope stays empty and the user is asked to choose.
  const needsScope = !comparisonId && views.length > 1;
  const picked = comparisonId ? views.find((v) => v.comparison.id === comparisonId) ?? null : needsScope ? null : views[0] ?? null;
  return {
    views,
    view: picked,
    shipments: data.shipments ?? [],
    comparisons: data.comparisons ?? [],
    baseCurrency: data.settings?.currency ?? 'KZT',
    scope: picked ? { comparisonId: picked.comparison.id, shipmentId: picked.shipment.id, name: picked.comparison.name, auto: !comparisonId } : null,
    scopeNotFound: !!comparisonId && !picked,
    needsScope,
  };
}
