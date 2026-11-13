import { z } from 'zod';
import {
  CARGO_CATEGORIES,
  COST_COMPONENTS,
  COST_STATUSES,
  CURRENCIES,
  ENDPOINTS,
  SHIPMENT_STATUSES,
  TRANSPORT_TYPES,
  emptyCosts,
} from './constants.js';

// Error messages are i18n keys ("v.*"); the UI translates them.

const blank = (v) => v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));

const numOrNull = z.preprocess(
  (v) => (blank(v) ? null : Number(v)),
  z.number({ invalid_type_error: 'v.number' }).min(0, 'v.nonNegative').nullable(),
);

const positive = z.preprocess(
  (v) => (blank(v) ? undefined : Number(v)),
  z.number({ required_error: 'v.required', invalid_type_error: 'v.number' }).positive('v.positive'),
);

const positiveInt = z.preprocess(
  (v) => (blank(v) ? undefined : Number(v)),
  z.number({ required_error: 'v.required', invalid_type_error: 'v.number' }).int('v.integer').min(1, 'v.positive'),
);

const nonNegInt = z.preprocess(
  (v) => (blank(v) ? 0 : Number(v)),
  z.number({ invalid_type_error: 'v.number' }).int('v.integer').min(0, 'v.nonNegative'),
);

const text = z.string({ required_error: 'v.required' }).trim().min(2, 'v.min2');
const optText = z.string().optional().default('');

export const shipmentSchema = z.object({
  name: text,
  origin: text,
  destination: text,
  deliveryPoint: text,
  weightKg: positive,
  volumeM3: positive,
  category: z.enum(CARGO_CATEGORIES),
  packages: positiveInt,
  requirements: optText,
  deliveryLevel: z.enum(ENDPOINTS).default('warehouse'),
  storageDays: nonNegInt,
  insuranceRequired: z.boolean().default(false),
  customsRequired: z.boolean().default(false),
  specialHandling: z.boolean().default(false),
  status: z.enum(SHIPMENT_STATUSES).default('draft'),
});

export const carrierSchema = z.object({
  name: text,
  contactName: optText,
  phone: optText,
  email: z.string().trim().email('v.email').or(z.literal('')).optional().default(''),
  notes: optText,
});

const costSchema = z.object({
  status: z.enum(COST_STATUSES),
  amount: numOrNull,
});

export const offerFormSchema = z.object({
  offerId: z.string().optional(), // not `id`: react-hook-form's useFieldArray reserves that key
  carrierName: text,
  price: numOrNull,
  currency: z.enum(CURRENCIES),
  startLocation: optText,
  endpoint: z.enum(ENDPOINTS),
  endpointLabel: optText,
  transportType: z.enum(TRANSPORT_TYPES),
  includedServices: optText,
  excludedServices: optText,
  costs: z.object(Object.fromEntries(COST_COMPONENTS.map((k) => [k, costSchema]))),
  additionalCharges: z
    .array(z.object({ name: optText, amount: numOrNull }))
    .default([]),
  deliveryDays: z.preprocess(
    (v) => (blank(v) ? null : Number(v)),
    z.number({ invalid_type_error: 'v.number' }).int('v.integer').min(0, 'v.nonNegative').nullable(),
  ),
  notes: optText,
});

export const comparisonFormSchema = z.object({
  name: text,
  existingShipmentId: z.string().optional().default(''),
  shipment: shipmentSchema,
  offers: z.array(offerFormSchema).min(2, 'v.minOffers'),
});

// ---------- form <-> entity helpers (shared by web and mobile) ----------

export const splitList = (s) =>
  String(s ?? '')
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function defaultShipmentValues() {
  return {
    name: '',
    origin: '',
    destination: '',
    deliveryPoint: '',
    weightKg: '',
    volumeM3: '',
    category: 'general',
    packages: 1,
    requirements: '',
    deliveryLevel: 'warehouse',
    storageDays: 0,
    insuranceRequired: false,
    customsRequired: false,
    specialHandling: false,
    status: 'draft',
  };
}

export function defaultOfferValues(currency = 'KZT') {
  return {
    carrierName: '',
    price: '',
    currency,
    startLocation: '',
    endpoint: 'warehouse',
    endpointLabel: '',
    transportType: 'truck_ftl',
    includedServices: '',
    excludedServices: '',
    costs: emptyCosts(),
    additionalCharges: [],
    deliveryDays: '',
    notes: '',
  };
}

export function offerToForm(offer, carrier) {
  const costs = emptyCosts();
  for (const k of COST_COMPONENTS) if (offer.costs?.[k]) costs[k] = { ...costs[k], ...offer.costs[k] };
  return {
    offerId: offer.id,
    carrierName: carrier?.name ?? '',
    price: offer.price ?? '',
    currency: offer.currency,
    startLocation: offer.startLocation ?? '',
    endpoint: offer.endpoint,
    endpointLabel: offer.endpointLabel ?? '',
    transportType: offer.transportType,
    includedServices: (offer.includedServices ?? []).join(', '),
    excludedServices: (offer.excludedServices ?? []).join(', '),
    costs: Object.fromEntries(
      Object.entries(costs).map(([k, c]) => [k, { status: c.status, amount: c.amount ?? '' }]),
    ),
    additionalCharges: (offer.additionalCharges ?? []).map((c) => ({ name: c.name ?? '', amount: c.amount ?? '' })),
    deliveryDays: offer.deliveryDays ?? '',
    notes: offer.notes ?? '',
  };
}

/** Parsed form values (output of offerFormSchema) -> stored offer. */
export function formToOffer(values, carrierId) {
  const costs = {};
  for (const k of COST_COMPONENTS) {
    const c = values.costs[k];
    // The amount only has meaning for charged / excluded; drop stale numbers otherwise.
    costs[k] = {
      status: c.status,
      amount: c.status === 'charged' || c.status === 'excluded' ? c.amount : null,
    };
  }
  return {
    ...(values.offerId ? { id: values.offerId } : {}),
    carrierId,
    price: values.price,
    currency: values.currency,
    startLocation: values.startLocation,
    endpoint: values.endpoint,
    endpointLabel: values.endpointLabel,
    transportType: values.transportType,
    includedServices: splitList(values.includedServices),
    excludedServices: splitList(values.excludedServices),
    costs,
    additionalCharges: values.additionalCharges
      .filter((c) => c.name.trim() || c.amount !== null)
      .map((c) => ({ name: c.name.trim(), amount: c.amount })),
    deliveryDays: values.deliveryDays,
    notes: values.notes,
  };
}
