import { ru } from './ru.js';
import { kk } from './kk.js';
import { en } from './en.js';

export const dictionaries = { ru, kk, en };

/** t(key, params) with fallback: requested language -> ru -> the key itself. */
export function createTranslator(lang = 'ru') {
  const dict = dictionaries[lang] ?? ru;
  return function t(key, params) {
    let s = dict[key] ?? ru[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}
