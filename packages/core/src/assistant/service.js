import { classify } from './intents.js';
import { retrieveContext } from './context.js';
import * as R from './rules.js';
import { M, T } from './rules.js';
import { answerToText } from './render.js';
import { AssistantError, rulesProvider, ungroundedNumbers } from './provider.js';
import { createTranslator } from '../i18n/index.js';
import { uid } from '../data/repository.js';

const NEEDS_VIEW = new Set(['why_not_cheapest', 'ask_carrier', 'compare_all', 'missing', 'mismatch', 'recommend', 'summary', 'shipment']);
const note = (key, params = {}) => ({ kind: 'note', key, params, sources: [] });

/** Business-rule layer entry point: pick the rule set for an intent. Pure; uses only retrieved context. */
export function buildAnswer(cls, ctx) {
  const { intent } = cls;
  let blocks;
  if (intent === 'market') blocks = [note('as.market')];
  else if (intent === 'unsupported') blocks = [note('as.unsupported')];
  else if (ctx.scopeNotFound) blocks = [note('as.scopeGone')];
  else if (intent === 'term') blocks = cls.term ? R.termInfo(cls.term, ctx) : [note('as.unsupported')];
  else if (intent === 'history') blocks = ctx.views.length ? R.history(ctx) : [note('as.noData')];
  else if (NEEDS_VIEW.has(intent) && ctx.needsScope) blocks = [note('as.chooseScope', { n: ctx.views.length })];
  else if (NEEDS_VIEW.has(intent) && !ctx.view) blocks = [note('as.noData')];
  else {
    const view = ctx.view;
    const target = cls.carrierId ? view.entries.find((e) => e.offer.id === cls.carrierId) : null;
    const fn = {
      why_not_cheapest: () => R.whyNotCheapest(view, target),
      ask_carrier: () => R.askCarrier(view, target),
      compare_all: () => R.compareAll(view),
      missing: () => R.missingInfo(view),
      mismatch: () => R.mismatches(view),
      recommend: () => R.recommend(view),
      summary: () => R.summary(view),
      shipment: () => R.shipmentInfo(view, ctx),
    }[intent];
    blocks = fn();
    if (ctx.scope?.auto && intent !== 'term' && intent !== 'history')
      blocks.unshift({ kind: 'note', key: 'as.autoScope', params: { name: ctx.scope.name }, sources: [{ type: 'comparison', comparisonId: ctx.scope.comparisonId, label: ctx.scope.name }] });
  }
  return { intent, blocks };
}

/**
 * Assistant service. Layers kept separate:
 *   context retrieval  -> context.js (reads repo data, runs the engine)
 *   business rules     -> rules.js   (all financial conclusions, from the engine)
 *   response generation-> provider   (rule-based by default; optional external AI may only rephrase grounded text)
 *   conversation mgmt  -> repo.*AssistantHistory
 */
export function createAssistant({ repo, provider = rulesProvider }) {
  async function loadData() {
    const [shipments, carriers, offers, comparisons, settings] = await Promise.all([
      repo.getShipments(), repo.getCarriers(), repo.getOffers(), repo.getComparisons(), repo.getSettings(),
    ]);
    return { shipments, carriers, offers, comparisons, settings };
  }

  async function context(comparisonId) {
    return retrieveContext(await loadData(), { comparisonId });
  }

  async function ask(question, { lang = 'ru', comparisonId = null, intent = null, offerId = null, term = null } = {}) {
    const text = String(question ?? '').trim().slice(0, 500);
    if (!text) throw new AssistantError('empty');
    const ctx = await context(comparisonId);
    const cls = intent ? { intent, carrierId: offerId, term } : classify(text, ctx.view?.entries ?? []);
    const answer = buildAnswer(cls, ctx);
    const t = createTranslator(lang);

    let ai = null;
    let aiStatus = null;
    let aiError = null;
    if (provider.kind === 'ai' && answer.blocks.length) {
      const grounded = answerToText(answer, t, lang);
      try {
        const out = await provider.generate({ question: text, lang, groundedText: grounded });
        const bad = ungroundedNumbers(out, grounded);
        if (bad.length) {
          aiStatus = 'rejected';
          aiError = bad.slice(0, 3).join(', ');
        } else {
          ai = out;
          aiStatus = 'ok';
        }
      } catch (e) {
        aiStatus = 'error';
        aiError = e?.code ?? 'network';
      }
    }

    const now = new Date().toISOString();
    const userMsg = { id: uid('msg'), role: 'user', ts: now, text, scope: ctx.scope?.comparisonId ?? null };
    const botMsg = {
      id: uid('msg'), role: 'assistant', ts: now, lang, question: text,
      intent: answer.intent, blocks: answer.blocks,
      scope: ctx.scope ? { comparisonId: ctx.scope.comparisonId, name: ctx.scope.name } : null,
      engine: ai ? 'ai' : 'rules', // 'ai' only when an external model really produced `ai`
      ai, aiStatus, aiError,
    };
    await repo.appendAssistantMessages([userMsg, botMsg]);
    return botMsg;
  }

  return {
    ask,
    context,
    kind: provider.kind,
    history: () => repo.getAssistantHistory(),
    clearHistory: () => repo.clearAssistantHistory(),
  };
}
