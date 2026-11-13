import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, GitCompare, PiggyBank, Plus, Truck, Wallet } from 'lucide-react';
import { dashboardStats } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Button, Card, CardHeader, EmptyState, StatCard } from '../../components/ui.jsx';
import { CarrierName, EndpointBadge, StatusBadge, route } from '../../components/common.jsx';
import { useIsTabletUp } from '../../lib/useMedia.js';

export default function Dashboard() {
  const { t, data, views, fmt, settings } = useApp();
  const navigate = useNavigate();
  const tabletUp = useIsTabletUp();
  const stats = useMemo(() => dashboardStats(views, data.shipments), [views, data.shipments]);
  const carrierById = useMemo(() => new Map(data.carriers.map((c) => [c.id, c])), [data.carriers]);
  const shipmentById = useMemo(() => new Map(data.shipments.map((s) => [s.id, s])), [data.shipments]);
  const latestOffers = data.offers.slice(0, 6);
  const recent = views.slice(0, 5);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t('dash.welcome')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('dash.subtitle')}</p>
        </div>
        <Button variant="primary" size="lg" icon={Plus} className="w-full sm:w-auto" onClick={() => navigate('/compare/new')}>
          {t('common.newComparison')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={GitCompare} label={t('dash.totalComparisons')} value={stats.totalComparisons} />
        <StatCard icon={Truck} tone="teal" label={t('dash.activeShipments')} value={stats.activeShipments} />
        <StatCard
          icon={Wallet}
          tone="warn"
          label={t('dash.avgCost')}
          value={fmt.money(stats.averageBestCost)}
          hint={stats.averageSample ? t('dash.avgHint', { n: stats.averageSample }) : t('dash.noData')}
        />
        <StatCard
          icon={PiggyBank}
          tone="ok"
          label={t('dash.savings')}
          value={fmt.money(stats.potentialSavings)}
          hint={stats.savingsSample ? t('dash.savingsHint', { n: stats.savingsSample }) : t('dash.noData')}
        />
      </div>

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

        <Card className={`min-w-0 self-start ${stats.notifications.length > 0 ? 'max-xl:order-first' : ''}`}>
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
      </div>
    </div>
  );
}
