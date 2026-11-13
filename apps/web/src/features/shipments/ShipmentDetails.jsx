import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, GitCompare, Package, Pencil, Plus } from 'lucide-react';
import { useApp } from '../../app/DataContext.jsx';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, PageHeader } from '../../components/ui.jsx';
import HistoryTimeline from '../../components/HistoryTimeline.jsx';
import DocumentModal from '../documents/DocumentModal.jsx';
import { DocumentRow } from '../documents/Documents.jsx';
import { CarrierName, DemoBadge, EndpointBadge, StatusBadge, route } from '../../components/common.jsx';
import { ShipmentModal } from './Shipments.jsx';

const Item = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-xs text-ink-soft">{label}</dt>
    <dd className="mt-0.5 break-words text-sm font-medium">{children || '—'}</dd>
  </div>
);

/** One shipment: everything entered about it, its comparisons and all offers received for it. */
export default function ShipmentDetails() {
  const { id } = useParams();
  const { t, data, views, fmt, repo, act } = useApp();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [docEditing, setDocEditing] = useState(null);
  const [docDel, setDocDel] = useState(null);
  const s = data.shipments.find((x) => x.id === id);

  if (!s)
    return (
      <EmptyState
        icon={Package}
        title={t('ship.notFound')}
        action={<Button variant="primary" icon={ArrowLeft} onClick={() => navigate('/shipments')}>{t('nav.shipments')}</Button>}
      />
    );

  const comparisons = views.filter((v) => v.shipment.id === id);
  const docs = data.documents.filter((d) => d.shipmentId === id);
  const events = data.events.filter((e) => e.entityType === 'shipment' && e.entityId === id);
  const offers = data.offers.filter((o) => o.shipmentId === id);
  const carrierById = new Map(data.carriers.map((c) => [c.id, c]));
  const tone = { draft: 'neutral', active: 'brand', delivered: 'ok' }[s.status];
  const country = (c) => (c ? t(`country.${c}`) : '');
  const flags = [s.insuranceRequired && t('ship.insurance'), s.customsRequired && t('ship.customs'), s.specialHandling && t('ship.special')].filter(Boolean);

  return (
    <div>
      <Link to="/shipments" className="mb-2 inline-flex min-h-[40px] items-center gap-1 text-sm text-ink-soft hover:text-brand">
        <ArrowLeft size={14} /> {t('nav.shipments')}
      </Link>
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {s.name}
            {s.isDemo && <DemoBadge />}
          </span>
        }
        subtitle={route(s)}
        actions={
          <>
            <Badge tone={tone}>{t(`shipStatus.${s.status}`)}</Badge>
            <Button icon={Pencil} onClick={() => setEditing(true)}>{t('common.edit')}</Button>
            <Button variant="primary" icon={GitCompare} onClick={() => navigate(`/compare/new?shipmentId=${s.id}`)}>{t('ship.compare')}</Button>
          </>
        }
      />

      <Card className="mb-5">
        <CardHeader title={t('ship.detailsTitle')} />
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          <Item label={t('ship.originCountry')}>{country(s.originCountry)}</Item>
          <Item label={t('ship.origin')}>{s.origin}</Item>
          <Item label={t('ship.destinationCountry')}>{country(s.destinationCountry)}</Item>
          <Item label={t('ship.destination')}>{s.destination}</Item>
          <Item label={t('ship.deliveryPoint')}>{s.deliveryPoint}</Item>
          <Item label={t('ship.deliveryLevel')}><EndpointBadge endpoint={s.deliveryLevel} /></Item>
          <Item label={t('ship.cargoDescription')}>{s.cargoDescription}</Item>
          <Item label={t('ship.category')}>{t(`cat.${s.category}`)}</Item>
          <Item label={t('ship.shipDate')}>{s.shipDate ? fmt.date(s.shipDate) : ''}</Item>
          <Item label={t('ship.requiredDate')}>{s.requiredDate ? fmt.date(s.requiredDate) : ''}</Item>
          <Item label={t('ship.weight')}><span className="tabular">{s.weightKg}</span></Item>
          <Item label={t('ship.volume')}><span className="tabular">{s.volumeM3}</span></Item>
          <Item label={t('ship.packages')}><span className="tabular">{s.packages}</span></Item>
          <Item label={t('ship.storageDays')}><span className="tabular">{s.storageDays}</span></Item>
          <Item label={t('ship.flagsTitle')}>{flags.length ? <span className="flex flex-wrap gap-1.5">{flags.map((f) => <Badge key={f} tone="brand">{f}</Badge>)}</span> : ''}</Item>
          <Item label={t('ship.requirements')}>{s.requirements}</Item>
        </dl>
      </Card>

      <Card className="mb-5">
        <CardHeader
          title={t('ship.comparisons')}
          actions={<Button size="sm" icon={Plus} onClick={() => navigate(`/compare/new?shipmentId=${s.id}`)}>{t('common.newComparison')}</Button>}
        />
        {comparisons.length === 0 ? (
          <EmptyState icon={GitCompare} title={t('ship.noComparisons')} text={t('ship.noComparisonsText')} action={<Button variant="primary" icon={Plus} onClick={() => navigate(`/compare/new?shipmentId=${s.id}`)}>{t('common.newComparison')}</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {comparisons.map((v) => (
              <li key={v.comparison.id}>
                <Link to={`/comparisons/${v.comparison.id}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3.5 hover:bg-canvas/60 sm:px-5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{v.comparison.name}</div>
                    <div className="mt-0.5 text-xs text-ink-soft">{fmt.date(v.comparison.createdAt)} · {t('dash.offersCount', { n: v.entries.length })}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular text-sm font-semibold">{v.result.bestTotal !== null ? fmt.money(v.result.bestTotal) : '—'}</span>
                    <StatusBadge status={v.result.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={t('ship.offers')} subtitle={t('ship.offersHint')} />
        {offers.length === 0 ? (
          <EmptyState icon={Package} title={t('empty.offers.title')} />
        ) : (
          <ul className="divide-y divide-line">
            {offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <CarrierName carrier={carrierById.get(o.carrierId)} className="flex-wrap text-sm" />
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-soft"><EndpointBadge endpoint={o.endpoint} />{o.deliveryDays != null && <span className="tabular">{o.deliveryDays} {t('common.daysShort')}</span>}</div>
                </div>
                <div className="tabular text-sm font-semibold">{o.price == null ? <span className="text-warn-ink">{t('state.unknown')}</span> : fmt.money(o.price, o.currency)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader
          title={t('nav.documents')}
          subtitle={t('doc.localShort')}
          actions={<Button size="sm" icon={Plus} onClick={() => setDocEditing('new')} data-doc-new>{t('doc.new')}</Button>}
        />
        {docs.length === 0 ? (
          <EmptyState icon={FileText} title={t('doc.shipmentEmpty')} />
        ) : (
          <ul className="divide-y divide-line">{docs.map((d) => <DocumentRow key={d.id} d={d} showShipment={false} onEdit={setDocEditing} onDelete={setDocDel} />)}</ul>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title={t('hx.title')} subtitle={t('hx.subtitle')} />
        <HistoryTimeline events={events} entity="shipment" />
      </Card>

      {docEditing && <DocumentModal doc={docEditing === 'new' ? null : docEditing} defaults={{ shipmentId: s.id }} onClose={() => setDocEditing(null)} />}
      <ConfirmDialog
        open={!!docDel}
        title={t('doc.deleteTitle')}
        text={docDel ? t('doc.deleteText', { name: docDel.title }) : ''}
        confirmLabel={t('common.delete')}
        onClose={() => setDocDel(null)}
        onConfirm={async () => { const id = docDel.id; setDocDel(null); await act(() => repo.deleteDocument(id), 'doc.deleted'); }}
      />
      {editing && <ShipmentModal shipment={s} onClose={() => setEditing(false)} />}
    </div>
  );
}
