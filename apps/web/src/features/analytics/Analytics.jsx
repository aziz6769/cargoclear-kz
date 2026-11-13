import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Plus } from 'lucide-react';
import { COST_COMPONENTS, carrierBreakdown, componentDistribution, knownVsUnknown } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Banner, Button, Card, CardHeader, EmptyState, PageHeader, Select } from '../../components/ui.jsx';
import { route } from '../../components/common.jsx';
import { COMPONENT_COLORS } from '../../lib/palette.js';
import { useIsPhone } from '../../lib/useMedia.js';

const AXIS = { fontSize: 12, fill: '#718096' };
const compact = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v);

const short = (n) => (v) => (String(v).length > n ? `${String(v).slice(0, n - 1)}…` : v);

/** Legend drawn in HTML next to the chart: wraps freely, can never be clipped by the SVG viewport. */
function LegendList({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 pb-4 text-xs text-ink-soft">
      {items.map((i) => (
        <li key={i.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function ChartCard({ title, subtitle, height, legend, children }) {
  return (
    <Card className="min-w-0">
      <CardHeader title={title} subtitle={subtitle} />
      <div className="px-1 pb-2 pt-4 sm:px-3" style={{ height }}>{children}</div>
      {legend}
    </Card>
  );
}

export default function Analytics() {
  const { t, views, fmt } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const phone = useIsPhone();
  const [donutOffer, setDonutOffer] = useState(null);
  const H = phone ? 240 : 320;
  const yW = phone ? 40 : 56;

  const view = views.find((v) => v.comparison.id === params.get('c')) ?? views[0];

  const model = useMemo(() => {
    if (!view) return null;
    const entries = view.entries;
    const breakdown = carrierBreakdown(entries);
    const donutEntry = entries.find((e) => e.offer.id === donutOffer) ?? entries.find((e) => !e.item.currencyBlocked) ?? entries[0];
    return {
      entries,
      breakdown,
      bases: breakdown.map((r) => ({ name: r.carrier, value: r.base })),
      extras: breakdown.map((r) => ({ name: r.carrier, value: r.extras })),
      kvu: knownVsUnknown(entries),
      donutEntry,
      donut: donutEntry ? componentDistribution(donutEntry).map((p) => ({ ...p, name: t(`comp.${p.key}`) })) : [],
      omitted: entries.filter((e) => e.item.currencyBlocked),
    };
  }, [view, donutOffer, t]);

  if (!view)
    return (
      <div>
        <PageHeader title={t('nav.analytics')} />
        <Card><EmptyState icon={BarChart3} title={t('empty.analytics.title')} text={t('empty.analytics.text')} action={<Button variant="primary" icon={Plus} onClick={() => navigate('/compare/new')}>{t('common.newComparison')}</Button>} /></Card>
      </div>
    );

  const money = (v) => fmt.money(v);
  const stackKeys = ['base', ...COMPONENT_KEYS_ORDER].filter((k) => model.breakdown.some((r) => r[k] > 0));

  return (
    <div>
      <PageHeader
        title={t('nav.analytics')}
        subtitle={t('ana.subtitle')}
        actions={
          <Select className="w-full sm:w-72" value={view.comparison.id} onChange={(e) => setParams({ c: e.target.value })} aria-label={t('ana.pick')}>
            {views.map((v) => <option key={v.comparison.id} value={v.comparison.id}>{v.comparison.name}</option>)}
          </Select>
        }
      />
      <p className="mb-4 text-sm text-ink-soft">{route(view.shipment)} · {t('ana.currencyNote', { cur: view.result.baseCurrency })}</p>
      {model.omitted.length > 0 && (
        <Banner tone="info" className="mb-4">
          {t('ana.omitted', { list: model.omitted.map((e) => `${e.carrier?.name ?? '—'} (${e.offer.currency})`).join(', ') })}
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-2">
        <ChartCard title={t('ana.base')} subtitle={t('ana.baseHint')} height={H}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={model.bases} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4EAF1" vertical={false} />
              <XAxis dataKey="name" tick={AXIS} tickLine={false} interval={0} tickFormatter={short(phone ? 9 : 16)} />
              <YAxis width={yW} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} />
              <Tooltip formatter={(v) => money(v)} cursor={{ fill: '#F4F7FB' }} />
              <Bar dataKey="value" name={t('comp.base')} fill="#2864DC" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t('ana.breakdown')} subtitle={t('ana.breakdownHint')} height={H} legend={<LegendList items={stackKeys.map((k) => ({ key: k, label: t(`comp.${k}`), color: COMPONENT_COLORS[k] }))} />}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={model.breakdown} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4EAF1" vertical={false} />
              <XAxis dataKey="carrier" tick={AXIS} tickLine={false} interval={0} tickFormatter={short(phone ? 9 : 16)} />
              <YAxis width={yW} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} />
              <Tooltip formatter={(v, n) => [money(v), n]} cursor={{ fill: '#F4F7FB' }} />
              {stackKeys.map((k) => (
                <Bar key={k} dataKey={k} stackId="a" name={t(`comp.${k}`)} fill={COMPONENT_COLORS[k]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <CardHeader
            title={t('ana.distribution')}
            subtitle={t('ana.distributionHint')}
            actions={
              <Select className="w-full sm:w-52" value={model.donutEntry?.offer.id ?? ''} onChange={(e) => setDonutOffer(e.target.value)} aria-label={t('offer.carrier')}>
                {model.entries.map((e) => <option key={e.offer.id} value={e.offer.id}>{e.carrier?.name ?? '—'}</option>)}
              </Select>
            }
          />
          <div className="px-1 pb-2 pt-4 sm:px-3" style={{ height: H }}>
            {model.donut.length === 0 ? (
              <EmptyState title={t('ana.noConfirmed')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={model.donut} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
                    {model.donut.map((p) => <Cell key={p.key} fill={COMPONENT_COLORS[p.key]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt.money(v, model.donutEntry.offer.currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <LegendList items={model.donut.map((p) => ({ key: p.key, label: `${p.name} · ${fmt.money(p.value, model.donutEntry.offer.currency)}`, color: COMPONENT_COLORS[p.key] }))} />
        </Card>

        <ChartCard title={t('ana.extras')} subtitle={t('ana.extrasHint')} height={H}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={model.extras} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4EAF1" vertical={false} />
              <XAxis dataKey="name" tick={AXIS} tickLine={false} interval={0} tickFormatter={short(phone ? 9 : 16)} />
              <YAxis width={yW} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} />
              <Tooltip formatter={(v) => money(v)} cursor={{ fill: '#F4F7FB' }} />
              <Bar dataKey="value" name={t('ana.extras')} fill="#16A69A" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="xl:col-span-2">
          <ChartCard title={t('ana.kvu')} subtitle={t('ana.kvuHint')} height={phone ? 60 + model.kvu.length * 56 : 320}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.kvu} layout="vertical" margin={{ left: 0, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4EAF1" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} />
                <YAxis type="category" dataKey="carrier" tick={AXIS} tickLine={false} width={phone ? 88 : 130} tickFormatter={short(phone ? 13 : 24)} />
                <Tooltip cursor={{ fill: '#F4F7FB' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="known" stackId="k" name={t('ana.known')} fill="#16A36A" />
                <Bar dataKey="unknown" stackId="k" name={t('ana.unknown')} fill="#F2B544" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

const COMPONENT_KEYS_ORDER = [...COST_COMPONENTS, 'additional'];
