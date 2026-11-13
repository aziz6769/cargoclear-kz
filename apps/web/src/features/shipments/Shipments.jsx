import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { GitCompare, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { defaultShipmentValues, shipmentSchema } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, Modal, PageHeader, Select } from '../../components/ui.jsx';
import ShipmentFields from '../../components/ShipmentFields.jsx';
import { useIsTabletUp } from '../../lib/useMedia.js';

export function ShipmentModal({ shipment, onClose }) {
  const { t, repo, act } = useApp();
  const methods = useForm({
    resolver: zodResolver(shipmentSchema),
    defaultValues: shipment ? { ...defaultShipmentValues(), ...shipment } : defaultShipmentValues(),
  });
  const submit = methods.handleSubmit(async (v) => {
    const r = await act(() => (shipment ? repo.updateShipment(shipment.id, v) : repo.createShipment(v)), 'ship.saved');
    if (r.ok) onClose();
  });
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={shipment ? t('ship.edit') : t('ship.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={methods.formState.isSubmitting} onClick={submit}>{t('common.save')}</Button>
        </>
      }
    >
      <FormProvider {...methods}>
        <form onSubmit={submit} noValidate>
          <ShipmentFields showStatus />
        </form>
      </FormProvider>
    </Modal>
  );
}

export default function Shipments() {
  const { t, data, fmt, repo, act } = useApp();
  const navigate = useNavigate();
  const tabletUp = useIsTabletUp();
  const [editing, setEditing] = useState(null); // null | 'new' | shipment
  const [del, setDel] = useState(null);
  const tone = { draft: 'neutral', active: 'brand', delivered: 'ok' };
  // filters live in the URL, so the view survives reloads, back/forward and shared links
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = data.shipments.filter((s) =>
      (!status || s.status === status) &&
      (!needle || [s.name, s.origin, s.destination, s.cargoDescription, s.deliveryPoint].some((x) => String(x ?? '').toLowerCase().includes(needle))));
    const by = {
      newest: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
      oldest: (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
      name: (a, b) => a.name.localeCompare(b.name),
      weight: (a, b) => b.weightKg - a.weightKg,
      required: (a, b) => (a.requiredDate || '9999').localeCompare(b.requiredDate || '9999'),
    }[sort] ?? (() => 0);
    return [...rows].sort(by);
  }, [data.shipments, q, status, sort]);

  return (
    <div>
      <PageHeader
        title={t('nav.shipments')}
        subtitle={t('ship.subtitle')}
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>{t('ship.new')}</Button>}
      />
      <Card>
        {data.shipments.length > 0 && (
          <div className="grid grid-cols-1 gap-2 border-b border-line p-3 sm:grid-cols-[minmax(0,1fr)_170px_190px] sm:p-4" data-filters>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <Input value={q} onChange={(e) => setParam('q', e.target.value)} placeholder={t('ship.search')} aria-label={t('ship.search')} className="pl-9" />
            </div>
            <Select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label={t('ship.status')}>
              <option value="">{t('ship.allStatuses')}</option>
              {['draft', 'active', 'delivered'].map((k) => <option key={k} value={k}>{t(`shipStatus.${k}`)}</option>)}
            </Select>
            <Select value={sort} onChange={(e) => setParam('sort', e.target.value === 'newest' ? '' : e.target.value)} aria-label={t('ship.sort')}>
              {['newest', 'oldest', 'name', 'weight', 'required'].map((k) => <option key={k} value={k}>{t(`ship.sort.${k}`)}</option>)}
            </Select>
          </div>
        )}
        {data.shipments.length === 0 ? (
          <EmptyState icon={Package} title={t('empty.shipments.title')} text={t('empty.shipments.text')} action={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>{t('ship.new')}</Button>} />
        ) : list.length === 0 ? (
          <EmptyState icon={Search} title={t('ship.noResults')} text={t('ship.noResultsText')} action={<Button onClick={() => setParams({}, { replace: true })}>{t('common.resetFilters')}</Button>} />
        ) : !tabletUp ? (
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <li key={s.id} className="space-y-2 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/shipments/${s.id}`} className="inline-flex min-h-[40px] items-center text-sm font-semibold leading-snug hover:text-brand">{s.name}</Link>
                    <div className="mt-0.5 text-xs text-ink-soft">{s.origin} → {s.destination}</div>
                  </div>
                  <Badge tone={tone[s.status]}>{t(`shipStatus.${s.status}`)}</Badge>
                </div>
                <div className="tabular flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-soft">
                  <span>{s.weightKg} {t('ship.weight').split(',')[1]?.trim() ?? ''}</span>
                  <span>{s.volumeM3} {t('ship.volume').split(',')[1]?.trim() ?? ''}</span>
                  <span>{t(`cat.${s.category}`)}</span>
                </div>
                <div className="-mr-2 flex items-center justify-between">
                  <span className="text-xs text-ink-soft">{fmt.date(s.createdAt)}{s.isDemo && ` · ${t('common.demo')}`}</span>
                  <div className="flex">
                    <IconButton icon={GitCompare} label={t('ship.compare')} onClick={() => navigate(`/compare/new?shipmentId=${s.id}`)} />
                    <IconButton icon={Pencil} label={t('common.edit')} onClick={() => setEditing(s)} />
                    <IconButton icon={Trash2} tone="danger" label={t('common.delete')} onClick={() => setDel(s)} />
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
                  <th className="px-5 py-3 font-medium">{t('ship.name')}</th>
                  <th className="px-3 py-3 font-medium">{t('ship.route')}</th>
                  <th className="px-3 py-3 text-right font-medium">{t('ship.weight')}</th>
                  <th className="px-3 py-3 text-right font-medium">{t('ship.volume')}</th>
                  <th className="px-3 py-3 font-medium">{t('ship.category')}</th>
                  <th className="px-3 py-3 font-medium">{t('ship.status')}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((s) => (
                  <tr key={s.id} className="hover:bg-canvas/50">
                    <td className="px-5 py-3">
                      <Link to={`/shipments/${s.id}`} className="font-semibold hover:text-brand">{s.name}</Link>
                      <div className="text-xs text-ink-soft">{fmt.date(s.createdAt)}{s.isDemo && ` · ${t('common.demo')}`}</div>
                    </td>
                    <td className="px-3 py-3">{s.origin} → {s.destination}</td>
                    <td className="tabular px-3 py-3 text-right">{s.weightKg}</td>
                    <td className="tabular px-3 py-3 text-right">{s.volumeM3}</td>
                    <td className="px-3 py-3 text-ink-soft">{t(`cat.${s.category}`)}</td>
                    <td className="px-3 py-3"><Badge tone={tone[s.status]}>{t(`shipStatus.${s.status}`)}</Badge></td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-0.5">
                        <IconButton icon={GitCompare} label={t('ship.compare')} onClick={() => navigate(`/compare/new?shipmentId=${s.id}`)} />
                        <IconButton icon={Pencil} label={t('common.edit')} onClick={() => setEditing(s)} />
                        <IconButton icon={Trash2} tone="danger" label={t('common.delete')} onClick={() => setDel(s)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <ShipmentModal shipment={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!del}
        title={t('ship.deleteTitle')}
        text={del ? t('ship.deleteText', { name: del.name }) : ''}
        confirmLabel={t('common.delete')}
        onClose={() => setDel(null)}
        onConfirm={async () => {
          const id = del.id;
          setDel(null);
          await act(() => repo.deleteShipment(id), 'ship.deleted');
        }}
      />
    </div>
  );
}
