// Shared constants. No UI text here: labels live in i18n dictionaries.

export const DEFAULT_CURRENCY = 'KZT';
export const CURRENCIES = ['KZT', 'USD', 'EUR', 'RUB', 'CNY'];
export const LANGUAGES = ['ru', 'kk', 'en'];
export const DEFAULT_LANGUAGE = 'ru';

// Cost components other than the base price. Free-form extra charges are a separate list.
export const COST_COMPONENTS = [
  'pickup',
  'loading',
  'unloading',
  'fuel',
  'storage',
  'terminal',
  'handling',
  'lastMile',
  'insurance',
  'customs',
  'other',
];

// Components that are NOT assumed relevant by default: they default to "na" and only matter
// when the user flags them (unknown / excluded). This keeps older offers computing exactly as before.
export const OPTIONAL_COMPONENTS = ['pickup', 'fuel', 'other'];

// How a carrier treats a component in its offer.
// included - covered by the base price
// charged  - billed separately (amount required to be "known")
// excluded - not part of the offer; the customer must arrange / pay it
// unknown  - not yet confirmed with the carrier
// na       - the expense does not apply to this shipment (never counted, never a gap)
export const COST_STATUSES = ['included', 'charged', 'excluded', 'unknown', 'na'];

// Where the carrier's price actually ends. Higher level = closer to the final destination.
export const ENDPOINTS = ['terminal', 'hub', 'warehouse'];
export const ENDPOINT_LEVEL = { terminal: 1, hub: 2, warehouse: 3 };

export const TRANSPORT_TYPES = ['truck_ftl', 'truck_ltl', 'rail', 'multimodal', 'container', 'air'];

export const CARGO_CATEGORIES = [
  'general',
  'furniture',
  'construction',
  'food',
  'electronics',
  'auto_parts',
  'textile',
  'medical',
  'equipment',
  'other',
];

export const SHIPMENT_STATUSES = ['draft', 'active', 'delivered'];

export const DEFAULT_SETTINGS = {
  language: DEFAULT_LANGUAGE,
  currency: DEFAULT_CURRENCY,
  // rates[cur] = how many units of the default currency one unit of `cur` costs.
  // null = not set. Without a rate, other currencies are never mixed into totals.
  rates: { USD: null, EUR: null, RUB: null, CNY: null },
  theme: 'light',
  onboarded: false,
  assistantEndpoint: '', // optional URL of YOUR backend proxy for an external AI model; never an API key
  notifications: { missingInfo: true, newOffers: true, email: false },
  profile: { name: '', email: '', phone: '' },
  business: { company: '', bin: '', city: '', industry: '' },
};

export const defaultCost = (key) => ({ status: OPTIONAL_COMPONENTS.includes(key) ? 'na' : 'unknown', amount: null });

export const emptyCosts = () => Object.fromEntries(COST_COMPONENTS.map((k) => [k, defaultCost(k)]));

export const COUNTRIES = ['KZ', 'RU', 'CN', 'KG', 'UZ', 'TR', 'DE', 'OTHER'];

// ---- Phase 3 data model ----
export const SCHEMA_VERSION = 2; // v2: documents + events stores, carrier routes/services, shipment shipDate
export const DOCUMENT_TYPES = ['quote', 'invoice', 'contract', 'transport'];
export const CARRIER_SERVICES = ['pickup', 'loading', 'unloading', 'insurance', 'customs', 'storage', 'lastMile', 'handling'];
export const INTERACTION_CHANNELS = ['call', 'email', 'meeting', 'message', 'other'];
export const DOCUMENT_MAX_BYTES = 3 * 1024 * 1024; // files are kept locally in the browser, so keep them small
export const DOCUMENT_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'];
