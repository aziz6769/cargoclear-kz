import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FileText, Paperclip, X } from 'lucide-react';
import { CURRENCIES, DOCUMENT_MAX_BYTES, DOCUMENT_MIME, DOCUMENT_TYPES, documentSchema } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Button, Field, Input, Modal, Select, Textarea } from '../../components/ui.jsx';

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export const offerLabel = (o, data, fmt) => {
  const car = data.carriers.find((c) => c.id === o.carrierId)?.name ?? '—';
  return `${car}${o.price != null ? ` · ${fmt.money(o.price, o.currency)}` : ''}`;
};

/** Create/edit a document record. The file is optional, small, and stored only in this browser. */
export default function DocumentModal({ doc, defaults = {}, onClose }) {
  const { t, data, repo, act, fmt } = useApp();
  const [file, setFile] = useState(doc?.file ?? null);
  const [fileError, setFileError] = useState('');
  const input = useRef(null);
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      title: doc?.title ?? '', type: doc?.type ?? defaults.type ?? 'quote', shipmentId: doc?.shipmentId ?? defaults.shipmentId ?? '',
      offerId: doc?.offerId ?? defaults.offerId ?? '', carrierId: doc?.carrierId ?? defaults.carrierId ?? '', date: doc?.date ?? '',
      amount: doc?.amount ?? '', currency: doc?.currency ?? 'KZT', notes: doc?.notes ?? '',
    },
  });
  const shipmentId = watch('shipmentId');
  const offers = useMemo(() => data.offers.filter((o) => !shipmentId || o.shipmentId === shipmentId), [data.offers, shipmentId]);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > DOCUMENT_MAX_BYTES) return setFileError(t('doc.fileTooBig', { mb: DOCUMENT_MAX_BYTES / 1024 / 1024 }));
    if (!DOCUMENT_MIME.includes(f.type)) return setFileError(t('doc.fileType'));
    setFileError('');
    setFile({ name: f.name, type: f.type, size: f.size, dataUrl: await readAsDataUrl(f) });
  };

  const submit = handleSubmit(async (v) => {
    const payload = { ...v, file };
    const r = await act(() => (doc ? repo.updateDocument(doc.id, payload) : repo.createDocument(payload)), 'doc.saved');
    if (r.ok) onClose();
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={doc ? t('doc.edit') : t('doc.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={isSubmitting} onClick={submit} data-doc-save>{t('common.save')}</Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label={t('doc.title')} required error={errors.title?.message}><Input {...register('title')} data-doc-title /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('doc.type')}>
            <Select {...register('type')}>{DOCUMENT_TYPES.map((k) => <option key={k} value={k}>{t(`doc.type.${k}`)}</option>)}</Select>
          </Field>
          <Field label={t('doc.date')}><Input type="date" {...register('date')} /></Field>
        </div>
        <Field label={t('doc.shipment')}>
          <Select {...register('shipmentId', { onChange: () => setValue('offerId', '') })}>
            <option value="">{t('doc.noLink')}</option>
            {data.shipments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label={t('doc.offer')} hint={t('doc.offerHint')}>
          <Select {...register('offerId', { onChange: (e) => { const o = data.offers.find((x) => x.id === e.target.value); if (o) { setValue('carrierId', o.carrierId); if (!shipmentId) setValue('shipmentId', o.shipmentId); } } })}>
            <option value="">{t('doc.noLink')}</option>
            {offers.map((o) => <option key={o.id} value={o.id}>{offerLabel(o, data, fmt)}</option>)}
          </Select>
        </Field>
        <Field label={t('doc.carrier')}>
          <Select {...register('carrierId')}>
            <option value="">{t('doc.noLink')}</option>
            {data.carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label={t('doc.amount')} error={errors.amount?.message}><Input type="number" inputMode="decimal" step="any" min="0" className="tabular" {...register('amount')} /></Field>
          <Field label={t('doc.currency')}><Select {...register('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <Field label={t('doc.notes')} error={errors.notes?.message}><Textarea maxLength={500} {...register('notes')} /></Field>
        <div>
          <div className="mb-1.5 text-sm font-medium">{t('doc.file')}</div>
          {file ? (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-sm" data-doc-file>
              <FileText size={16} className="shrink-0 text-brand" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="tabular shrink-0 text-xs text-ink-soft">{Math.max(1, Math.round(file.size / 1024))} KB</span>
              <button type="button" aria-label={t('doc.removeFile')} onClick={() => setFile(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-white hover:text-bad"><X size={16} /></button>
            </div>
          ) : (
            <Button icon={Paperclip} onClick={() => input.current?.click()}>{t('doc.attach')}</Button>
          )}
          <input ref={input} type="file" hidden data-doc-input accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt" onChange={pick} />
          {fileError && <p role="alert" className="mt-1.5 text-xs text-bad">{fileError}</p>}
          <p className="mt-1.5 text-xs text-ink-soft">{t('doc.fileHint', { mb: DOCUMENT_MAX_BYTES / 1024 / 1024 })}</p>
        </div>
      </form>
    </Modal>
  );
}
