import AssistantPanel from '../assistant/AssistantPanel.jsx';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, BarChart3, Check, ChevronDown, ClipboardCopy, Copy, FileDown, GitCompare, HelpCircle, MapPin, Pencil, Printer, Trash2 } from 'lucide-react';
import { COST_COMPONENTS, comparisonToCsv } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Badge, Banner, Button, Card, CardHeader, ConfirmDialog, EmptyState, PageHeader, cx } from '../../components/ui.jsx';
import { CarrierName, ComparabilityBadge, CostBar, EndpointBadge, StatusBadge, route } from '../../components/common.jsx';
import { InfoTip } from '../../components/Term.jsx';
import { downloadText, safeFilename } from '../../lib/download.js';
import { AutoAnalysis, ExplainAccordion, ExplainPanel } from './Analysis.jsx';
import { COMPONENT_COLORS } from '../../lib/palette.js';
import { useIsDesktop } from '../../lib/useMedia.js';

/* ---------- shared cells (used by the desktop table AND the mobile cards) ---------- */

export function CostCell({ row, currency }) {
  const { t, fmt } = useApp();
  switch (row.state) {
    case 'included':
      return <Badge tone="ok">{t('state.included')}</Badge>;
    case 'charged':
      return <span className="tabular">{fmt.money(row.amount, currency)}</span>;
    case 'extra':
      return (
        <span className="tabular">
          {fmt.money(row.amount, currency)} <span className="text-xs text-teal">{t('state.extra')}</span>
        </span>
      );
    case 'excluded':
      return <Badge tone="warn">{t('state.excluded')}</Badge>;
    case 'unknown':
      return <Badge tone="warn">{t('state.unknown')}</Badge>;
    default:
      return <span className="text-ink-soft">—</span>;
  }
}

function BaseCell({ e }) {
  const { t, fmt } = useApp();
  return e.analysis.price === null ? (
    <Badge tone="warn">{t('state.unknown')}</Badge>
  ) : (
    <span className="tabular font-medium">{fmt.money(e.analysis.price, e.offer.currency)}</span>
  );
}

function AdditionalCell({ e }) {
  const { t, fmt } = useApp();
  if (e.analysis.additional.items.length === 0) return <span className="text-ink-soft">—</span>;
  return (
    <ul className="space-y-1">
      {e.analysis.additional.items.map((c, i) => (
        <li key={i} className="flex items-center justify-between gap-2">
          <span className="text-ink-soft">{c.name || '—'}</span>
          {c.amount === null ? <Badge tone="warn">{t('state.unknown')}</Badge> : <span className="tabular">{fmt.money(c.amount, e.offer.currency)}</span>}
        </li>
      ))}
    </ul>
  );
}

function ToDestinationCell({ e }) {
  const { t, fmt } = useApp();
  const d = e.analysis.destination;
  if (!d.gap) return <span className="text-sm text-ok">{t('res.noGap')}</span>;
  return (
    <div className="space-y-1">
      {d.toDestination.confirmed > 0 && <div className="tabular">{fmt.money(d.toDestination.confirmed, e.offer.currency)}</div>}
      {d.toDestination.missingKeys.length > 0 && (
        <>
          <Badge tone="warn">{t('res.infoRequired')}</Badge>
          <div className="text-xs font-normal text-ink-soft">{d.toDestination.missingKeys.map((k) => t(`comp.${k}`)).join(', ')}</div>
        </>
      )}
    </div>
  );
}

function FinalCell({ e, result, big }) {
  const { t, fmt } = useApp();
  const a = e.analysis;
  if (a.status === 'complete' && !e.item.currencyBlocked)
    return (
      <div>
        <div className={cx('tabular font-bold', big ? 'text-2xl' : 'text-lg')}>{fmt.money(e.item.total)}</div>
        {a.currency !== result.baseCurrency && (
          <div className="text-xs font-normal text-ink-soft">
            {fmt.money(a.comparableTotal, a.currency)} × {e.item.rate}
          </div>
        )}
      </div>
    );
  return (
    <div className="space-y-1">
      <Badge className="!whitespace-normal text-left leading-tight" tone={a.status === 'complete' ? 'brand' : 'bad'}>{a.status === 'complete' ? t('res.rateRequired') : t('state.unknown')}</Badge>
      <div className="text-xs font-normal text-ink-soft">
        {t('res.confirmedPart')}: <span className="tabular">{fmt.money(a.lowerBound, a.currency)}</span>
      </div>
      {a.status === 'incomplete' && <div className="text-xs font-normal text-warn-ink">{t('res.infoRequired')}</div>}
    </div>
  );
}

