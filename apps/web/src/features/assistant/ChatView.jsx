import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bot, Check, CircleHelp, Copy, HelpCircle, Lightbulb, Loader2, Send, Sparkles, StickyNote, Cog, MessageSquareQuote } from 'lucide-react';
import { answerToText, renderBlock, sourceLabel, suggestQuestions, resolveParams } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Banner, Button, cx } from '../../components/ui.jsx';

const KIND = {
  fact: { icon: Check, cls: 'bg-ok-50 text-ok', box: 'border-ok/20' },
  assumption: { icon: Lightbulb, cls: 'bg-warn-50 text-warn-ink', box: 'border-warn/40' },
  unknown: { icon: CircleHelp, cls: 'bg-bad-50 text-bad', box: 'border-bad/25' },
  question: { icon: MessageSquareQuote, cls: 'bg-brand-50 text-brand', box: 'border-brand/20' },
  verdict: { icon: Sparkles, cls: 'bg-navy text-white', box: 'border-navy/30' },
  note: { icon: StickyNote, cls: 'bg-canvas text-ink-soft', box: 'border-line' },
};

function sourceHref(s) {
  if (s.type === 'shipment') return `/shipments/${s.shipmentId}`;
  if (s.type === 'glossary') return null;
  return s.comparisonId ? `/comparisons/${s.comparisonId}` : null;
}

function Block({ b, t, lang }) {
  const k = KIND[b.kind] ?? KIND.note;
  const Icon = k.icon;
  return (
    <li data-block={b.kind} className={cx('rounded-lg border bg-white p-3', k.box)}>
      <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:gap-2.5">
        <span className={cx('sm:mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', k.cls)}>
          <Icon size={12} />
          {t(`as.kind.${b.kind}`)}
        </span>
        <span className="min-w-0 break-words text-sm leading-relaxed">{renderBlock(b, t, lang)}</span>
      </div>
      {b.sources.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-0.5">
          <span className="text-[11px] text-ink-soft">{t('as.sources')}:</span>
          {b.sources.map((s, i) => {
            const href = sourceHref(s);
            const label = sourceLabel(s, t);
            const cls = 'inline-flex min-h-[36px] max-w-full items-center truncate rounded-full border border-line bg-canvas px-3 text-[11px] text-ink-soft md:min-h-[26px] md:px-2.5';
            return href ? (
              <Link key={i} to={href} data-source className={cx(cls, 'hover:border-brand hover:text-brand')}>{label}</Link>
            ) : (
              <span key={i} data-source className={cls}>{label}</span>
            );
          })}
        </div>
      )}
    </li>
  );
}

export function BotMessage({ m }) {
  const { t, lang } = useApp();
  const [copied, setCopied] = useState(false);
  const isAi = m.engine === 'ai';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.ai ?? answerToText(m, t, lang));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div data-msg="assistant" data-engine={m.engine} className="flex gap-2.5">
      <span title={t('as.bot')} className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-white max-sm:hidden"><Bot size={16} /></span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span data-engine-label className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium', isAi ? 'bg-brand-50 text-brand' : 'bg-canvas text-ink-soft')}>
            {isAi ? <Sparkles size={12} /> : <Cog size={12} />}
            {isAi ? t('as.engine.ai') : t('as.engine.rules')}
          </span>
          {m.scope && <span className="truncate text-ink-soft">{t('as.compScope')}: {m.scope.name}</span>}
        </div>
        {m.aiStatus === 'error' && <Banner tone="warn" className="text-xs">{t('as.ai.error', { code: m.aiError })}</Banner>}
        {m.aiStatus === 'rejected' && <Banner tone="warn" className="text-xs">{t('as.ai.rejected', { nums: m.aiError })}</Banner>}
        {isAi && <p data-ai-text className="whitespace-pre-line rounded-lg border border-brand/20 bg-brand-50/50 p-3 text-sm leading-relaxed">{m.ai}</p>}
        <ul className="space-y-2">
          {m.blocks.map((b, i) => (
            <Block key={i} b={b} t={t} lang={lang} />
          ))}
        </ul>
        <button type="button" onClick={copy} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-2 text-xs text-ink-soft hover:bg-canvas hover:text-ink">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? t('as.copied') : t('as.copy')}
        </button>
      </div>
    </div>
  );
}

