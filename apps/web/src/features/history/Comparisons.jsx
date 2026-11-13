import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, GitCompare, Plus, Search } from 'lucide-react';
import { useApp } from '../../app/DataContext.jsx';
import { Badge, Button, Card, EmptyState, Input, PageHeader } from '../../components/ui.jsx';
import { StatusBadge, route } from '../../components/common.jsx';
import { useFilteredViews } from './History.jsx';

export default function Comparisons() {
  const { t, fmt, views } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const rows = useFilteredViews({ q });
  return (
    <div>
      <PageHeader
        title={t('nav.comparisons')}
        subtitle={t('cmp.subtitle')}
        actions={<Button variant="primary" icon={Plus} onClick={() => navigate('/compare/new')}>{t('common.newComparison')}</Button>}
      />
      <div className="relative mb-5 max-w-md">
        <Search size={16} className="absolute left-3 top-3 text-ink-soft" />
        <Input className="pl-9" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
      </div>
      {views.length === 0 ? (
        <Card><EmptyState icon={GitCompare} title={t('empty.comparisons.title')} text={t('empty.comparisons.text')} action={<Button variant="primary" icon={Plus} onClick={() => navigate('/compare/new')}>{t('common.newComparison')}</Button>} /></Card>
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={Search} title={t('common.nothingFound')} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((v) => (
            <Link key={v.comparison.id} to={`/comparisons/${v.comparison.id}`} className="card block p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[15px] font-semibold leading-snug">{v.comparison.name}</h3>
                <StatusBadge status={v.result.status} />
              </div>
              <div className="mt-1 text-xs text-ink-soft">{route(v.shipment)} · {fmt.date(v.comparison.createdAt)}</div>
              <div className="mt-3 flex flex-wrap gap-1">
                {v.entries.map((e) => <Badge key={e.offer.id}>{e.carrier?.name ?? '—'}</Badge>)}
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="text-xs text-ink-soft">{t('res.bestOffer')}</div>
                  <div className="tabular text-lg font-bold">{v.result.bestTotal !== null ? fmt.money(v.result.bestTotal) : '—'}</div>
                </div>
                <ArrowRight size={18} className="text-ink-soft" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
