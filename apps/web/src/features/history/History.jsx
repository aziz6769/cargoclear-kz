import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Eye, FileDown, GitCompare, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { comparisonToCsv } from '@cargoclear/core';
import { downloadText } from '../../lib/download.js';
import { useApp } from '../../app/DataContext.jsx';
import { Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Select } from '../../components/ui.jsx';
import { StatusBadge, route } from '../../components/common.jsx';
import { useIsTabletUp } from '../../lib/useMedia.js';

export function useFilteredViews({ q, status = 'all', carrierId = 'all', from = '', to = '' }) {
  const { views } = useApp();
  return useMemo(() => {
    const needle = q.trim().toLowerCase();
    return views.filter((v) => {
      if (status !== 'all' && v.result.status !== status) return false;
      if (carrierId !== 'all' && !v.entries.some((e) => e.offer.carrierId === carrierId)) return false;
      const day = String(v.comparison.createdAt ?? '').slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!needle) return true;
      const hay = [v.comparison.name, v.shipment.name, v.shipment.origin, v.shipment.destination, ...v.entries.map((e) => e.carrier?.name ?? '')]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [views, q, status, carrierId, from, to]);
}

export function useComparisonActions() {
  const { repo, act, t } = useApp();
  const navigate = useNavigate();
  return {
    duplicate: async (id) => {
      const r = await act(() => repo.duplicateComparison(id, ` ${t('common.copySuffix')}`), 'res.duplicated');
      if (r.ok) navigate(`/comparisons/${r.value.id}`);
    },
    remove: (id) => act(() => repo.deleteComparison(id), 'res.deleted'),
  };
}

export default function History() {
  const { t, data, views, fmt, lang, notify } = useApp();
  const navigate = useNavigate();
  const tabletUp = useIsTabletUp();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [carrierId, setCarrierId] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [del, setDel] = useState(null);
  const rows = useFilteredViews({ q, status, carrierId, from, to });
  const actions = useComparisonActions();

  return (
    <div>
      <PageHeader
        title={t('nav.history')}
        subtitle={t('hist.subtitle')}
        actions={
          <>
            <Button
              icon={FileDown}
              disabled={rows.length === 0}
              data-export-all
              onClick={() => {
                const text = rows.map((v, i) => comparisonToCsv(v, t, lang).replace(i ? /^\ufeff/ : /^$/, '')).join('\r\n\r\n');
                downloadText('cargoclear-comparisons.csv', text);
                notify('ok', t('res.csvDone'));
              }}
            >
              {t('res.exportCsv')}
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => navigate('/compare/new')}>{t('common.newComparison')}</Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3 sm:p-4">
          <div className="relative w-full min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-3.5 text-ink-soft md:top-3" />
            <Input className="pl-9" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
          </div>
          <Select className="w-full sm:w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('hist.status')}>
            <option value="all">{t('hist.allStatuses')}</option>
            {['complete', 'partial', 'incomplete'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </Select>
          <Select className="w-full sm:w-52" value={carrierId} onChange={(e) => setCarrierId(e.target.value)} aria-label={t('offer.carrier')}>
            <option value="all">{t('hist.allCarriers')}</option>
            {data.carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <label className="flex w-full items-center gap-2 text-xs text-ink-soft sm:w-auto">
            {t('hist.from')}
            <Input type="date" className="w-full sm:w-40" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label={t('hist.from')} />
          </label>
          <label className="flex w-full items-center gap-2 text-xs text-ink-soft sm:w-auto">
            {t('hist.to')}
            <Input type="date" className="w-full sm:w-40" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label={t('hist.to')} />
          </label>
          {(from || to || q || status !== 'all' || carrierId !== 'all') && (
            <Button variant="ghost" onClick={() => { setQ(''); setStatus('all'); setCarrierId('all'); setFrom(''); setTo(''); }}>{t('hist.reset')}</Button>
          )}
        </div>

        {views.length === 0 ? (
          <EmptyState icon={GitCompare} title={t('empty.comparisons.title')} text={t('empty.comparisons.text')} action={<Button variant="primary" icon={Plus} onClick={() => navigate('/compare/new')}>{t('common.newComparison')}</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Search} title={t('common.nothingFound')} />
        ) : !tabletUp ? (
          <ul className="divide-y divide-line">
            {rows.map((v) => (
              <li key={v.comparison.id} className="space-y-2.5 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/comparisons/${v.comparison.id}`} className="inline-flex min-h-[40px] items-center text-sm font-semibold leading-snug hover:text-brand">{v.comparison.name}</Link>
                    <div className="mt-0.5 text-xs text-ink-soft">{v.shipment.name} · {route(v.shipment)} · {fmt.date(v.comparison.createdAt)}</div>
                  </div>
                  <div className="tabular shrink-0 text-right text-sm font-semibold">
                    {v.result.bestTotal !== null ? fmt.money(v.result.bestTotal) : <span className="text-ink-soft">—</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {v.entries.map((e) => <Badge key={e.offer.id}>{e.carrier?.name ?? '—'}</Badge>)}
                </div>
                <div className="flex items-center justify-between">
                  <StatusBadge status={v.result.status} />
                  <div className="-mr-2 flex">
                    <IconButton icon={Eye} label={t('common.open')} onClick={() => navigate(`/comparisons/${v.comparison.id}`)} />
                    <IconButton icon={Pencil} label={t('common.edit')} onClick={() => navigate(`/comparisons/${v.comparison.id}/edit`)} />
                    <IconButton icon={Copy} label={t('common.duplicate')} onClick={() => actions.duplicate(v.comparison.id)} />
                    <IconButton icon={Trash2} tone="danger" label={t('common.delete')} onClick={() => setDel(v)} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs text-ink-soft">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-medium">{t('hist.date')}</th>
                  <th className="px-3 py-3 font-medium">{t('hist.name')}</th>
                  <th className="px-3 py-3 font-medium">{t('hist.carriers')}</th>
                  <th className="px-3 py-3 font-medium">{t('hist.status')}</th>
                  <th className="px-3 py-3 text-right font-medium">{t('hist.saved')}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((v) => (
                  <tr key={v.comparison.id} className="hover:bg-canvas/50">
                    <td className="tabular whitespace-nowrap px-5 py-3 text-ink-soft">{fmt.date(v.comparison.createdAt)}</td>
                    <td className="px-3 py-3">
                      <Link to={`/comparisons/${v.comparison.id}`} className="font-semibold hover:text-brand">{v.comparison.name}</Link>
                      <div className="text-xs text-ink-soft">{v.shipment.name} · {route(v.shipment)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {v.entries.map((e) => <Badge key={e.offer.id}>{e.carrier?.name ?? '—'}</Badge>)}
                      </div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={v.result.status} /></td>
                    <td className="tabular px-3 py-3 text-right">
                      {v.result.bestTotal !== null ? <span className="font-semibold">{fmt.money(v.result.bestTotal)}</span> : <span className="text-ink-soft">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-0.5">
                        <IconButton icon={Eye} label={t('common.open')} onClick={() => navigate(`/comparisons/${v.comparison.id}`)} />
                        <IconButton icon={Pencil} label={t('common.edit')} onClick={() => navigate(`/comparisons/${v.comparison.id}/edit`)} />
                        <IconButton icon={Copy} label={t('common.duplicate')} onClick={() => actions.duplicate(v.comparison.id)} />
                        <IconButton icon={Trash2} tone="danger" label={t('common.delete')} onClick={() => setDel(v)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ConfirmDialog
        open={!!del}
        title={t('res.deleteTitle')}
        text={del ? t('res.deleteText', { name: del.comparison.name }) : ''}
        confirmLabel={t('common.delete')}
        onClose={() => setDel(null)}
        onConfirm={async () => {
          const id = del.comparison.id;
          setDel(null);
          await actions.remove(id);
        }}
      />
    </div>
  );
}
