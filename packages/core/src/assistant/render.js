import { formatMoney } from '../money.js';

/** Resolve structured params ({$t}, {$money}) into strings for one language. */
export function resolveParams(params, t, lang) {
  const out = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v && typeof v === 'object' && '$t' in v) out[k] = t(v.$t);
    else if (v && typeof v === 'object' && '$money' in v) out[k] = formatMoney(v.$money[0], v.$money[1], lang);
    else out[k] = v ?? '';
  }
  return out;
}

export const renderBlock = (b, t, lang) => t(b.key, resolveParams(b.params, t, lang));

/** Plain-text version of a grounded answer - this is what an external model is allowed to rephrase. */
export const answerToText = (answer, t, lang) => answer.blocks.map((b) => `[${b.kind}] ${renderBlock(b, t, lang)}`).join('\n');

/** Human label of a source reference (for chips and for the grounded-text check). */
export function sourceLabel(s, t) {
  if (s.type === 'cost') return `${s.carrier} · ${s.component === 'base' ? t('comp.base') : s.component === 'additional' ? t('comp.additional') : t(`comp.${s.component}`)}`;
  if (s.type === 'offer') return s.carrier;
  if (s.type === 'shipment') return `${t('as.src.shipment')}: ${s.label}`;
  if (s.type === 'comparison') return `${t('as.src.comparison')}: ${s.label}`;
  if (s.type === 'glossary') return t('as.src.glossary');
  return '';
}
