import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GitCompare, Layers, Truck } from 'lucide-react';
import { useApp } from '../../app/DataContext.jsx';
import { Card, CardHeader, EmptyState } from '../../components/ui.jsx';
import { COMPONENT_COLORS } from '../../lib/palette.js';
import { LegendList, short } from '../../lib/chartUtils.jsx';

const AXIS = { fontSize: 12, fill: '#718096' };

/** Loaded lazily: recharts is the heaviest dependency and is not needed for the first paint. */
export default function DashboardCharts({ expense, activity, dist, donut, H, phone }) {
  const { t, fmt } = useApp();
  return (
      <div className="mt-5 grid grid-cols-1 gap-5 sm:mt-6 sm:gap-6 xl:grid-cols-3" data-charts>
        <Card className="min-w-0">
          <CardHeader title={t('dash.chartExpense')} subtitle={t('dash.chartExpenseHint', { n: expense.counted })} />
          {donut.length === 0 ? (
            <EmptyState icon={Layers} title={t('dash.noChartData')} />
          ) : (
            <>
              <div className="px-1 pt-3" style={{ height: H }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
                      {donut.map((p) => <Cell key={p.key} fill={COMPONENT_COLORS[p.key]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt.money(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <LegendList items={donut.map((p) => ({ key: p.key, label: `${p.name} · ${fmt.money(p.value)}`, color: COMPONENT_COLORS[p.key] }))} />
            </>
          )}
        </Card>

        <Card className="min-w-0">
          <CardHeader title={t('dash.chartSpend')} subtitle={t('dash.chartSpendHint')} />
          {activity.every((w) => w.priced === 0) ? (
            <EmptyState icon={GitCompare} title={t('dash.noChartData')} />
          ) : (
            <div className="px-1 pb-3 pt-4" style={{ height: H + 20 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activity} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid vertical={false} stroke="#E6ECF4" />
                  <XAxis dataKey="week" tick={AXIS} tickLine={false} interval="preserveStartEnd" tickFormatter={(w) => fmt.date(w).replace(/\s?\d{4}.*$/, '')} />
                  <YAxis width={phone ? 40 : 52} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                  <Tooltip labelFormatter={(w) => `${t('dash.weekOf')} ${fmt.date(w)}`} formatter={(v, n, p) => [fmt.money(v), `${t('dash.spendShort')} (${p.payload.priced}/${p.payload.count})`]} />
                  <Bar dataKey="spend" fill="#2864DC" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="min-w-0">
          <CardHeader title={t('dash.chartCarriers')} subtitle={t('dash.chartCarriersHint')} />
          {dist.length === 0 ? (
            <EmptyState icon={Truck} title={t('dash.noChartData')} />
          ) : (
            <div className="px-1 pb-3 pt-4" style={{ height: Math.max(H + 20, 70 + dist.length * 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dist} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#E6ECF4" />
                  <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} />
                  <YAxis type="category" dataKey="carrier" width={phone ? 92 : 120} tick={AXIS} tickLine={false} tickFormatter={short(phone ? 14 : 18)} />
                  <Tooltip formatter={(v) => [v, t('dash.offersShort')]} />
                  <Bar dataKey="offers" fill="#16A69A" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
  );
}