function UserMessage({ m }) {
  const { t } = useApp();
  return (
    <div data-msg="user" aria-label={t('as.you')} role="group" className="flex justify-end">
      <div className="max-w-[85%] break-words rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-sm text-white">{m.text}</div>
    </div>
  );
}

/**
 * Chat for one comparison (or for general terminology when comparisonId is null).
 * `onlyScope` limits the visible thread to that comparison (contextual panel); the page shows everything.
 */
export default function ChatView({ comparisonId = null, hintId = null, onlyScope = false, compact = false }) {
  const { assistant, t, lang, views, repo } = useApp();
  const [history, setHistory] = useState([]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(null);
  const endRef = useRef(null);
  const boxRef = useRef(null);

  const reload = useCallback(async () => setHistory(await assistant.history()), [assistant]);
  useEffect(() => {
    reload();
  }, [reload, repo]);
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length, pending]);

  const ctxId = comparisonId ?? hintId;
  const ctxView = ctxId ? views.find((v) => v.comparison.id === ctxId) ?? null : null;
  const suggestions = suggestQuestions({ view: ctxView });
  const shown = onlyScope ? history.filter((m) => m.scope === comparisonId || m.scope?.comparisonId === comparisonId) : history;

  const send = async (q, extra = {}) => {
    const question = (q ?? text).trim();
    if (!question || pending) return;
    setPending(true);
    setFailed(null);
    setText('');
    try {
      await assistant.ask(question, { lang, comparisonId, ...extra });
      await reload();
    } catch (e) {
      setFailed({ question, extra, code: e?.code });
    } finally {
      setPending(false);
    }
  };

  const sugText = (s) => t(s.key, resolveParams(s.params, t, lang));

  return (
    <div className="flex min-h-0 flex-col" data-assistant-chat>
      <div ref={boxRef} className={cx('space-y-4 overflow-y-auto overscroll-contain px-1 py-1', compact ? 'max-h-[46dvh] min-h-[120px]' : 'max-h-[58dvh] min-h-[220px]')} aria-live="polite">
        {shown.length === 0 && !pending && (
          <div className="flex flex-col items-center px-3 py-6 text-center">
            <span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand"><Bot size={22} /></span>
            <div className="text-sm font-semibold">{t('as.empty.title')}</div>
            <p className="mt-1 max-w-sm text-xs text-ink-soft">{t('as.empty.desc')}</p>
          </div>
        )}
        {shown.map((m) => (m.role === 'user' ? <UserMessage key={m.id} m={m} /> : <BotMessage key={m.id} m={m} />))}
        {pending && (
          <div data-loading className="flex items-center gap-2 text-sm text-ink-soft" role="status">
            <Loader2 size={16} className="animate-spin" /> {t('as.thinking')}
          </div>
        )}
        {failed && (
          <Banner tone="warn" className="text-sm">
            <div data-error>{t('as.error')}</div>
            <button type="button" className="mt-1 inline-flex min-h-[36px] items-center font-medium underline" onClick={() => send(failed.question, failed.extra)}>{t('as.retry')}</button>
          </Banner>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-soft"><HelpCircle size={12} />{t('as.suggested')}</div>
        <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1" data-suggestions>
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={pending}
              data-suggestion={s.intent}
              onClick={() => send(sugText(s), { intent: s.intent, offerId: s.offerId ?? null, term: s.term ?? null })}
              className="min-h-[40px] shrink-0 rounded-full border border-line bg-white px-3.5 text-left text-xs font-medium text-ink hover:border-brand hover:text-brand disabled:opacity-50"
            >
              {sugText(s)}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
        >
          <label className="sr-only" htmlFor="as-input">{t('as.placeholder')}</label>
          <input
            id="as-input"
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('as.placeholder')}
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-base placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 md:h-10 md:text-sm"
          />
          <Button type="submit" variant="primary" icon={Send} disabled={pending || !text.trim()} aria-label={t('as.send')}>
            <span className="max-sm:hidden">{t('as.send')}</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
