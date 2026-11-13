import { COST_COMPONENTS, ENDPOINT_LEVEL, OPTIONAL_COMPONENTS, defaultCost } from '../constants.js';
import { isNum, round2 } from '../money.js';

/**
 * Which components matter for THIS shipment and THIS offer.
 * A required component that is not confirmed makes the offer incomplete.
 */
export function requiredComponents(shipment, offer) {
  const offerLevel = ENDPOINT_LEVEL[offer.endpoint] ?? 0;
  const targetLevel = ENDPOINT_LEVEL[shipment.deliveryLevel ?? 'warehouse'] ?? 3;
  return {
    loading: true,
    unloading: true,
    lastMile: offerLevel < targetLevel,
    terminal: offer.endpoint !== 'warehouse',
    storage: (shipment.storageDays ?? 0) > 0 || offer.endpoint === 'terminal',
    handling: !!shipment.specialHandling,
    insurance: !!shipment.insuranceRequired,
    customs: !!shipment.customsRequired,
    // Optional components matter only if the user flagged them; see analyzeOffer.
    pickup: false,
    fuel: false,
    other: false,
  };
}

/**
 * Analyse a single offer against a shipment. Pure and deterministic.
 *
 * Row states:
 *   included  - covered by the base price (adds nothing)
 *   charged   - carrier bills it, amount known
 *   extra     - not in the offer, but the user supplied a cost to cover it
 *   excluded  - not in the offer, no cost known, but required  -> missing
 *   unknown   - not confirmed, required (or charged with no amount) -> missing
 *   na        - not relevant for this shipment / offer
 *
 * Unknown costs are NEVER treated as zero.
 */
export function analyzeOffer(offer, shipment) {
  const required = requiredComponents(shipment, offer);
  const rows = [];
  const missing = [];
  let charged = 0;
  let extra = 0;

  const price = isNum(offer.price) ? offer.price : null;
  if (price === null) missing.push({ key: 'base', reason: 'base_missing' });

  for (const key of COST_COMPONENTS) {
    const cost = offer.costs?.[key] ?? defaultCost(key);
    const amount = isNum(cost.amount) ? cost.amount : null;
    // An optional component the user flagged as unknown/excluded is a real open question.
    const optional = OPTIONAL_COMPONENTS.includes(key);
    const req = optional ? cost.status === 'unknown' || cost.status === 'excluded' : !!required[key];
    let state;
    let value = null;

    if (cost.status === 'na' && !(key === 'lastMile' && req)) {
      // Explicitly not applicable: never counted and never a gap. The one exception is the
      // last-mile leg when the offer stops short of the destination - that stays unresolved.
      state = 'na';
    } else if (cost.status === 'included') {
      state = 'included';
    } else if (cost.status === 'charged') {
      if (amount !== null) {
        state = 'charged';
        value = amount;
        charged += amount;
      } else {
        // The carrier says it is billed, but the size is unknown: a real cost of unknown size.
        state = 'unknown';
        missing.push({ key, reason: 'amount_missing' });
      }
    } else if (cost.status === 'excluded') {
      if (amount !== null) {
        state = 'extra';
        value = amount;
        extra += amount;
      } else if (req) {
        state = 'excluded';
        missing.push({ key, reason: 'excluded' });
      } else {
        state = 'na';
      }
    } else if (req) {
      state = 'unknown';
      missing.push({ key, reason: 'unknown' });
    } else {
      state = 'na';
    }
    rows.push({ key, required: req, state, amount: value });
  }

  const charges = (offer.additionalCharges ?? []).filter((c) => c && (c.name || isNum(c.amount)));
  const additional = { items: [], knownSum: 0, unknownCount: 0 };
  for (const c of charges) {
    const amount = isNum(c.amount) ? c.amount : null;
    additional.items.push({ name: c.name ?? '', amount });
    if (amount !== null) {
      additional.knownSum += amount;
      charged += amount;
    } else {
      additional.unknownCount += 1;
      missing.push({ key: 'charge', reason: 'amount_missing', name: c.name ?? '' });
    }
  }

  const offerLevel = ENDPOINT_LEVEL[offer.endpoint] ?? 0;
  const targetLevel = ENDPOINT_LEVEL[shipment.deliveryLevel ?? 'warehouse'] ?? 3;
  const destinationGap = offerLevel < targetLevel;

  // Costs needed to bridge from the offer's endpoint to the common destination.
  const gapKeys = ['terminal', 'lastMile'];
  const toDestination = { confirmed: 0, missingKeys: [] };
  if (destinationGap) {
    for (const r of rows.filter((r) => gapKeys.includes(r.key))) {
      if (r.state === 'charged' || r.state === 'extra') toDestination.confirmed += r.amount;
      else if (r.state === 'excluded' || r.state === 'unknown') toDestination.missingKeys.push(r.key);
    }
  }

  const knownTotal = round2((price ?? 0) + charged);
  const extraTotal = round2(extra);
  const lowerBound = round2(knownTotal + extraTotal);
  const complete = missing.length === 0;

  return {
    offerId: offer.id,
    carrierId: offer.carrierId,
    currency: offer.currency,
    price,
    rows,
    additional: { ...additional, knownSum: round2(additional.knownSum) },
    missing,
    status: complete ? 'complete' : 'incomplete',
    knownTotal, // base + everything the carrier itself bills
    extraTotal, // user-supplied costs for things outside the offer
    lowerBound, // everything confirmed so far; the true total can only be higher
    comparableTotal: complete ? lowerBound : null,
    destination: {
      gap: destinationGap,
      endpointLevel: offerLevel,
      targetLevel,
      toDestination: { confirmed: round2(toDestination.confirmed), missingKeys: toDestination.missingKeys },
    },
    deliveryDays: isNum(offer.deliveryDays) ? offer.deliveryDays : null,
  };
}
