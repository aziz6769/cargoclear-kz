/**
 * Intent detection for RU / KK / EN. Deliberately simple and inspectable: ordered keyword rules,
 * no model involved. Returns { intent, term, carrierId }.
 */
const RX = {
  market: /рыночн|средн\S* (цен|тариф)|market (rate|price)|average (market )?(price|rate)|нарық\S* баға|орташа баға/i,
  ask: /спрос|вопрос|уточн|\bask\b|question|clarif|сұра|сұрақ|нақтыла/i,
  why: /почему|why\b|неге|не самый дешев|не дешев|not the cheapest|isn.t the cheapest/i,
  recommend: /рекоменд|посоветуй|что выбрать|кого выбрать|лучш\S* (вариант|предложение|перевозчик)|recommend|which (one )?should|best (offer|option|carrier)|ұсын|қайсысын таңда|ең жақсы/i,
  compare: /сравн|compare|салыстыр/i,
  termsPhrase: /что такое|что значит|что означает|what is|what does|what.s|meaning of|define|explain|объясни|деген не|не деген|нені білдіреді|түсіндір/i,
  missing: /не хватает|неизвестн|не указан|missing|unknown|белгісіз|жетіспе|жетпей/i,
  mismatch: /услови\S* доставк|несоответств|не совпад|mismatch|delivery condition|different condition|жеткізу шарт|сәйкес емес/i,
  summary: /итог|резюме|сводк|summar|overview|қорытынды|жиынтық/i,
  history: /истори|history|previous comparison|прошл\S* сравн|тарих/i,
  shipment: /груз|shipment|cargo|жүк/i,
};

export const TERM_PATTERNS = {
  lastMile: /последн\S*\s+мил\S*|last.?mile|соңғы\s+мил\S*/i,
  terminal: /терминал|terminal/i,
  storage: /хранени|storage|сақтау/i,
  customs: /таможн|customs|брокер|broker|кеден/i,
  handling: /особ\S*\s+(обработк|погрузк)|special handling|\bhandling\b|ерекше\s+өңде/i,
  unloading: /разгруз|unload|түсіру/i,
  fuel: /топливн|fuel|жанармай|отын/i,
  pickup: /\bзабор|pick-?up|алып кету/i,
  endpoint: /конечн\S*\s+точк|endpoint|соңғы нүкте|\bhub\b|хаб/i,
};

const LETTER = { а: 'a', в: 'b', с: 'c' };
const lower = (s) => String(s).toLowerCase();
const letter = (ch) => LETTER[ch] ?? ch;

/** Find which carrier of the current comparison the question names (longest name wins). */
export function findCarrier(question, entries) {
  const q = lower(question);
  let best = null;
  for (const e of entries) {
    const name = lower(e.carrier?.name ?? '').trim();
    if (name.length >= 2 && q.includes(name) && (!best || name.length > lower(best.carrier.name).length)) best = e;
  }
  if (best) return best;
  // "carrier B" / "перевозчик B" / "тасымалдаушы B" (Cyrillic А/В/С are accepted for Latin A/B/C)
  const m = q.match(/(?:carrier|перевозчик\S*|тасымалдаушы\S*)\s+([a-zа-яё])(?![a-zа-яё])/);
  if (m) {
    const want = letter(m[1]);
    const hit = entries.filter((e) => {
      const n = lower(e.carrier?.name ?? '').trim();
      return n.length > 0 && letter(n[n.length - 1]) === want && (n.length === 1 || n[n.length - 2] === ' ');
    });
    if (hit.length === 1) return hit[0];
  }
  return null;
}

export function classify(question, entries = []) {
  const q = String(question ?? '').trim();
  const carrier = findCarrier(q, entries);
  const term = Object.keys(TERM_PATTERNS).find((k) => TERM_PATTERNS[k].test(q)) ?? null;
  const base = { carrierId: carrier?.offer.id ?? null, term };
  if (!q) return { ...base, intent: 'unsupported' };
  if (RX.market.test(q)) return { ...base, intent: 'market' };
  if (RX.ask.test(q)) return { ...base, intent: 'ask_carrier' };
  if (RX.why.test(q)) return { ...base, intent: 'why_not_cheapest' };
  if (RX.recommend.test(q)) return { ...base, intent: 'recommend' };
  if (RX.compare.test(q)) return { ...base, intent: 'compare_all' };
  if (term && (RX.termsPhrase.test(q) || q.split(/\s+/).length <= 4)) return { ...base, intent: 'term' };
  if (RX.missing.test(q)) return { ...base, intent: 'missing' };
  if (RX.mismatch.test(q)) return { ...base, intent: 'mismatch' };
  if (RX.summary.test(q)) return { ...base, intent: 'summary' };
  if (RX.history.test(q)) return { ...base, intent: 'history' };
  if (RX.shipment.test(q)) return { ...base, intent: 'shipment' };
  if (term) return { ...base, intent: 'term' };
  return { ...base, intent: 'unsupported' };
}