function VsBestCell({ e }) {
  const { t, fmt } = useApp();
  const i = e.item;
  if (i.rank === 1) return <Badge tone="teal">{t('res.best')}</Badge>;
  if (i.rank)
    return (
      <span className="tabular">
        +{fmt.money(i.diffAbs)} <span className="text-ink-soft">({fmt.pct(i.diffPct)})</span>
      </span>
    );
  if (i.bound === 'exceeds_best') return <span className="text-xs text-bad">{t('res.exceeds')}</span>;
  if (i.bound === 'may_be_cheaper') return <span className="text-xs text-warn-ink">{t('res.mayBeCheaper')}</span>;
  return <span className="text-ink-soft">—</span>;
}

function CoverageCell({ e }) {
  const { t } = useApp();
  return (
    <div className="space-y-1">
      <EndpointBadge endpoint={e.offer.endpoint} />
      {e.offer.endpointLabel && <div className="text-xs text-ink-soft">{e.offer.endpointLabel}</div>}
      {e.analysis.destination.gap && (
        <div className="flex items-start gap-1 text-xs text-warn-ink">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {t('res.gapNote')}
        </div>
      )}
    </div>
  );
}

const Chips = ({ items, tone }) =>
  items?.length ? (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <Badge key={s} tone={tone}>{s}</Badge>
      ))}
    </div>
  ) : (
    <span className="text-ink-soft">—</span>
  );

/* ---------- mobile / tablet: one card per carrier ---------- */

