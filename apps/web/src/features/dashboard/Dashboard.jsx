import { lazy, Suspense, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, GitCompare, Layers, PiggyBank, Play, Plus, Truck, X, Bot } from 'lucide-react';
import { activityByWeek, dashboardStats, expenseByCategory, offersByCarrier } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Badge, Button, Card, CardHeader, EmptyState, StatCard } from '../../components/ui.jsx';
import { COMPONENT_COLORS } from '../../lib/palette.js';
import { useIsPhone } from '../../lib/useMedia.js';
import { ChartSkeleton } from '../../components/Skeleton.jsx';
import { short } from '../../lib/chartUtils.jsx';
import { CarrierName, EndpointBadge, StatusBadge, route } from '../../components/common.jsx';
import { useIsTabletUp } from '../../lib/useMedia.js';

const DashboardCharts = lazy(() => import('./DashboardCharts.jsx'));

/** First-visit explanation: what the product does in ~30 seconds, with the two obvious next actions. */
function Welcome() {
  const { t, repo, reload, launchDemo } = useApp();
  const navigate = useNavigate();
  const dismiss = async () => {
    await repo.saveSettings({ onboarded: true });
    reload();
  };
  const steps = [1, 2, 3];
  return (
    <section className="relative mb-5 overflow-hidden rounded-card bg-navy p-5 text-white shadow-card sm:mb-6 sm:p-7" data-welcome>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('onb.dismiss')}
        className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center text-slate-300 hover:text-white"
      >
        <X size={18} />
      </button>
      <div className="max-w-3xl pr-8">
        <div className="text-xs font-semibold uppercase tracking-wide text-teal">{t('onb.kicker')}</div>
        <h2 className="mt-1.5 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{t('onb.headline')}</h2>
        <p className="mt-2 text-sm text-slate-300 sm:text-base">{t('onb.text')}</p>
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {steps.map((n) => (
          <li key={n} className="flex gap-3 rounded-xl bg-white/5 p-3.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal text-sm font-bold">{n}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t(`onb.step${n}.t`)}</div>
              <div className="mt-0.5 text-xs text-slate-300">{t(`onb.step${n}.d`)}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          variant="primary"
          size="lg"
          icon={Play}
          className="max-sm:w-full"
          data-welcome-demo
          onClick={async () => {
            const r = await launchDemo();
            if (r.ok) navigate('/demo');
          }}
        >
          {t('demo.launch')}
        </Button>
        <Button size="lg" icon={Plus} className="max-sm:w-full" onClick={() => navigate('/compare/new')}>{t('common.newComparison')}</Button>
      </div>
      <p className="mt-4 text-xs text-slate-400">{t('onb.local')}</p>
    </section>
  );
}

export default function Dashboard() {
  const { t, data, views, fmt, settings, lang } = useApp();
  const phone = useIsPhone();
  const navigate = useNavigate();
  const tabletUp = useIsTabletUp();
  const stats = useMemo(() => dashboardStats(views, data.shipments), [views, data.shipments]);
  const carrierById = useMemo(() => new Map(data.carriers.map((c) => [c.id, c])), [data.carriers]);
  const shipmentById = useMemo(() => new Map(data.shipments.map((s) => [s.id, s])), [data.shipments]);
  const latestOffers = data.offers.slice(0, 6);
  const recent = views.slice(0, 5);
  const recentShipments = data.shipments.slice(0, 5);
  const expense = useMemo(() => expenseByCategory(views), [views]);
  const activity = useMemo(() => activityByWeek(views), [views]);
  const dist = useMemo(() => offersByCarrier(views), [views]);
  const donut = Object.entries(expense.totals).map(([key, value]) => ({ key, value, name: t(`comp.${key}`) }));
  const H = phone ? 220 : 260;

  return (
    <div>
      {!settings.onboarded && <Welcome />}

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t('dash.welcome')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('dash.subtitle')}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button size="lg" icon={Bot} className="w-full sm:w-auto" onClick={() => navigate('/assistant')}>
            {t('as.title')}
          </Button>
          <Button variant="primary" size="lg" icon={Plus} className="w-full sm:w-auto" onClick={() => navigate('/compare/new')}>
            {t('common.newComparison')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={GitCompare} label={t('dash.totalComparisons')} value={stats.totalComparisons} />
        <StatCard icon={Truck} tone="teal" label={t('dash.activeShipments')} value={stats.activeShipments} />
        <StatCard
          icon={Layers}
          tone="brand"
          label={t('dash.avgOffers')}
          value={stats.averageOffers === null ? '—' : new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(stats.averageOffers)}
          hint={t('dash.avgOffersHint')}
        />
        <StatCard
          icon={AlertTriangle}
          tone="warn"
          label={t('dash.incomplete')}
          value={stats.incompleteComparisons}
          hint={t('dash.incompleteHint', { n: stats.totalComparisons })}
        />
      </div>

      {stats.potentialSavings !== null && (
        <div className="mt-3 flex items-start gap-3 rounded-card border border-line bg-white px-4 py-3 text-sm shadow-card sm:mt-4">
          <PiggyBank size={18} className="mt-0.5 shrink-0 text-ok" />
          <span className="min-w-0">
            <span className="font-medium">{t('dash.savings')}: </span>
            <span className="tabular font-semibold">{fmt.money(stats.potentialSavings)}</span>
            <span className="text-ink-soft"> · {t('dash.savingsHint', { n: stats.savingsSample })}. {t('dash.savingsDisclaimer')}</span>
          </span>
        </div>
      )}

      <Suspense fallback={<div className="mt-5 grid grid-cols-1 gap-5 sm:mt-6 sm:gap-6 xl:grid-cols-3" data-charts-skeleton>{[0, 1, 2].map((i) => <ChartSkeleton key={i} height={H + 90} />)}</div>}>
        <DashboardCharts expense={expense} activity={activity} dist={dist} donut={donut} H={H} phone={phone} />
      </Suspense>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:mt-6 sm:gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 sm:space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              title={t('dash.recent')}
              actions={
                <Link to="/history" className="inline-flex min-h-[40px] items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0">
                  {t('common.viewAll')} <ArrowRight size={14} />
                </Link>
              }
            />
            {recent.length === 0 ? (
              <EmptyState
                icon={GitCompare}
                title={t('empty.comparisons.title')}
                text={t('empty.comparisons.text')}
                action={<Button variant="primary" icon={Plus} onClick={() => navigate('/compare/new')}>{t('common.newComparison')}</Button>}
              />
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((v) => (
                  <li key={v.comparison.id}>
                    <Link to={`/comparisons/${v.comparison.id}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3.5 hover:bg-canvas/60 sm:px-5">
                      <div className="min-w-0 max-sm:w-full">
                        <div className="text-sm font-semibold leading-snug">{v.comparison.name}</div>
                        <div className="mt-0.5 text-xs text-ink-soft">
                          {route(v.shipment)} · {fmt.date(v.comparison.createdAt)} · {t('dash.offersCount', { n: v.entries.length })}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 max-sm:w-full max-sm:flex-row-reverse max-sm:justify-between">
                        <div className="text-right max-sm:text-left">
                          <div className="tabular text-sm font-semibold">
                            {v.result.bestTotal !== null ? fmt.money(v.result.bestTotal) : '—'}
                          </div>
                          {v.missingCount > 0 && (
                            <div className="text-xs text-warn-ink">{t('dash.missingN', { n: v.missingCount })}</div>
                          )}
                        </div>
                        <StatusBadge status={v.result.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title={t('dash.recentShipments')}
              actions={
                <Link to="/shipments" className="inline-flex min-h-[40px] items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0">
                  {t('common.viewAll')} <ArrowRight size={14} />
                </Link>
              }
            />
            {recentShipments.length === 0 ? (
              <EmptyState icon={Truck} title={t('empty.shipments.title')} />
            ) : (
              <ul className="divide-y divide-line">
                {recentShipments.map((sh) => (
                  <li key={sh.id}>
                    <Link to={`/shipments/${sh.id}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3.5 hover:bg-canvas/60 sm:px-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">{sh.name}{sh.isDemo && <Badge tone="neutral" className="uppercase tracking-wide">{t('common.demo')}</Badge>}</div>
                        <div className="mt-0.5 text-xs text-ink-soft">{route(sh)} · {t(`cat.${sh.category}`)}</div>
                      </div>
                      <Badge tone={sh.status === 'active' ? 'teal' : sh.status === 'delivered' ? 'ok' : 'neutral'}>{t(`shipStatus.${sh.status}`)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={t('dash.latestOffers')} subtitle={t('dash.latestOffersHint')} />
            {latestOffers.length === 0 ? (
              <EmptyState icon={Truck} title={t('empty.offers.title')} />
            ) : !tabletUp ? (
              <ul className="divide-y divide-line">
                {latestOffers.map((o) => (
                  <li key={o.id} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CarrierName carrier={carrierById.get(o.carrierId)} className="flex-wrap text-sm" />
                        <div className="mt-0.5 text-xs text-ink-soft">{shipmentById.get(o.shipmentId)?.name ?? '—'}</div>
                      </div>
                      <div className="tabular shrink-0 text-right text-sm font-semibold">
                        {o.price == null ? <span className="text-warn-ink">{t('state.unknown')}</span> : fmt.money(o.price, o.currency)}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
                      <EndpointBadge endpoint={o.endpoint} />
                      {o.deliveryDays != null && <span className="tabular">{o.deliveryDays} {t('common.daysShort')}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-ink-soft">
                    <tr className="border-b border-line">
                      <th className="px-5 py-2.5 font-medium">{t('offer.carrier')}</th>
                      <th className="px-3 py-2.5 font-medium">{t('dash.shipment')}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t('offer.price')}</th>
                      <th className="px-3 py-2.5 font-medium">{t('offer.endpoint')}</th>
                      <th className="px-5 py-2.5 text-right font-medium">{t('offer.days')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {latestOffers.map((o) => (
                      <tr key={o.id}>
                        <td className="px-5 py-3"><CarrierName carrier={carrierById.get(o.carrierId)} /></td>
                        <td className="px-3 py-3 text-ink-soft">{shipmentById.get(o.shipmentId)?.name ?? '—'}</td>
                        <td className="tabular px-3 py-3 text-right font-medium">
                          {o.price == null ? <span className="text-warn-ink">{t('state.unknown')}</span> : fmt.money(o.price, o.currency)}
                        </td>
                        <td className="px-3 py-3"><EndpointBadge endpoint={o.endpoint} /></td>
                        <td className="tabular px-5 py-3 text-right text-ink-soft">{o.deliveryDays ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className={`min-w-0 space-y-5 self-start sm:space-y-6 ${stats.notifications.length > 0 ? 'max-xl:order-first' : ''}`}>
        <Card className="min-w-0">
          <CardHeader title={t('dash.notifications')} subtitle={t('dash.notificationsHint')} />
          {!settings.notifications.missingInfo ? (
            <EmptyState title={t('dash.notificationsOff')} />
          ) : stats.notifications.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={t('dash.allClear')} />
          ) : (
            <ul className="divide-y divide-line">
              {stats.notifications.map((n) => (
                <li key={n.comparisonId}>
                  <Link to={`/comparisons/${n.comparisonId}`} className="flex gap-3 px-5 py-3.5 hover:bg-canvas/60">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{n.name}</div>
                      <div className="text-xs text-ink-soft">
                        {t('dash.notifText', { missing: n.missingCount, offers: n.incompleteOffers })}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 p-4 sm:p-5" data-dash-assistant>
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-white"><Bot size={18} /></span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold">{t('as.title')}</h3>
              <p className="mt-1 text-sm text-ink-soft">
                {views.length === 0
                  ? t('dash.assistantEmpty')
                  : stats.notifications.length > 0
                    ? t('dash.assistantOpen', { n: stats.notifications.length })
                    : t('dash.assistantClear')}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row xl:flex-col">
            {stats.notifications[0] && (
              <Button variant="primary" icon={Bot} onClick={() => navigate(`/assistant?c=${stats.notifications[0].comparisonId}`)}>{t('dash.assistantAsk', { name: short(26)(stats.notifications[0].name) })}</Button>
            )}
            <Button onClick={() => navigate('/assistant')}>{t('dash.assistantOpenChat')}</Button>
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">{t('as.engine.rules')}</p>
        </Card>
        </div>
      </div>
    </div>
  );
}
