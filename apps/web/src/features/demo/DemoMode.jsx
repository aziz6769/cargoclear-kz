import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FileText, MapPin, Package, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { COST_COMPONENTS, buildAnalysis } from '@cargoclear/core';
import { JURY_IDS } from '@cargoclear/core/seed';
import { useApp } from '../../app/DataContext.jsx';
import { Badge, Banner, Button, Card, Spinner, cx } from '../../components/ui.jsx';
import { CarrierName, ComparabilityBadge, CostBar, EndpointBadge, route } from '../../components/common.jsx';
import { LangSwitch } from '../../components/LangSwitch.jsx';
import { AutoAnalysis, ExplainPanel } from '../comparison/Analysis.jsx';
import { CostCell } from '../comparison/ComparisonResults.jsx';

const STEPS = ['overview', 'offers', 'cost', 'coverage', 'unknown', 'endpoint', 'questions', 'final'];

/**
 * Guided jury presentation on top of the REAL engine: the scenario is stored as ordinary
 * (demo-flagged) records and every number below is computed by the same code as the rest of the app.
 */
export default function DemoMode() {
  const { views, t, fmt, lang, launchDemo, status } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const view = views.find((v) => v.comparison.id === JURY_IDS.comparison);
  const stale = !view || view.comparison.demoLang !== lang;

  // Build the scenario if missing, and rebuild it in the new language when the user switches language.
  useEffect(() => {
    if (status !== 'ready' || !stale || busy) return;
    setBusy(true);
    launchDemo().finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, stale, lang]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!view) return <div className="min-h-screen bg-canvas"><Spinner label={t('common.loading')} /></div>;

  const { entries, result, shipment: s } = view;
  const an = buildAnalysis(view);
  const name = (e) => e.carrier?.name ?? '—';
  const cur = STEPS[step];
  const rowsShown = COST_COMPONENTS.filter((k) => entries.some((e) => e.analysis.rows.find((r) => r.key === k)?.state !== 'na'));
  const lowQuote = an.baseCheapest;

  const Step = ({ children }) => (
    <div>
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t(`demo.s.${cur}.title`)}</h1>
      <p className="mb-5 mt-1 max-w-3xl text-sm text-ink-soft sm:text-base">{t(`demo.s.${cur}.text`)}</p>
      {children}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-canvas" data-demo>
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy text-teal"><ShieldCheck size={18} /></span>
            <span className="truncate font-bold">CargoClear <span className="text-teal">KZ</span></span>
            <Badge tone="warn" className="max-sm:hidden">{t('demo.mode')}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <LangSwitch />
            <Button size="sm" icon={X} onClick={() => navigate('/')} aria-label={t('demo.exit')}>
              <span className="max-sm:hidden">{t('demo.exit')}</span>
            </Button>
          </div>
        </div>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 pb-3">
          <ol className="flex flex-1 gap-1 md:hidden" aria-hidden="true">
            {STEPS.map((k, i) => (
              <li key={k} className={cx('h-2.5 flex-1 rounded-full', i < step ? 'bg-teal' : i === step ? 'bg-brand' : 'bg-line')} />
            ))}
          </ol>
          <ol className="hidden flex-1 gap-1 md:flex" aria-label={t('demo.progress')}>
            {STEPS.map((k, i) => (
              <li key={k} className="flex-1">
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-label={`${i + 1}. ${t(`demo.s.${k}.title`)}`}
                  aria-current={i === step ? 'step' : undefined}
                  className="flex h-6 w-full items-center"
                >
                  <span className={cx('block h-2.5 w-full rounded-full transition-colors', i < step ? 'bg-teal' : i === step ? 'bg-brand' : 'bg-line')} />
                </button>
              </li>
            ))}
          </ol>
          <span className="tabular shrink-0 text-xs font-medium text-ink-soft">{step + 1} / {STEPS.length}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-28 sm:py-8">
        <Banner tone="info" className="mb-5 text-[13px]">{t('demo.fictional')}</Banner>

        {cur === 'overview' && (
          <Step>
            <Card className="p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand"><Package size={20} /></span>
                <div className="min-w-0">
                  <div className="text-lg font-bold">{s.name}</div>
                  <div className="text-sm text-ink-soft">{route(s)}</div>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {[
                  [t('ship.weight'), s.weightKg],
                  [t('ship.volume'), s.volumeM3],
                  [t('ship.packages'), s.packages],
                  [t('ship.category'), t(`cat.${s.category}`)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-canvas p-3"><dt className="text-xs text-ink-soft">{k}</dt><dd className="mt-0.5 font-semibold tabular">{v}</dd></div>
                ))}
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-teal/40 bg-teal/5 p-3 text-sm">
                <MapPin size={16} className="shrink-0 text-teal" />
                <span className="text-ink-soft">{t('res.target')}:</span>
                <b className="min-w-0">{s.deliveryPoint}</b>
                <EndpointBadge endpoint={s.deliveryLevel} />
              </div>
              {s.insuranceRequired && <p className="mt-3 text-sm text-ink-soft">{t('ship.insurance')}</p>}
            </Card>
          </Step>
        )}

        {cur === 'offers' && (
          <Step>
            <div className="grid gap-4 md:grid-cols-3">
              {entries.map((e) => (
                <Card key={e.offer.id} className={cx('min-w-0 p-4 sm:p-5', lowQuote?.offer.id === e.offer.id && 'border-warn/60 ring-1 ring-warn/40')}>
                  <div className="flex items-start justify-between gap-2">
                    <CarrierName carrier={e.carrier} className="flex-wrap text-base" />
                    {lowQuote?.offer.id === e.offer.id && <Badge tone="warn">{t('demo.lowestQuote')}</Badge>}
                  </div>
                  <div className="mt-3 text-xs text-ink-soft">{t('csv.quoted')}</div>
                  <div className="tabular text-2xl font-bold tracking-tight">{fmt.money(e.analysis.price, e.offer.currency)}</div>
                  <div className="mt-2 text-xs text-ink-soft">{t(`transport.${e.offer.transportType}`)} · {e.analysis.deliveryDays} {t('common.daysShort')}</div>
                  <div className="mt-3"><EndpointBadge endpoint={e.offer.endpoint} /></div>
                  {e.offer.endpointLabel && <div className="mt-1 text-xs text-ink-soft">{e.offer.endpointLabel}</div>}
                  {e.offer.notes && <p className="mt-3 border-t border-line pt-3 text-xs text-ink-soft">{e.offer.notes}</p>}
                </Card>
              ))}
            </div>
          </Step>
        )}

        {cur === 'cost' && (
          <Step>
            <div className="grid gap-4 md:grid-cols-3">
              {entries.map((e) => (
                <Card key={e.offer.id} className={cx('min-w-0 p-4 sm:p-5', e.item.rank === 1 && 'border-teal/60 ring-1 ring-teal/30')}>
                  <div className="flex items-start justify-between gap-2">
                    <CarrierName carrier={e.carrier} className="flex-wrap text-base" />
                    <ComparabilityBadge value={e.item.comparability} />
                  </div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-2"><dt className="text-ink-soft">{t('csv.quoted')}</dt><dd className="tabular font-medium">{fmt.money(e.analysis.price)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-ink-soft">{t('res.known')}</dt><dd className="tabular font-medium">{fmt.money(e.analysis.lowerBound)}</dd></div>
                    <div className="flex justify-between gap-2 border-t border-line pt-2"><dt className="font-medium">{t('res.final')}</dt>
                      <dd className="tabular text-right font-bold">{e.item.total !== null ? fmt.money(e.item.total) : <span className="text-xs font-semibold text-warn-ink">{t('res.infoRequired')}</span>}</dd></div>
                  </dl>
                  <div className="mt-3"><CostBar entry={e} /></div>
                  {e.item.rank === 1 && <p className="mt-3 text-xs font-medium text-ok">{t('demo.onlyComparable')}</p>}
                  {e.item.bound === 'may_be_cheaper' && <p className="mt-3 text-xs text-warn-ink">{t('res.mayBeCheaper')}</p>}
                </Card>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-soft">{t('res.barHint')}</p>
          </Step>
        )}

        {cur === 'coverage' && (
          <Step>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-4 py-3 text-left font-medium text-ink-soft"> </th>
                      {entries.map((e) => <th key={e.offer.id} className="px-4 py-3 text-left font-semibold">{name(e)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rowsShown.map((k) => (
                      <tr key={k} className="border-t border-line">
                        <th scope="row" className="px-4 py-2.5 text-left font-medium text-ink-soft">{t(`comp.${k}`)}</th>
                        {entries.map((e) => (
                          <td key={e.offer.id} className="px-4 py-2.5"><CostCell row={e.analysis.rows.find((r) => r.key === k)} currency={e.offer.currency} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
              <span><Badge tone="ok">{t('state.included')}</Badge> {t('demo.legendIncluded')}</span>
              <span><Badge tone="warn">{t('state.excluded')}</Badge> / <Badge tone="warn">{t('state.unknown')}</Badge> {t('demo.legendOpen')}</span>
            </div>
          </Step>
        )}

        {cur === 'unknown' && (
          <Step>
            <div className="grid gap-4 md:grid-cols-3">
              {entries.map((e) => (
                <Card key={e.offer.id} className="min-w-0 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <CarrierName carrier={e.carrier} className="flex-wrap" />
                    <Badge tone={e.analysis.missing.length ? 'warn' : 'ok'}>{e.analysis.missing.length}</Badge>
                  </div>
                  {e.analysis.missing.length === 0 ? (
                    <p className="mt-3 flex items-center gap-2 text-sm text-ok"><Check size={16} /> {t('demo.nothingMissing')}</p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-sm">
                      {e.analysis.missing.map((m, i) => (
                        <li key={i} className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
                          <span>{m.key === 'charge' ? m.name || t('comp.additional') : t(`comp.${m.key}`)}<span className="text-ink-soft"> — {t(`demo.reason.${m.reason}`)}</span></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-soft">{t('demo.neverZero')}</p>
          </Step>
        )}

        {cur === 'endpoint' && (
          <Step>
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-teal/40 bg-teal/5 p-3 text-sm">
              <MapPin size={16} className="shrink-0 text-teal" /><span className="text-ink-soft">{t('res.target')}:</span><b>{s.deliveryPoint}</b>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {entries.map((e) => (
                <Card key={e.offer.id} className={cx('min-w-0 p-4 sm:p-5', e.analysis.destination.gap && 'border-warn/50')}>
                  <CarrierName carrier={e.carrier} className="flex-wrap" />
                  <div className="mt-3 flex flex-wrap items-center gap-2"><EndpointBadge endpoint={e.offer.endpoint} />{e.offer.endpointLabel && <span className="text-xs text-ink-soft">{e.offer.endpointLabel}</span>}</div>
                  {e.analysis.destination.gap ? (
                    <p className="mt-3 flex gap-2 text-sm text-warn-ink"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{t('res.gapNote')}</p>
                  ) : (
                    <p className="mt-3 flex gap-2 text-sm text-ok"><Check size={16} className="mt-0.5 shrink-0" />{t('demo.reachesDestination')}</p>
                  )}
                </Card>
              ))}
            </div>
          </Step>
        )}

        {cur === 'questions' && (
          <Step>
            <div className="grid gap-4 md:grid-cols-3">
              {entries.map((e) => (
                <Card key={e.offer.id} className="min-w-0 p-4 sm:p-5">
                  <CarrierName carrier={e.carrier} className="flex-wrap" />
                  {e.questions.length === 0 ? (
                    <p className="mt-3 flex items-center gap-2 text-sm text-ok"><Check size={16} /> {t('res.noQuestions')}</p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-sm">
                      {e.questions.map((q) => <li key={q.id} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />{t(q.key, q.params)}</li>)}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          </Step>
        )}

        {cur === 'final' && (
          <Step>
            {an.lowestQuoteNotBest && (
              <Banner tone="warn" title={t('demo.punchTitle')} className="mb-5">
                {t('demo.punch', { low: name(lowQuote), lowQuote: fmt.money(lowQuote.analysis.price), best: name(an.best), bestTotal: fmt.money(result.bestTotal) })}
              </Banner>
            )}
            <AutoAnalysis view={view} />
            <div className="grid gap-4 md:grid-cols-3">
              {entries.map((e) => (
                <Card key={e.offer.id} className="min-w-0 p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-2"><CarrierName carrier={e.carrier} className="flex-wrap" /><ComparabilityBadge value={e.item.comparability} /></div>
                  <ExplainPanel e={e} result={result} />
                </Card>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="primary" icon={FileText} onClick={() => navigate(`/comparisons/${JURY_IDS.comparison}`)}>{t('demo.openResults')}</Button>
              <Button icon={FileText} onClick={() => navigate(`/comparisons/${JURY_IDS.comparison}/report`)}>{t('res.report')}</Button>
              <Button onClick={() => navigate('/compare/new')}>{t('common.newComparison')}</Button>
            </div>
          </Step>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
          <Button icon={ArrowLeft} disabled={step === 0} onClick={() => setStep(step - 1)} aria-label={t('common.back')}>
            <span className="max-sm:hidden">{t('common.back')}</span>
          </Button>
          <Button
            icon={RotateCcw}
            data-demo-reset
            aria-label={t('demo.reset')}
            onClick={async () => {
              await launchDemo();
              setStep(0);
            }}
          >
            <span className="max-sm:hidden">{t('demo.reset')}</span>
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" data-demo-next onClick={() => setStep(step + 1)}>
              {t('wiz.next')} <ArrowRight size={16} />
            </Button>
          ) : (
            <Button variant="primary" onClick={() => navigate('/')}>{t('demo.finish')}</Button>
          )}
        </div>
        <p className="mx-auto max-w-5xl px-4 pb-2 text-center text-[11px] text-ink-soft">{t('demo.hint')} · <Link to="/" className="inline-flex min-h-[44px] items-center underline">{t('nav.dashboard')}</Link></p>
      </div>
    </div>
  );
}
