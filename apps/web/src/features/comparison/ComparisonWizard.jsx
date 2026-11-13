import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Plus, Trash2, GitCompare } from 'lucide-react';
import {
  COST_COMPONENTS,
  CURRENCIES,
  OPTIONAL_COMPONENTS,
  ENDPOINTS,
  TRANSPORT_TYPES,
  comparisonFormSchema,
  defaultOfferValues,
  defaultShipmentValues,
  formToOffer,
  offerToForm,
  requiredComponents,
} from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import ShipmentFields from '../../components/ShipmentFields.jsx';
import { InfoTip } from '../../components/Term.jsx';
import { Badge, Banner, Button, Card, EmptyState, Field, IconButton, Input, PageHeader, Segmented, Select, StickyBar, Textarea, cx } from '../../components/ui.jsx';

const MAX_OFFERS = 6;
const SHIPMENT_KEYS = Object.keys(defaultShipmentValues());
const shipmentToForm = (s) => Object.fromEntries(SHIPMENT_KEYS.map((k) => [k, s[k] ?? defaultShipmentValues()[k]]));

const STATUS_CLS = {
  included: 'bg-ok text-white',
  charged: 'bg-brand text-white',
  excluded: 'bg-warn text-ink',
  unknown: 'bg-slate-500 text-white',
  na: 'bg-slate-300 text-ink',
};
const GLOSSARY_COMPONENTS = ['terminal', 'lastMile', 'storage', 'customs', 'handling', 'unloading', 'fuel', 'pickup'];

