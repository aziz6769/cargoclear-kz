/**
 * Questions the user should ask a carrier, derived from what is missing.
 * Returns i18n keys + params; text lives in the dictionaries.
 */
export function buildQuestions(analysis) {
  const out = [];
  // Only ask when the bridge to the common destination is actually unconfirmed.
  if (analysis.destination.gap && analysis.destination.toDestination.missingKeys.length > 0) out.push({ id: 'endpoint', key: 'q.endpoint', params: {} });
  for (const m of analysis.missing) {
    if (m.key === 'base') out.push({ id: 'base', key: 'q.base', params: {} });
    else if (m.key === 'charge')
      out.push({ id: `charge:${m.name}`, key: 'q.charge', params: { name: m.name || '—' } });
    else out.push({ id: m.key, key: `q.${m.key}`, params: {} });
  }
  return out;
}
