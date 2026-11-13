export class AssistantError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

/** Rule-based "provider": no model. Answers are produced by rules.js only. */
export const rulesProvider = Object.freeze({ id: 'rules', kind: 'rules' });

export function validEndpoint(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname));
  } catch {
    return false;
  }
}

/**
 * Optional external AI provider reached through the OWNER'S backend proxy.
 * No API key ever lives in the browser: the proxy holds credentials. We send only the question and the
 * already-grounded answer text of the selected comparison - never the whole database.
 * Expected response: JSON { text: string }.
 */
export function createHttpProvider({ endpoint, fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  if (!validEndpoint(endpoint)) throw new AssistantError('bad_endpoint');
  return {
    id: 'http',
    kind: 'ai',
    async generate({ question, lang, groundedText }) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            question,
            lang,
            grounded: groundedText,
            rules: 'Rephrase using ONLY the grounded facts. Do not add numbers, prices or market data that are not present. Keep unknown values unknown.',
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new AssistantError('http', `HTTP ${res.status}`);
        let body;
        try {
          body = await res.json();
        } catch {
          throw new AssistantError('format');
        }
        if (typeof body?.text !== 'string' || !body.text.trim() || body.text.length > 6000) throw new AssistantError('format');
        return body.text.trim();
      } catch (e) {
        if (e instanceof AssistantError) throw e;
        throw new AssistantError(e?.name === 'AbortError' ? 'timeout' : 'network');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

const digitsOf = (s) => (String(s).match(/\d[\d\s .,]*\d|\d/g) ?? []).map((x) => x.replace(/\D/g, ''));

/**
 * Guard against invented figures: every number with 3+ digits in the model text must occur in the grounded text.
 * (1-2 digit numbers - list numbering, counts - are exempt.) Returns the list of ungrounded numbers.
 */
export function ungroundedNumbers(text, groundedText) {
  const allowed = new Set(digitsOf(groundedText));
  return [...new Set(digitsOf(text).filter((n) => n.length >= 3 && !allowed.has(n)))];
}
