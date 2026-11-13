import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Pencil, Phone, Plus, Trash2, Truck, User } from 'lucide-react';
import { carrierSchema } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Textarea, cx } from '../../components/ui.jsx';
import { DemoBadge, EndpointBadge } from '../../components/common.jsx';
import { useIsTabletUp } from '../../lib/useMedia.js';

function CarrierModal({ carrier, onClose }) {
  const { t, repo, act } = useApp();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(carrierSchema),
    defaultValues: { name: carrier?.name ?? '', contactName: carrier?.contactName ?? '', phone: carrier?.phone ?? '', email: carrier?.email ?? '', notes: carrier?.notes ?? '' },
  });
  const submit = handleSubmit(async (v) => {
    const r = await act(() => (carrier ? repo.updateCarrier(carrier.id, v) : repo.createCarrier(v)), 'car.saved');
    if (r.ok) onClose();
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={carrier ? t('car.edit') : t('car.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={isSubmitting} onClick={submit}>{t('common.save')}</Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label={t('car.name')} required error={errors.name?.message}><Input {...register('name')} /></Field>
        <Field label={t('car.contact')}><Input {...register('contactName')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('car.phone')}><Input type="tel" {...register('phone')} /></Field>
          <Field label={t('car.email')} error={errors.email?.message}><Input type="email" {...register('email')} /></Field>
        </div>
        <Field label={t('car.notes')}><Textarea {...register('notes')} /></Field>
      </form>
    </Modal>
  );
}

export default function Carriers() {
  const { t, data, repo, act, fmt } = useApp();
  const tabletUp = useIsTabletUp();
  const [selId, setSelId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);

  const sel = data.carriers.find((c) => c.id === selId) ?? data.carriers[0] ?? null;
  const shipmentById = useMemo(() => new Map(data.shipments.map((s) => [s.id, s])), [data.shipments]);
  const offers = useMemo(() => (sel ? data.offers.filter((o) => o.carrierId === sel.id) : []), [data.offers, sel]);
  const cmpByOffer = (oid) => data.comparisons.find((c) => c.offerIds.includes(oid));

  return (
    <div>
      <PageHeader
        title={t('nav.carriers')}
        subtitle={t('car.subtitle')}
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>{t('car.new')}</Button>}
      />
      {data.carriers.length === 0 ? (
        <Card><EmptyState icon={Truck} title={t('empty.carriers.title')} text={t('empty.carriers.text')} action={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>{t('car.new')}</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden" role="tablist" aria-label={t('nav.carriers')}>
            {data.carriers.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={sel?.id === c.id}
                onClick={() => setSelId(c.id)}
                className={cx(
                  'flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium',
                  sel?.id === c.id ? 'border-brand bg-brand-50 text-brand' : 'border-line bg-white text-ink',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          <Card className="hidden self-start overflow-hidden lg:block">
            <ul className="divide-y divide-line">
              {data.carriers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelId(c.id)}
                    className={cx('flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-canvas/60', sel?.id === c.id && 'bg-brand-50')}
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="flex items-center gap-2">
                      {c.isDemo && <DemoBadge />}
                      <span className="tabular text-xs text-ink-soft">{data.offers.filter((o) => o.carrierId === c.id).length}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {sel && (
            <div className="min-w-0 space-y-5 lg:space-y-6">
              <Card>
                <CardHeader
                  title={<span className="inline-flex items-center gap-2">{sel.name}{sel.isDemo && <DemoBadge />}</span>}
                  actions={
                    <div className="flex gap-2">
                      <Button size="sm" icon={Pencil} onClick={() => setEditing(sel)}>{t('common.edit')}</Button>
                      <Button size="sm" variant="dangerGhost" icon={Trash2} onClick={() => setDel(sel)}>{t('common.delete')}</Button>
                    </div>
                  }
                />
                <div className="grid grid-cols-1 gap-3 px-4 py-4 text-sm sm:px-5 md:grid-cols-3">
                  <div className="flex items-center gap-2"><User size={16} className="text-ink-soft" />{sel.contactName || '—'}</div>
                  <div className="flex items-center gap-2"><Phone size={16} className="text-ink-soft" /><span className="tabular">{sel.phone || '—'}</span></div>
                  <div className="flex items-center gap-2"><Mail size={16} className="text-ink-soft" />{sel.email || '—'}</div>
                </div>
                <div className="border-t border-line px-5 py-4">
                  <div className="mb-1 text-xs font-medium text-ink-soft">{t('car.notes')}</div>
                  <p className="whitespace-pre-line text-sm">{sel.notes || '—'}</p>
                </div>
              </Card>

              <Card>
                <CardHeader title={t('car.offers')} subtitle={t('car.offersHint')} />
                {offers.length === 0 ? (
                  <EmptyState icon={Truck} title={t('empty.offers.title')} />
                ) : !tabletUp ? (
                  <ul className="divide-y divide-line">
                    {offers.map((o) => {
                      const c = cmpByOffer(o.id);
                      return (
                        <li key={o.id} className="space-y-1.5 px-4 py-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 text-sm font-medium">{shipmentById.get(o.shipmentId)?.name ?? '—'}</div>
                            <div className="tabular shrink-0 text-sm font-semibold">{o.price == null ? <span className="text-warn-ink">{t('state.unknown')}</span> : fmt.money(o.price, o.currency)}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                            <EndpointBadge endpoint={o.endpoint} />
                            <span className="tabular">{fmt.date(o.createdAt)}</span>
                            {c && <Link className="inline-flex min-h-[40px] items-center font-medium text-brand" to={`/comparisons/${c.id}`}>{c.name}</Link>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="text-xs text-ink-soft">
                        <tr className="border-b border-line">
                          <th className="px-5 py-2.5 font-medium">{t('hist.date')}</th>
                          <th className="px-3 py-2.5 font-medium">{t('dash.shipment')}</th>
                          <th className="px-3 py-2.5 text-right font-medium">{t('offer.price')}</th>
                          <th className="px-3 py-2.5 font-medium">{t('offer.endpoint')}</th>
                          <th className="px-5 py-2.5 font-medium">{t('nav.comparisons')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {offers.map((o) => {
                          const c = cmpByOffer(o.id);
                          return (
                            <tr key={o.id}>
                              <td className="tabular px-5 py-3 text-ink-soft">{fmt.date(o.createdAt)}</td>
                              <td className="px-3 py-3">{shipmentById.get(o.shipmentId)?.name ?? '—'}</td>
                              <td className="tabular px-3 py-3 text-right font-medium">{o.price == null ? <span className="text-warn-ink">{t('state.unknown')}</span> : fmt.money(o.price, o.currency)}</td>
                              <td className="px-3 py-3"><EndpointBadge endpoint={o.endpoint} /></td>
                              <td className="px-5 py-3">{c ? <Link className="text-brand hover:underline" to={`/comparisons/${c.id}`}>{c.name}</Link> : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
      {editing && <CarrierModal carrier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!del}
        title={t('car.deleteTitle')}
        text={del ? t('car.deleteText', { name: del.name }) : ''}
        confirmLabel={t('common.delete')}
        onClose={() => setDel(null)}
        onConfirm={async () => {
          const id = del.id;
          setDel(null);
          await act(() => repo.deleteCarrier(id), 'car.deleted');
        }}
      />
    </div>
  );
}