export default function ComparisonWizard() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { views, data, settings, t } = useApp();

  const init = useMemo(() => {
    if (id) {
      const v = views.find((x) => x.comparison.id === id);
      if (!v) return null;
      return {
        editId: id,
        defaults: {
          name: v.comparison.name,
          existingShipmentId: v.shipment.id,
          shipment: shipmentToForm(v.shipment),
          offers: v.entries.map((e) => offerToForm(e.offer, e.carrier)),
        },
      };
    }
    const pre = data.shipments.find((s) => s.id === params.get('shipmentId'));
    return {
      editId: null,
      defaults: {
        name: '',
        existingShipmentId: pre?.id ?? '',
        shipment: pre ? shipmentToForm(pre) : { ...defaultShipmentValues(), status: 'active' },
        offers: [defaultOfferValues(settings.currency), defaultOfferValues(settings.currency)],
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!init)
    return <EmptyState title={t('res.notFound')} action={<Button onClick={() => history.back()}>{t('common.back')}</Button>} />;
  return <WizardForm key={id ?? 'new'} {...init} />;
}

function WizardForm({ editId, defaults }) {
  const { t, data, repo, act, settings } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [openIdx, setOpenIdx] = useState(0);

  const methods = useForm({ resolver: zodResolver(comparisonFormSchema), defaultValues: defaults, mode: 'onTouched' });
  const { register, handleSubmit, control, trigger, setValue, getValues, formState: { errors, isSubmitting } } = methods;
  const { fields, append, remove } = useFieldArray({ control, name: 'offers' });
  const existingId = useWatch({ control, name: 'existingShipmentId' });
  const shipment = useWatch({ control, name: 'shipment' });

  const next = async () => {
    if (await trigger('shipment')) {
      if (!getValues('name')) setValue('name', getValues('shipment.name'));
      setStep(2);
      window.scrollTo({ top: 0 });
    }
  };

  const onSubmit = async (v) => {
    const res = await act(async () => {
      let shipmentId = v.existingShipmentId;
      if (shipmentId) await repo.updateShipment(shipmentId, v.shipment);
      else shipmentId = (await repo.createShipment(v.shipment)).id;
      const offers = [];
      for (const o of v.offers) {
        const carrier = await repo.getOrCreateCarrierByName(o.carrierName);
        offers.push(formToOffer(o, carrier.id));
      }
      return editId
        ? repo.updateComparison(editId, { name: v.name, shipmentId, offers })
        : repo.createComparison({ name: v.name, shipmentId, offers });
    }, 'wiz.saved');
    if (res.ok) navigate(`/comparisons/${res.value.id}`);
  };

  const offersErr = errors.offers?.root?.message ?? errors.offers?.message;

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="pb-20 md:pb-0">
        <PageHeader title={editId ? t('wiz.editTitle') : t('nav.newComparison')} subtitle={t('wiz.subtitle')} />

        <ol className="mb-6 flex items-center gap-3 text-sm">
          {[1, 2].map((n) => (
            <li key={n} className="flex items-center gap-2">
              <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold', step >= n ? 'bg-brand text-white' : 'bg-line text-ink-soft')}>
                {step > n ? <Check size={14} /> : n}
              </span>
              <span className={cx('font-medium', step === n ? 'text-ink' : 'text-ink-soft')}>{t(`wiz.step${n}`)}</span>
              {n === 1 && <span className="mx-2 h-px w-10 bg-line" />}
            </li>
          ))}
        </ol>

        {step === 1 && (
          <Card className="p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('ship.useExisting')} className="md:col-span-2">
                <Select
                  value={existingId}
                  onChange={(e) => {
                    const s = data.shipments.find((x) => x.id === e.target.value);
                    setValue('existingShipmentId', e.target.value);
                    setValue('shipment', s ? shipmentToForm(s) : { ...defaultShipmentValues(), status: 'active' });
                  }}
                >
                  <option value="">{t('ship.createNew')}</option>
                  {data.shipments.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} · {s.origin} → {s.destination}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-4"><ShipmentFields prefix="shipment." /></div>
            <StickyBar className="mt-5">
              <Button variant="primary" onClick={next} className="flex-1 md:flex-none">
                {t('wiz.next')} <ArrowRight size={16} />
              </Button>
            </StickyBar>
          </Card>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Banner tone="info" title={t('wiz.commonDest')}>
              {t('wiz.commonDestText', { point: shipment.deliveryPoint, level: t(`endpoint.${shipment.deliveryLevel}`) })}
            </Banner>
            <Card className="p-4 sm:p-5">
              <Field label={t('wiz.name')} required error={errors.name?.message}>
                <Input {...register('name')} />
              </Field>
            </Card>

            {fields.map((f, i) => (
              <OfferEditor
                key={f.id}
                index={i}
                open={openIdx === i}
                onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
                canRemove={fields.length > 2}
                onRemove={() => {
                  remove(i);
                  setOpenIdx(0);
                }}
              />
            ))}

            {offersErr && <Banner tone="bad">{t(offersErr)}</Banner>}

            <Button
              icon={Plus}
              className="w-full border-dashed md:w-auto"
              disabled={fields.length >= MAX_OFFERS}
              onClick={() => {
                append(defaultOfferValues(settings.currency));
                setOpenIdx(fields.length);
              }}
            >
              {t('wiz.addOffer')}
            </Button>

            <StickyBar className="md:mt-2">
              <Button onClick={() => setStep(1)} aria-label={t('wiz.back')}>
                <ArrowLeft size={16} /> <span className="max-sm:hidden">{t('wiz.back')}</span>
              </Button>
              <Button type="submit" variant="primary" icon={GitCompare} loading={isSubmitting} className="flex-1 md:flex-none">
                {editId ? t('wiz.saveChanges') : t('wiz.compare')}
              </Button>
            </StickyBar>
          </div>
        )}
      </form>
    </FormProvider>
  );
}

function OfferEditor({ index, open, onToggle, onRemove, canRemove }) {
  const { register, control, formState: { errors } } = useFormContext();
  const { t, data } = useApp();
  const p = `offers.${index}`;
  const offer = useWatch({ control, name: p });
  const shipment = useWatch({ control, name: 'shipment' });
  const { fields: charges, append, remove } = useFieldArray({ control, name: `${p}.additionalCharges` });
  const err = errors.offers?.[index] ?? {};

  const required = requiredComponents({ ...shipment, storageDays: Number(shipment.storageDays) || 0 }, offer);
  // Optional components (pickup, fuel, other) only matter once the user flags them as open.
  for (const k of OPTIONAL_COMPONENTS) required[k] = offer.costs[k]?.status === 'unknown' || offer.costs[k]?.status === 'excluded';
  const blank = (v) => v === '' || v === null || v === undefined;
  const openItems =
    COST_COMPONENTS.filter((k) => {
      const c = offer.costs[k];
      return (
        (required[k] && (c.status === 'unknown' || (c.status === 'excluded' && blank(c.amount)))) ||
        (c.status === 'charged' && blank(c.amount))
      );
    }).length + (blank(offer.price) ? 1 : 0);

  const statusOptions = ['included', 'charged', 'excluded', 'unknown', 'na'].map((v) => ({
    value: v,
    label: t(`cs.${v}`),
    activeCls: STATUS_CLS[v],
  }));

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 px-4 py-1.5 sm:px-5">
        <button type="button" onClick={onToggle} className="flex min-h-[44px] min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left" aria-expanded={open}>
          <span className="truncate text-[15px] font-semibold">{offer.carrierName || t('wiz.newOffer', { n: index + 1 })}</span>
          {openItems > 0 && <Badge tone="warn">{t('wiz.openItems', { n: openItems })}</Badge>}
          {open ? <ChevronUp size={16} className="text-ink-soft" /> : <ChevronDown size={16} className="text-ink-soft" />}
        </button>
        <IconButton icon={Trash2} tone="danger" label={t('common.delete')} onClick={onRemove} disabled={!canRemove} />
      </div>

      {open && (
        <div className="space-y-5 border-t border-line px-4 py-4 sm:px-5 sm:py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Field label={t('offer.carrier')} required error={err.carrierName?.message} className="md:col-span-2">
              <Input list="carrier-names" {...register(`${p}.carrierName`)} />
              <datalist id="carrier-names">
                {data.carriers.map((c) => <option key={c.id} value={c.name} />)}
              </datalist>
            </Field>
            <Field label={t('offer.price')} error={err.price?.message} hint={t('offer.priceHint')}>
              <Input type="number" inputMode="decimal" step="any" min="0" className="tabular" {...register(`${p}.price`)} />
            </Field>
            <Field label={t('offer.currency')}>
              <Select {...register(`${p}.currency`)}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label={t('offer.start')}>
              <Input {...register(`${p}.startLocation`)} />
            </Field>
            <Field label={t('offer.endpoint')} hint={t('offer.endpointHint')}>
              <Select {...register(`${p}.endpoint`)}>
                {ENDPOINTS.map((x) => <option key={x} value={x}>{t(`endpoint.${x}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('offer.endpointLabel')}>
              <Input {...register(`${p}.endpointLabel`)} />
            </Field>
            <Field label={t('offer.transport')}>
              <Select {...register(`${p}.transportType`)}>
                {TRANSPORT_TYPES.map((x) => <option key={x} value={x}>{t(`transport.${x}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('offer.days')} error={err.deliveryDays?.message}>
              <Input type="number" inputMode="numeric" min="0" {...register(`${p}.deliveryDays`)} />
            </Field>
            <Field label={t('offer.quoteDate')}>
              <Input type="date" {...register(`${p}.quoteDate`)} />
            </Field>
            <Field label={t('offer.validUntil')} hint={t('offer.validHint')}>
              <Input type="date" {...register(`${p}.validUntil`)} />
            </Field>
          </div>

          <div>
            <div className="mb-1 text-sm font-semibold">{t('wiz.costs')}</div>
            <p className="mb-2 text-xs text-ink-soft">{t('wiz.costsHint')}</p>
            <div className="divide-y divide-line rounded-xl border border-line px-3 sm:px-4">
              {COST_COMPONENTS.map((k) => {
                const c = offer.costs[k];
                const showAmount = c.status === 'charged' || c.status === 'excluded';
                const optional = OPTIONAL_COMPONENTS.includes(k);
                return (
                  <div key={k} className={cx('grid grid-cols-1 items-center gap-2 py-2.5 xl:grid-cols-[170px_auto_1fr]', !required[k] && !optional && 'opacity-60')}>
                    <div className="text-sm font-medium">
                      {t(`comp.${k}`)}
                      {GLOSSARY_COMPONENTS.includes(k) && <InfoTip term={k} className="ml-0.5" />}
                      {optional ? (
                        <span className="ml-1 text-xs font-normal text-ink-soft">({t('wiz.optional')})</span>
                      ) : (
                        !required[k] && <span className="ml-1 text-xs font-normal text-ink-soft">({t('wiz.notRelevant')})</span>
                      )}
                    </div>
                    <Controller
                      control={control}
                      name={`${p}.costs.${k}.status`}
                      render={({ field }) => (
                        <Segmented className="grid w-full grid-cols-3 sm:grid-cols-5 lg:inline-flex lg:w-auto" options={statusOptions} value={field.value} onChange={field.onChange} />
                      )}
                    />
                    <div className={c.status === 'unknown' ? 'lg:max-w-[260px]' : 'lg:max-w-[200px]'}>
                      {c.status === 'unknown' && (
                        <Input
                          maxLength={300}
                          aria-label={`${t(`comp.${k}`)} ${t('wiz.note')}`}
                          placeholder={t('wiz.note')}
                          {...register(`${p}.costs.${k}.note`)}
                        />
                      )}
                      {showAmount && (
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          className="tabular"
                          aria-label={`${t(`comp.${k}`)} ${t('wiz.amount')}`}
                          placeholder={c.status === 'excluded' ? t('wiz.estimate') : t('wiz.amount')}
                          {...register(`${p}.costs.${k}.amount`)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">{t('wiz.additional')}</div>
              <Button size="sm" icon={Plus} onClick={() => append({ name: '', amount: '' })}>{t('wiz.addCharge')}</Button>
            </div>
            {charges.length === 0 && <p className="text-xs text-ink-soft">{t('wiz.additionalHint')}</p>}
            <div className="space-y-2">
              {charges.map((c, ci) => (
                <div key={c.id} className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:items-center">
                  <Input className="col-span-2 sm:col-span-1" placeholder={t('wiz.chargeName')} {...register(`${p}.additionalCharges.${ci}.name`)} />
                  <Input type="number" inputMode="decimal" step="any" min="0" className="tabular sm:max-w-[160px]" placeholder={t('wiz.amount')} {...register(`${p}.additionalCharges.${ci}.amount`)} />
                  <IconButton icon={Trash2} tone="danger" label={t('common.delete')} onClick={() => remove(ci)} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('offer.included')} hint={t('offer.listHint')}>
              <Input {...register(`${p}.includedServices`)} />
            </Field>
            <Field label={t('offer.excluded')} hint={t('offer.listHint')}>
              <Input {...register(`${p}.excludedServices`)} />
            </Field>
            <Field label={t('offer.notes')} className="md:col-span-2">
              <Textarea {...register(`${p}.notes`)} />
            </Field>
          </div>
        </div>
      )}
    </Card>
  );
}
