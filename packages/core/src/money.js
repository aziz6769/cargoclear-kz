export const CURRENCY_SYMBOLS = { KZT: '₸', USD: '$', EUR: '€', RUB: '₽', CNY: '¥' };
export const LOCALES = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' };

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Percentage difference of `value` relative to `ref`. null when it cannot be defined. */
export function pct(value, ref) {
  if (!isNum(value) || !isNum(ref) || ref === 0) return null;
  return round2(((value - ref) / ref) * 100);
}

export function formatMoney(amount, currency = 'KZT', lang = 'ru') {
  if (!isNum(amount)) return '—';
  const nf = new Intl.NumberFormat(LOCALES[lang] ?? LOCALES.ru, {
    maximumFractionDigits: currency === 'KZT' ? 0 : 2,
    minimumFractionDigits: 0,
  });
  return `${nf.format(amount)} ${CURRENCY_SYMBOLS[currency] ?? currency}`;
}

export function formatPct(value, lang = 'ru') {
  if (!isNum(value)) return '—';
  const nf = new Intl.NumberFormat(LOCALES[lang] ?? LOCALES.ru, { maximumFractionDigits: 1 });
  return `${value > 0 ? '+' : ''}${nf.format(value)}%`;
}

export function formatDate(iso, lang = 'ru') {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(LOCALES[lang] ?? LOCALES.ru, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}
