import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, FileText, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { DOCUMENT_TYPES } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Badge, Banner, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Select } from '../../components/ui.jsx';
import DocumentModal, { offerLabel } from './DocumentModal.jsx';

export function downloadDoc(d) {
  if (!d.file?.dataUrl) return;
  const a = document.createElement('a');
  a.href = d.file.dataUrl;
  a.download = d.file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Documents linked to shipments / offers / carriers. Stored locally; no content recognition. */
export function DocumentRow({ d, onEdit, onDelete, showShipment = true }) {
  const { t, data, fmt } = useApp();
  const shipment = data.shipments.find((s) => s.id === d.shipmentId);
  const offer = data.offers.find((o) => o.id === d.offerId);
  const carrier = data.carriers.find((c) => c.id === (d.carrierId || offer?.carrierId));
  const tone = { quote: 'brand', invoice: 'warn', contract: 'ok', transport: 'neutral' }[d.type];
  return (
    <li data-doc className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <FileText size={16} className="shrink-0 text-ink-soft" />
          <span className="break-words text-sm font-semibold">{d.title}</span>
          <Badge tone={tone}>{t(`doc.type.${d.type}`)}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
          {d.date && <span className="tabular">{fmt.date(d.date)}</span>}
          {showShipment && shipment && <Link to={`/shipments/${shipment.id}`} className="inline-flex min-h-[32px] items-center text-brand hover:underline">{shipment.name}</Link>}
          {offer && <span>{offerLabel(offer, data, fmt)}</span>}
          {!offer && carrier && <span>{carrier.name}</span>}
          {d.amount != null && <span className="tabular font-medium text-ink">{fmt.money(d.amount, d.currency)}</span>}
          {d.file ? <span className="tabular">{d.file.name}</span> : <span>{t('doc.noFile')}</span>}
        </div>
        {d.notes && <p className="mt-1 break-words text-xs text-ink-soft">{d.notes}</p>}
      </div>
      <div className="-mr-2 flex shrink-0">
        {d.file && <IconButton icon={Download} label={t('doc.download')} onClick={() => downloadDoc(d)} />}
        <IconButton icon={Pencil} label={t('common.edit')} onClick={() => onEdit(d)} />
        <IconButton icon={Trash2} tone="danger" label={t('common.delete')} onClick={() => onDelete(d)} />
      </div>
    </li>
  );
}

export default function Documents() {
  const { t, data, repo, act } = useApp();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const q = params.get('q') ?? '';
  const type = params.get('type') ?? '';
  const shipmentId = params.get('shipment') ?? '';
  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.documents.filter((d) =>
      (!type || d.type === type) && (!shipmentId || d.shipmentId === shipmentId) &&
      (!needle || [d.title, d.notes, d.file?.name].some((x) => String(x ?? '').toLowerCase().includes(needle))));
  }, [data.documents, q, type, shipmentId]);
  const add = <Button variant="primary" icon={Plus} onClick={() => setEditing('new')} data-doc-new>{t('doc.new')}</Button>;

  return (
    <div>
      <PageHeader title={t('nav.documents')} subtitle={t('doc.subtitle')} actions={add} />
      <Banner tone="info" className="mb-4 text-xs">{t('doc.localNote')}</Banner>
      <Card>
        {data.documents.length > 0 && (
          <div className="grid grid-cols-1 gap-2 border-b border-line p-3 sm:grid-cols-[minmax(0,1fr)_170px_220px] sm:p-4">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <Input value={q} onChange={(e) => setParam('q', e.target.value)} placeholder={t('doc.search')} aria-label={t('doc.search')} className="pl-9" />
            </div>
            <Select value={type} onChange={(e) => setParam('type', e.target.value)} aria-label={t('doc.type')}>
              <option value="">{t('doc.allTypes')}</option>
              {DOCUMENT_TYPES.map((k) => <option key={k} value={k}>{t(`doc.type.${k}`)}</option>)}
            </Select>
            <Select value={shipmentId} onChange={(e) => setParam('shipment', e.target.value)} aria-label={t('doc.shipment')}>
              <option value="">{t('doc.allShipments')}</option>
              {data.shipments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        )}
        {data.documents.length === 0 ? (
          <EmptyState icon={FileText} title={t('doc.empty.title')} text={t('doc.empty.text')} action={add} />
        ) : list.length === 0 ? (
          <EmptyState icon={Search} title={t('doc.noResults')} action={<Button onClick={() => setParams({}, { replace: true })}>{t('common.resetFilters')}</Button>} />
        ) : (
          <ul className="divide-y divide-line">{list.map((d) => <DocumentRow key={d.id} d={d} onEdit={setEditing} onDelete={setDel} />)}</ul>
        )}
      </Card>
      {editing && <DocumentModal doc={editing === 'new' ? null : editing} defaults={{ shipmentId }} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!del}
        title={t('doc.deleteTitle')}
        text={del ? t('doc.deleteText', { name: del.title }) : ''}
        confirmLabel={t('common.delete')}
        onClose={() => setDel(null)}
        onConfirm={async () => { const id = del.id; setDel(null); await act(() => repo.deleteDocument(id), 'doc.deleted'); }}
      />
    </div>
  );
}
