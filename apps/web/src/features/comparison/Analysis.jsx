import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Info, Scale } from 'lucide-react';
import { buildAnalysis, explainOffer } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Card, CardHeader, cx } from '../../components/ui.jsx';
import { ComparabilityBadge } from '../../components/common.jsx';

const KIND_CLS = {
  base: 'text-ink',
  plus: 'text-ink',
  sum: 'border-t border-line pt-2 font-semibold text-ink',
  missing: 'text-warn-ink',
  info: 'text-ink-soft',
};

/** Step-by-step calculation for ONE offer, plus the verdict and the reason for it. */
export function ExplainPanel({ e, result, className }) {
  const { t, lang } = useApp();
  const x = explainOffer(e, result, (k, p) => t(k, p), lang);
  const tone = x.comparability === 'comparable' ? 'text-ok' : x.comparability === 'not_comparable' ? 'text-bad' : 'text-warn-ink';
  return (
    <div className={cx('space-y-2 text-sm', className)}>
      <ul className="space-y-1.5">
        {x.lines.map((l, i) => (
          <li key={i} className={cx('flex gap-2', KIND_CLS[l.kind])}>
            {l.kind === 'missing' && <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
            <span className="min-w-0 break-words">{l.text}</span>
          </li>
        ))}
      </ul>
      <p className={cx('flex gap-2 rounded-lg bg-canvas p-3 font-medium', tone)}>
        <Scale size={16} className="mt-0.5 shrink-0" />
        <span className="min-w-0">{x.verdict}{x.bound ? ` ${x.bound}` : ''}</span>
      </p>
    </div>
  );
}

/** Collapsible per-offer section (desktop results page). */
export function ExplainAccordion({ e, result, defaultOpen = false }) {
  const { t } = useApp();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <button
        type="button"
        data-expand
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 text-left hover:bg-canvas/60"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
          {e.carrier?.name ?? '—'}
          <ComparabilityBadge value={e.item.comparability} />
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-brand">
          {t('res.howCalculated')}
          <ChevronDown size={16} className={cx('transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && <ExplainPanel e={e} result={result} className="border-t border-line p-4" />}
    </div>
  );
}

/** Rule-based summary of the whole comparison. Labelled as automated analysis, never as AI. */
export function AutoAnalysis({ view, compact = false }) {
  const { t, fmt } = useApp();
  const a = buildAnalysis(view);
  const name = (e) => e?.carrier?.name ?? '—';
  const rows = [];

  rows.push({
    tone: a.best ? 'ok' : 'warn',
    icon: a.best ? Check : AlertTriangle,
    text: a.best
      ? t('an.lowest', { carrier: name(a.best), amount: fmt.money(view.result.bestTotal), n: a.comparableCount, total: a.total })
      : t('an.noneComparable'),
  });
  if (a.lowestQuoteNotBest)
    rows.push({ tone: 'warn', icon: AlertTriangle, text: t('an.lowestQuote', { carrier: name(a.baseCheapest), best: name(a.best) }) });
  if (a.mostComplete) rows.push({ tone: 'ok', icon: Check, text: t('an.mostComplete', { carrier: name(a.mostComplete) }) });
  if (a.withMissing.length)
    rows.push({
      tone: 'warn',
      icon: AlertTriangle,
      text: t('an.missing', { list: a.withMissing.map((m) => `${name(m.entry)} (${m.count})`).join(', ') }),
    });
  if (a.mismatched.length)
    rows.push({ tone: 'warn', icon: AlertTriangle, text: t('an.mismatch', { list: a.mismatched.map(name).join(', ') }) });
  if (a.openKeys.length)
    rows.push({ tone: 'info', icon: Info, text: t('an.open', { list: a.openKeys.map((k) => t(`comp.${k}`)).join(', ') }) });

  return (
    <Card className="mb-5 min-w-0">
      <CardHeader title={t('an.title')} subtitle={t('an.subtitle')} />
      <ul className={cx('space-y-2.5 px-4 py-4 sm:px-5', compact && 'py-3')}>
        {rows.map((r, i) => (
          <li key={i} className={cx('flex gap-2.5 text-sm', r.tone === 'ok' ? 'text-ink' : r.tone === 'warn' ? 'text-ink' : 'text-ink-soft')}>
            <r.icon size={17} className={cx('mt-0.5 shrink-0', r.tone === 'ok' ? 'text-ok' : r.tone === 'warn' ? 'text-warn' : 'text-brand')} />
            <span className="min-w-0 break-words">{r.text}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-3 text-xs text-ink-soft sm:px-5">{t('an.disclaimer')}</p>
    </Card>
  );
}
