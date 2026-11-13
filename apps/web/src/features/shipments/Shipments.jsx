import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { GitCompare, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { defaultShipmentValues, shipmentSchema } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, Modal, PageHeader } from '../../components/ui.jsx';
import ShipmentFields from '../../components/ShipmentFields.jsx';
import { useIsTabletUp } from '../../lib/useMedia.js';

function ShipmentModal({ shipment, onClose }) {
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

  return (
    <div>
      <PageHeader
        title={t('nav.shipments')}
        subtitle={t('ship.subtitle')}
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>{t('ship.new')}</Button>}
      />
      <Card>
        {data.shipments.length === 0 ? (
          <EmptyState icon={Package} title={t('empty.shipments.title')} text={t('empty.shipments.text')} action={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>{t('ship.new')}</Button>} />
        ) : !tabletUp ? (
          <ul className="divide-y divide-line">
            {data.shipments.map((s) => (
              <li key={s.id} className="space-y-2 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-snug">{s.name}</div>
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
                {data.shipments.map((s) => (
                  <tr key={s.id} className="hover:bg-canvas/50">
                    <td className="px-5 py-3">
                      <div className="font-semibold">{s.name}</div>
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
