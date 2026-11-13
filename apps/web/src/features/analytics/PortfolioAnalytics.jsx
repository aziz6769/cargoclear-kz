import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, FilterX } from 'lucide-react';
import { carrierComparison, costDynamics, extraCostStructure, filterViews, listRoutes, spendByPeriod, spendByRoute } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Badge, Banner, Button, Card, CardHeader, EmptyState, Field, Input, Select, StatCard } from '../../components/ui.jsx';
import { COMPONENT_COLORS } from '../../lib/palette.js';
import { useIsPhone } from '../../lib/useMedia.js';
import { short } from '../../lib/chartUtils.jsx';
import { Wallet, GitCompare, Trophy } from 'lucide-react';

const AXIS = { fontSize: 12, fill: '#718096' };
const compact = (v) => (Math.abs(v) >= 1_000_000 ? `${+(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v);

function Chart({ title, subtitle, height, children, empty, emptyText }) {
  return (
    <Card className="min-w-0">
      <CardHeader title={title} subtitle={subtitle} />
      {empty ? <EmptyState title={emptyText} /> : <div className="px-1 pb-2 pt-4 sm:px-3" style={{ height }}>{children}</div>}
    </Card>
  );
}

/** Portfolio analytics: every number is derived from the calculation engine for the filtered comparisons. */
export default function PortfolioAnalytics() {
  const { t, views, data, fmt } = useApp();
  const phone = useIsPhone();
  const [params, setParams] = useSearchParams();
  const f = { from: params.get('from') ?? '', to: params.get('to') ?? '', route: params.get('route') ?? '', carrierId: params.get('carrier') ?? '' };
  const gran = params.get('gran') === 'week' ? 'week' : 'month';
  const setP = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const H = phone ? 230 : 290;

  const routes = useMemo(() => listRoutes(views), [views]);
  const filtered = useMemo(() => filterViews(views, f), [views, f.from, f.to, f.route, f.carrierId]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMemo(
    () => ({
      period: spendByPeriod(filtered, gran),
      dynamics: costDynamics(filtered),
      byRoute: spendByRoute(filtered),
      extras: extraCostStructure(filtered).map((r) => ({ ...r, name: t(`comp.${r.key}`) })),
      carriers: carrierComparison(filtered),
    }),
    [filtered, gran, t],
  );
  const total = m.period.reduce((s, r) => s + r.total, 0);
  const priced = m.period.reduce((s, r) => s + r.priced, 0);
  const wins = m.carriers.reduce((s, r) => s + r.wins, 0);
  const anyFilter = Object.values(f).some(Boolean);
  const label = (p) => (gran === 'month' ? p : fmt.date(p));

  return (
    <div data-portfolio>
      <Card className="mb-5 p-3 sm:p-4" data-analytics-filters>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
          <Field label={t('ana.from')}><Input type="date" value={f.from} max={f.to || undefined} onChange={(e) => setP('from', e.target.value)} data-f-from /></Field>
          <Field label={t('ana.to')}><Input type="date" value={f.to} min={f.from || undefined} onChange={(e) => setP('to', e.target.value)} data-f-to /></Field>
          <Field label={t('ana.route')}>
            <Select value={f.route} onChange={(e) => setP('route', e.target.value)} data-f-route>
              <option value="">{t('ana.allRoutes')}</option>
              {routes.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label={t('ana.carrier')}>
            <Select value={f.carrierId} onChange={(e) => setP('carrier', e.target.value)} data-f-carrier>
              <option value="">{t('ana.allCarriers')}</option>
              {data.carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Button icon={FilterX} disabled={!anyFilter} onClick={() => setParams(params.get('tab') ? { tab: params.get('tab') } : {}, { replace: true })} className="sm:col-span-2 lg:col-span-1">{t('common.resetFilters')}</Button>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card><EmptyState icon={BarChart3} title={t('ana.noMatch')} text={t('ana.noMatchText')} action={anyFilter && <Button onClick={() => setParams({}, { replace: true })}>{t('common.resetFilters')}</Button>} /></Card>
      ) : (
        <>
          <Banner tone="info" className="mb-5 text-xs">{t('ana.portfolioNote', { cur: filtered[0].result.baseCurrency })}</Banner>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard icon={GitCompare} label={t('ana.kpiComparisons')} value={filtered.length} />
            <StatCard icon={Trophy} tone="teal" label={t('ana.kpiPriced')} value={`${priced} / ${filtered.length}`} hint={t('ana.kpiPricedHint')} />
            <StatCard icon={Wallet} label={t('ana.kpiTotal')} value={priced ? fmt.money(total) : '—'} hint={t('ana.kpiTotalHint')} />
            <StatCard icon={Wallet} tone="teal" label={t('ana.kpiAvg')} value={priced ? fmt.money(total / priced) : '—'} />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader
                title={t('ana.spendPeriod')}
                subtitle={t('ana.spendPeriodHint')}
                actions={
                  <Select className="w-36" value={gran} onChange={(e) => setP('gran', e.target.value === 'month' ? '' : e.target.value)} aria-label={t('ana.granularity')}>
                    <option value="month">{t('ana.byMonth')}</option>
                    <option value="week">{t('ana.byWeek')}</option>
                  </Select>
                }
              />
              {m.period.every((r) => r.priced === 0) ? (
                <EmptyState title={t('ana.noPriced')} />
              ) : (
                <div className="px-1 pb-2 pt-4 sm:px-3" style={{ height: H }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={m.period} margin={{ left: 0, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E4EAF1" vertical={false} />
                      <XAxis dataKey="period" tick={AXIS} tickLine={false} tickFormatter={(p) => (gran === 'month' ? p : fmt.date(p).replace(/\s?\d{4}.*$/, ''))} interval="preserveStartEnd" />
                      <YAxis width={phone ? 44 : 56} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} />
                      <Tooltip labelFormatter={label} formatter={(v, n, p) => [fmt.money(v), `${t('ana.kpiTotal')} (${p.payload.priced}/${p.payload.comparisons})`]} cursor={{ fill: '#F4F7FB' }} />
                      <Bar dataKey="total" fill="#2864DC" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Chart title={t('ana.dynamics')} subtitle={t('ana.dynamicsHint')} height={H} empty={m.dynamics.length === 0} emptyText={t('ana.noPriced')}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={m.dynamics} margin={{ left: 0, right: 12, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4EAF1" vertical={false} />
                  <XAxis dataKey="date" tick={AXIS} tickLine={false} tickFormatter={(d) => fmt.date(d).replace(/\s?\d{4}.*$/, '')} interval="preserveStartEnd" />
                  <YAxis width={phone ? 44 : 56} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} domain={['auto', 'auto']} />
                  <Tooltip labelFormatter={(d, p) => `${fmt.date(d)}${p?.[0] ? ` · ${p[0].payload.name}` : ''}`} formatter={(v) => [fmt.money(v), t('ana.bestTotal')]} />
                  <Line type="monotone" dataKey="total" stroke="#16A69A" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </Chart>

            <Chart title={t('ana.spendRoute')} subtitle={t('ana.spendRouteHint')} height={Math.max(H, 70 + m.byRoute.length * 44)} empty={m.byRoute.every((r) => r.priced === 0)} emptyText={t('ana.noPriced')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={m.byRoute.filter((r) => r.priced > 0)} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4EAF1" horizontal={false} />
                  <XAxis type="number" tick={AXIS} tickLine={false} tickFormatter={compact} />
                  <YAxis type="category" dataKey="route" width={phone ? 96 : 150} tick={AXIS} tickLine={false} tickFormatter={short(phone ? 15 : 24)} />
                  <Tooltip formatter={(v, n, p) => [fmt.money(v), `${t('ana.kpiTotal')} (${p.payload.priced})`]} cursor={{ fill: '#F4F7FB' }} />
                  <Bar dataKey="total" fill="#2864DC" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Chart>

            <Card className="min-w-0">
              <CardHeader title={t('ana.extraStructure')} subtitle={t('ana.extraStructureHint')} />
              {m.extras.length === 0 ? (
                <EmptyState title={t('ana.noExtras')} />
              ) : (
                <>
                  <div className="px-1 pb-2 pt-4 sm:px-3" style={{ height: H }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={m.extras.filter((r) => r.money > 0)} margin={{ left: 0, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E4EAF1" vertical={false} />
                        <XAxis dataKey="name" tick={AXIS} tickLine={false} interval={0} tickFormatter={short(phone ? 7 : 12)} />
                        <YAxis width={phone ? 44 : 56} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} />
                        <Tooltip formatter={(v) => fmt.money(v)} cursor={{ fill: '#F4F7FB' }} />
                        <Bar dataKey="money" name={t('ana.confirmedMoney')} fill="#16A69A" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="border-t border-line px-4 py-3 sm:px-5">
                    <div className="mb-1.5 text-xs font-medium text-ink-soft">{t('ana.unresolved')}</div>
                    <ul className="flex flex-wrap gap-1.5" data-unresolved>
                      {m.extras.filter((r) => r.unknown > 0).map((r) => <li key={r.key}><Badge tone="warn">{r.name}: {r.unknown}</Badge></li>)}
                      {m.extras.every((r) => r.unknown === 0) && <li className="text-xs text-ink-soft">{t('ana.noneUnresolved')}</li>}
                    </ul>
                  </div>
                </>
              )}
            </Card>
          </div>

          <Card className="mt-5 sm:mt-6" data-carrier-table>
            <CardHeader title={t('ana.carrierCompare')} subtitle={t('ana.carrierCompareHint')} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-ink-soft">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 font-medium sm:px-5">{t('offer.carrier')}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t('car.statOffers')}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t('ana.comparableCount')}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t('car.statWins')}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t('car.statAvg')}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t('ana.minQuote')}</th>
                    <th className="px-4 py-2.5 text-right font-medium sm:px-5">{t('ana.avgUnknown')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {m.carriers.map((r) => (
                    <tr key={r.carrierId}>
                      <td className="px-4 py-3 font-medium sm:px-5">{r.carrier}</td>
                      <td className="tabular px-3 py-3 text-right">{r.offers}</td>
                      <td className="tabular px-3 py-3 text-right">{r.comparable}</td>
                      <td className="tabular px-3 py-3 text-right font-semibold">{r.wins}</td>
                      <td className="tabular px-3 py-3 text-right">{r.avgQuote === null ? '—' : fmt.money(r.avgQuote)}</td>
                      <td className="tabular px-3 py-3 text-right">{r.minQuote === null ? '—' : fmt.money(r.minQuote)}</td>
                      <td className="tabular px-4 py-3 text-right sm:px-5">{r.avgUnknown}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-3 text-xs text-ink-soft sm:px-5">{t('ana.carrierCompareNote', { n: wins })}</p>
          </Card>
        </>
      )}
    </div>
  );
}