function OfferCard({ e, result, onCopy }) {
  const { t, fmt } = useApp();
  const [open, setOpen] = useState(false);
  const a = e.analysis;
  const missingNames = a.missing.map((m) => (m.key === 'charge' ? m.name || t('comp.additional') : t(`comp.${m.key}`)));
  const rows = a.rows.filter((r) => r.state !== 'na');


  return (
    <Card className={cx('min-w-0 overflow-hidden', e.item.rank === 1 && 'border-teal/60 ring-1 ring-teal/30')}>
      <div className="space-y-3.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CarrierName carrier={e.carrier} className="flex-wrap text-base" />
            <div className="mt-0.5 text-xs text-ink-soft">
              {t(`transport.${e.offer.transportType}`)}
              {a.deliveryDays !== null && <span className="tabular"> · {a.deliveryDays} {t('common.daysShort')}</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {e.item.rank === 1 && <Badge tone="teal"><Check size={12} /> {t('res.best')}</Badge>}
            <ComparabilityBadge value={e.item.comparability} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl bg-canvas p-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-ink-soft">{t('comp.base')}</div>
            <div className="mt-1 text-base"><BaseCell e={e} /></div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-ink-soft">{t('res.final')}</div>
            <div className="mt-1"><FinalCell e={e} result={result} /></div>
          </div>
        </div>

        <CostBar entry={e} />

        {missingNames.length > 0 && (
          <div className="flex gap-2.5 rounded-xl border border-warn/40 bg-warn-50 p-3 text-sm text-warn-ink">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold">{t('wiz.openItems', { n: missingNames.length })}</div>
              <div className="mt-0.5 text-[13px]">{missingNames.join(', ')}</div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-soft">{t('res.vsBest')}</span>
          <VsBestCell e={e} />
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-soft">{t('res.coverage')}</div>
          <CoverageCell e={e} />
        </div>

        <div className="grid grid-cols-1 gap-3 text-xs">
          <div>
            <div className="mb-1.5 font-medium text-ink-soft">{t('offer.included')}</div>
            <Chips items={e.offer.includedServices} tone="ok" />
          </div>
          <div>
            <div className="mb-1.5 font-medium text-ink-soft">{t('offer.excluded')}</div>
            <Chips items={e.offer.excludedServices} tone="bad" />
          </div>
        </div>
      </div>

      <button
        type="button"
        data-expand
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-[48px] w-full items-center justify-between border-t border-line px-4 text-sm font-semibold text-brand hover:bg-canvas/60"
      >
        {t('res.breakdown')}
        <ChevronDown size={18} className={cx('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-line bg-canvas/40 px-4 py-1 text-sm">
          <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
            <span className="flex items-center gap-2 text-ink-soft"><span className="h-2 w-2 rounded-full" style={{ background: COMPONENT_COLORS.base }} />{t('comp.base')}</span>
            <BaseCell e={e} />
          </div>
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <span className="flex items-center gap-2 text-ink-soft"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COMPONENT_COLORS[r.key] }} />{t(`comp.${r.key}`)}</span>
              <CostCell row={r} currency={e.offer.currency} />
            </div>
          ))}
          {a.additional.items.length > 0 && (
            <div className="border-b border-line py-2.5">
              <div className="mb-1.5 text-ink-soft">{t('comp.additional')}</div>
              <AdditionalCell e={e} />
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 font-semibold">
            <span>{t('res.known')}</span>
            <span className="tabular">{fmt.money(a.knownTotal, e.offer.currency)}</span>
          </div>
          {a.extraTotal > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <span className="text-ink-soft">{t('res.extra')}</span>
              <span className="tabular">{fmt.money(a.extraTotal, e.offer.currency)}</span>
            </div>
          )}
          <div className="flex items-start justify-between gap-3 py-2.5">
            <span className="text-ink-soft">{t('res.toDestination')}</span>
            <div className="text-right"><ToDestinationCell e={e} /></div>
          </div>
          <div className="border-t border-line py-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">{t('res.howCalculated')}</div>
            <ExplainPanel e={e} result={result} />
          </div>
        </div>
      )}

      <div className="border-t border-line p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold"><HelpCircle size={16} className="text-brand" />{t('res.questions')}</div>
          {e.questions.length > 0 && (
            <Button size="sm" icon={ClipboardCopy} onClick={() => onCopy(e)}>{t('common.copy')}</Button>
          )}
        </div>
        {e.questions.length === 0 ? (
          <p className="mt-2.5 flex items-center gap-2 text-sm text-ok"><Check size={16} /> {t('res.noQuestions')}</p>
        ) : (
          <ul className="mt-2.5 space-y-2 text-sm">
            {e.questions.map((q) => (
              <li key={q.id} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />{t(q.key, q.params)}</li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* ---------- page ---------- */

export default function ComparisonResults() {
  const { id } = useParams();
  const { views, t, fmt, lang, act, repo, notify } = useApp();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const [confirmDel, setConfirmDel] = useState(false);
  const view = views.find((v) => v.comparison.id === id);

  if (!view)
    return (
      <EmptyState
        icon={GitCompare}
        title={t('res.notFound')}
        action={<Button variant="primary" onClick={() => navigate('/history')}>{t('nav.history')}</Button>}
      />
    );

  const { entries, result, shipment, comparison } = view;
  const best = entries.find((e) => e.offer.id === result.bestOfferId);
  const baseCheapest = entries.find((e) => e.offer.id === result.baseCheapestOfferId);
  const blocked = entries.filter((e) => e.item.currencyBlocked);
  const hasExtra = entries.some((e) => e.analysis.extraTotal > 0);
  const cname = (e) => e?.carrier?.name ?? '—';

  const copyQuestions = async (e) => {
    const text = `${cname(e)}:\n` + e.questions.map((q) => `- ${t(q.key, q.params)}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify('ok', t('common.copied'));
    } catch {
      notify('bad', t('err.generic'));
    }
  };

  const th = 'px-4 py-3 text-left align-top';
  const labelCell = 'sticky left-0 z-10 w-44 bg-white px-4 py-3 text-left font-medium text-ink-soft xl:w-56';

  const Row = ({ label, hint, cell, strong, shade }) => (
    <tr className={cx('border-t border-line', shade && 'bg-canvas/70')}>
      <th scope="row" className={cx(labelCell, shade && '!bg-canvas', strong && '!text-ink')}>
        <div>{label}</div>
        {hint && <div className="mt-0.5 text-xs font-normal">{hint}</div>}
      </th>
      {entries.map((e) => (
        <td key={e.offer.id} className={cx('px-4 py-3 align-top', strong && 'font-semibold')}>
          {cell(e)}
        </td>
      ))}
    </tr>
  );

  const actionBtn = (icon, label, onClick, variant) => (
    <Button icon={icon} variant={variant} onClick={onClick} aria-label={label} title={label}>
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );

  return (
    <div>
      <PageHeader
        title={comparison.name}
        subtitle={`${route(shipment)} · ${fmt.date(comparison.createdAt)}`}
        actions={
          <>
            <StatusBadge status={result.status} />
            <div className="flex min-w-0 flex-wrap justify-end gap-2 max-sm:ml-auto">
              {actionBtn(BarChart3, t('nav.analytics'), () => navigate(`/analytics?c=${id}`))}
              {actionBtn(FileDown, t('res.exportCsv'), () => {
                downloadText(`cargoclear-${safeFilename(comparison.name)}.csv`, comparisonToCsv(view, t, lang));
                notify('ok', t('res.csvDone'));
              })}
              {actionBtn(Printer, t('res.report'), () => navigate(`/comparisons/${id}/report`))}
              {actionBtn(Pencil, t('common.edit'), () => navigate(`/comparisons/${id}/edit`))}
              {actionBtn(Copy, t('common.duplicate'), async () => {
                const r = await act(() => repo.duplicateComparison(id, ` ${t('common.copySuffix')}`), 'res.duplicated');
                if (r.ok) navigate(`/comparisons/${r.value.id}`);
              })}
              {actionBtn(Trash2, t('common.delete'), () => setConfirmDel(true), 'dangerGhost')}
            </div>
          </>
        }
      />

      {/* the common delivery destination stays visible while scrolling cards */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 flex items-center gap-2 border-b border-line bg-white/95 px-4 py-2.5 text-sm backdrop-blur md:top-16 md:-mx-8 md:px-8 lg:hidden">
        <MapPin size={16} className="shrink-0 text-teal" />
        <span className="min-w-0 flex-1 truncate"><span className="text-ink-soft">{t('res.target')}: </span><b>{shipment.deliveryPoint}</b></span>
        <EndpointBadge endpoint={shipment.deliveryLevel} />
      </div>

      <Card className="mb-5 grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-4 text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:px-5">
        <div className="col-span-2"><span className="text-ink-soft">{t('ship.name')}: </span><span className="font-medium">{shipment.name}</span></div>
        <div className="tabular"><span className="text-ink-soft">{t('ship.weight')}: </span>{shipment.weightKg}</div>
        <div className="tabular"><span className="text-ink-soft">{t('ship.volume')}: </span>{shipment.volumeM3}</div>
        <div className="col-span-2"><span className="text-ink-soft">{t('ship.category')}: </span>{t(`cat.${shipment.category}`)}</div>
        <div className="col-span-2 max-lg:hidden"><span className="text-ink-soft">{t('res.target')}: </span><span className="font-medium">{shipment.deliveryPoint}</span> <EndpointBadge endpoint={shipment.deliveryLevel} /></div>
        {(shipment.insuranceRequired || shipment.customsRequired || shipment.specialHandling) && (
          <div className="col-span-2 flex flex-wrap gap-1.5">
            {shipment.insuranceRequired && <Badge tone="brand">{t('ship.insurance')}</Badge>}
            {shipment.customsRequired && <Badge tone="brand">{t('ship.customs')}</Badge>}
            {shipment.specialHandling && <Badge tone="brand">{t('ship.special')}</Badge>}
          </div>
        )}
      </Card>

      <div className="mb-5 space-y-3">
        {result.status === 'complete' ? (
          <Banner tone="ok">{t('res.allComplete')}</Banner>
        ) : (
          <Banner tone="warn" title={t('res.incompleteTitle')}>
            {t('res.incompleteText', { missing: view.missingCount, offers: view.incompleteCount })}
          </Banner>
        )}
        {result.endpointMismatch && (
          <Banner tone="warn" title={t('res.endpointMismatch')}>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {entries.map((e) => (
                <li key={e.offer.id}>
                  <b>{cname(e)}</b>: {t(`endpoint.${e.offer.endpoint}`)}
                  {e.offer.endpointLabel ? ` — ${e.offer.endpointLabel}` : ''}
                  {e.analysis.destination.gap ? ` → ${t('res.gapNote')}` : ''}
                </li>
              ))}
            </ul>
          </Banner>
        )}
        {result.baseFinalMismatch && (
          <Banner tone="warn" title={t('res.baseFinalTitle')}>
            {t('res.baseFinal', { base: cname(baseCheapest), best: cname(best) })}
          </Banner>
        )}
        {blocked.length > 0 && (
          <Banner tone="info" title={t('res.currencyTitle')}>
            {t('res.currencyText', { list: blocked.map((e) => `${cname(e)} (${e.offer.currency})`).join(', '), base: result.baseCurrency })}{' '}
            <Link to="/settings" className="inline-flex min-h-[40px] items-center font-semibold underline">{t('nav.settings')}</Link>
          </Banner>
        )}
      </div>

      <AutoAnalysis view={view} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        <Card className={cx('col-span-2 p-4 sm:p-5 md:col-span-1', best && 'border-teal/40')}>
          <div className="text-xs font-medium text-ink-soft">{t('res.bestOffer')}</div>
          <div className="mt-2">
            {best ? (
              <>
                <div className="text-base font-bold sm:text-lg"><CarrierName carrier={best.carrier} className="flex-wrap" /></div>
                <div className="tabular text-2xl font-bold tracking-tight">{fmt.money(result.bestTotal)}</div>
              </>
            ) : (
              <div className="text-sm font-medium text-warn-ink">{t('res.noBest')}</div>
            )}
          </div>
        </Card>
        <Card className="min-w-0 p-4 sm:p-5">
          <div className="text-xs font-medium text-ink-soft">{t('res.savings')}</div>
          <div className="tabular mt-2 whitespace-nowrap text-xl font-bold tracking-tight sm:text-2xl">{result.potentialSavings !== null ? fmt.money(result.potentialSavings) : '—'}</div>
          <div className="mt-1 text-[11px] leading-snug text-ink-soft sm:text-xs">{t('res.savingsHint')}</div>
        </Card>
        <Card className="min-w-0 p-4 sm:p-5">
          <div className="text-xs font-medium text-ink-soft">{t('res.openItems')}</div>
          <div className="tabular mt-2 text-xl font-bold tracking-tight sm:text-2xl">{view.missingCount}</div>
          <div className="mt-1 text-[11px] leading-snug text-ink-soft sm:text-xs">{t('res.openItemsHint')}</div>
        </Card>
      </div>

      {!desktop ? (
        <>
          <div className="mb-2 px-0.5">
            <h2 className="text-base font-semibold">{t('res.table')}</h2>
            <p className="text-xs text-ink-soft">{t('res.tableHint')}</p>
          </div>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {entries.map((e) => (
              <OfferCard key={e.offer.id} e={e} result={result} onCopy={copyQuestions} />
            ))}
          </div>
          <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-2"><span className="hatch h-2.5 w-6 rounded-full" /> {t('res.unknownPart')}</span>
            <span>{t('res.barHint')}</span>
          </div>
        </>
      ) : (
        <>
          <Card className="mb-6 overflow-hidden">
            <CardHeader title={t('res.table')} subtitle={t('res.tableHint')} />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={cx(labelCell, 'align-bottom')}> </th>
                    {entries.map((e) => (
                      <th key={e.offer.id} className={cx(th, 'min-w-[190px] xl:min-w-[220px]')}>
                        <div className="flex flex-wrap items-center gap-2">
                          <CarrierName carrier={e.carrier} className="text-[15px]" />
                          {e.item.rank === 1 && <Badge tone="teal"><Check size={12} /> {t('res.best')}</Badge>}
                        </div>
                        <div className="mt-1"><ComparabilityBadge value={e.item.comparability} /></div>
                        <div className="mt-1 text-xs font-normal text-ink-soft">{t(`transport.${e.offer.transportType}`)}</div>
                        <div className="mt-2.5"><CostBar entry={e} /></div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <Row label={t('comp.base')} cell={(e) => <BaseCell e={e} />} />
                  {COST_COMPONENTS.filter((k) => entries.some((e) => e.analysis.rows.find((r) => r.key === k)?.state !== 'na')).map((k) => (
                    <Row
                      key={k}
                      label={
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COMPONENT_COLORS[k] }} />
                          {t(`comp.${k}`)}
                          {['terminal', 'lastMile', 'storage', 'customs', 'handling', 'unloading'].includes(k) && <InfoTip term={k} />}
                        </span>
                      }
                      cell={(e) => <CostCell row={e.analysis.rows.find((r) => r.key === k)} currency={e.offer.currency} />}
                    />
                  ))}
                  <Row label={t('comp.additional')} cell={(e) => <AdditionalCell e={e} />} />
                  <Row shade label={t('res.known')} hint={t('res.knownHint')} cell={(e) => <span className="tabular font-semibold">{fmt.money(e.analysis.knownTotal, e.offer.currency)}</span>} />
                  {hasExtra && (
                    <Row
                      shade
                      label={t('res.extra')}
                      hint={t('res.extraHint')}
                      cell={(e) => (e.analysis.extraTotal > 0 ? <span className="tabular">{fmt.money(e.analysis.extraTotal, e.offer.currency)}</span> : <span className="text-ink-soft">—</span>)}
                    />
                  )}
                  <Row shade label={t('res.toDestination')} hint={t('res.toDestinationHint')} cell={(e) => <ToDestinationCell e={e} />} />
                  <Row shade strong label={t('res.final')} hint={t('res.finalHint')} cell={(e) => <FinalCell e={e} result={result} />} />
                  <Row label={t('res.status')} cell={(e) => <ComparabilityBadge value={e.item.comparability} />} />
                  <Row label={t('res.vsBest')} cell={(e) => <VsBestCell e={e} />} />
                  <Row label={t('offer.days')} cell={(e) => <span className="tabular">{e.analysis.deliveryDays ?? '—'}{e.analysis.deliveryDays !== null && ` ${t('common.daysShort')}`}</span>} />
                  <Row label={t('res.coverage')} cell={(e) => <CoverageCell e={e} />} />
                  <Row label={t('offer.included')} cell={(e) => <span className="text-xs">{e.offer.includedServices?.join(', ') || <span className="text-ink-soft">—</span>}</span>} />
                  <Row label={t('offer.excluded')} cell={(e) => <span className="text-xs">{e.offer.excludedServices?.join(', ') || <span className="text-ink-soft">—</span>}</span>} />
                  <Row label={t('offer.notes')} cell={(e) => <span className="text-xs text-ink-soft">{e.offer.notes || '—'}</span>} />
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-3 text-xs text-ink-soft">
              <span className="inline-flex items-center gap-2"><span className="hatch h-2.5 w-6 rounded-full" /> {t('res.unknownPart')}</span>
              <span>{t('res.barHint')}</span>
            </div>
          </Card>

          <div className="mb-3">
            <h2 className="text-lg font-semibold">{t('res.calcTitle')}</h2>
            <p className="text-sm text-ink-soft">{t('res.calcHint')}</p>
          </div>
          <div className="mb-6 space-y-3">
            {entries.map((e) => (
              <ExplainAccordion key={e.offer.id} e={e} result={result} />
            ))}
          </div>

          <div className="mb-3 flex items-center gap-2">
            <HelpCircle size={18} className="text-brand" />
            <h2 className="text-lg font-semibold">{t('res.questions')}</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {entries.map((e) => (
              <Card key={e.offer.id} className="p-5">
                <div className="flex items-center justify-between gap-2">
                  <CarrierName carrier={e.carrier} />
                  {e.questions.length > 0 && <Button size="sm" icon={ClipboardCopy} onClick={() => copyQuestions(e)}>{t('common.copy')}</Button>}
                </div>
                {e.questions.length === 0 ? (
                  <p className="mt-3 flex items-center gap-2 text-sm text-ok"><Check size={16} /> {t('res.noQuestions')}</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {e.questions.map((q) => (
                      <li key={q.id} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />{t(q.key, q.params)}</li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      <AssistantPanel comparisonId={id} />

      <ConfirmDialog
        open={confirmDel}
        title={t('res.deleteTitle')}
        text={t('res.deleteText', { name: comparison.name })}
        confirmLabel={t('common.delete')}
        onClose={() => setConfirmDel(false)}
        onConfirm={async () => {
          setConfirmDel(false);
          const r = await act(() => repo.deleteComparison(id), 'res.deleted');
          if (r.ok) navigate('/history');
        }}
      />
    </div>
  );
}
