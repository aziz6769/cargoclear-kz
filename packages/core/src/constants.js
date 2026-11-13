// Shared constants. No UI text here: labels live in i18n dictionaries.

export const DEFAULT_CURRENCY = 'KZT';
export const CURRENCIES = ['KZT', 'USD', 'EUR', 'RUB', 'CNY'];
export const LANGUAGES = ['ru', 'kk', 'en'];
export const DEFAULT_LANGUAGE = 'ru';

// Cost components other than the base price. Free-form extra charges are a separate list.
export const COST_COMPONENTS = [
  'loading',
  'unloading',
  'storage',
  'terminal',
  'handling',
  'lastMile',
  'insurance',
  'customs',
];

// How a carrier treats a component in its offer.
// included - covered by the base price
// charged  - billed separately (amount required to be "known")
// excluded - not part of the offer; the customer must arrange / pay it
// unknown  - not yet confirmed with the carrier
export const COST_STATUSES = ['included', 'charged', 'excluded', 'unknown'];

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
  notifications: { missingInfo: true, newOffers: true, email: false },
  profile: { name: '', email: '', phone: '' },
  business: { company: '', bin: '', city: '', industry: '' },
};

export const emptyCosts = () =>
  Object.fromEntries(COST_COMPONENTS.map((k) => [k, { status: 'unknown', amount: null }]));
