import { analyzeOffer } from './analyze.js';
import { compareAnalyses } from './compare.js';
import { buildQuestions } from './questions.js';

/**
 * Assemble everything the UI needs for one saved comparison.
 * No UI code should recompute any of these numbers.
 */
export function buildComparisonView({ comparison, shipment, offers, carriers, settings }) {
  const carrierById = new Map(carriers.map((c) => [c.id, c]));
  const offerById = new Map(offers.map((o) => [o.id, o]));

  const ordered = (comparison.offerIds ?? []).map((id) => offerById.get(id)).filter(Boolean);
  const analyses = ordered.map((o) => analyzeOffer(o, shipment));
  const result = compareAnalyses(analyses, {
    baseCurrency: settings.currency,
    rates: settings.rates ?? {},
  });

  const entries = ordered.map((offer, idx) => ({
    offer,
    carrier: carrierById.get(offer.carrierId) ?? null,
    analysis: analyses[idx],
    item: result.items[idx],
    questions: buildQuestions(analyses[idx]),
  }));

  return {
    comparison,
    shipment,
    entries,
    result,
    missingCount: analyses.reduce((s, a) => s + a.missing.length, 0),
    incompleteCount: analyses.filter((a) => a.status === 'incomplete').length,
  };
}

/** Build views for every comparison whose shipment still exists. */
export function buildAllViews({ comparisons, shipments, offers, carriers, settings }) {
  const shipmentById = new Map(shipments.map((s) => [s.id, s]));
  return comparisons
    .map((comparison) => {
      const shipment = shipmentById.get(comparison.shipmentId);
      if (!shipment) return null;
      return buildComparisonView({ comparison, shipment, offers, carriers, settings });
    })
    .filter(Boolean);
}
