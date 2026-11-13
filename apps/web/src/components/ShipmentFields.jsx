import { useFormContext } from 'react-hook-form';
import { CARGO_CATEGORIES, ENDPOINTS, SHIPMENT_STATUSES } from '@cargoclear/core';
import { useApp } from '../app/DataContext.jsx';
import { Checkbox, Field, Input, Select, Textarea } from './ui.jsx';

/** Shipment form fields; `prefix` is '' (standalone form) or 'shipment.' (nested in the comparison form). */
export default function ShipmentFields({ prefix = '', showStatus = false }) {
  const { register, formState: { errors } } = useFormContext();
  const { t } = useApp();
  const e = prefix ? errors[prefix.replace('.', '')] ?? {} : errors;
  const r = (n) => register(`${prefix}${n}`);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label={t('ship.name')} required error={e.name?.message} className="md:col-span-2">
        <Input {...r('name')} placeholder={t('ship.namePh')} />
      </Field>
      <Field label={t('ship.origin')} required error={e.origin?.message}>
        <Input {...r('origin')} placeholder="Алматы" />
      </Field>
      <Field label={t('ship.destination')} required error={e.destination?.message}>
        <Input {...r('destination')} placeholder="Астана" />
      </Field>
      <Field label={t('ship.deliveryPoint')} required error={e.deliveryPoint?.message}>
        <Input {...r('deliveryPoint')} />
      </Field>
      <Field label={t('ship.deliveryLevel')} hint={t('ship.deliveryLevelHint')}>
        <Select {...r('deliveryLevel')}>
          {ENDPOINTS.map((x) => <option key={x} value={x}>{t(`endpoint.${x}`)}</option>)}
        </Select>
      </Field>
      <Field label={t('ship.weight')} required error={e.weightKg?.message}>
        <Input type="number" inputMode="decimal" step="any" min="0" {...r('weightKg')} />
      </Field>
      <Field label={t('ship.volume')} required error={e.volumeM3?.message}>
        <Input type="number" inputMode="decimal" step="any" min="0" {...r('volumeM3')} />
      </Field>
      <Field label={t('ship.category')}>
        <Select {...r('category')}>
          {CARGO_CATEGORIES.map((x) => <option key={x} value={x}>{t(`cat.${x}`)}</option>)}
        </Select>
      </Field>
      <Field label={t('ship.packages')} required error={e.packages?.message}>
        <Input type="number" inputMode="numeric" min="1" {...r('packages')} />
      </Field>
      <Field label={t('ship.storageDays')} hint={t('ship.storageDaysHint')} error={e.storageDays?.message}>
        <Input type="number" inputMode="numeric" min="0" {...r('storageDays')} />
      </Field>
      {showStatus ? (
        <Field label={t('ship.status')}>
          <Select {...r('status')}>
            {SHIPMENT_STATUSES.map((x) => <option key={x} value={x}>{t(`shipStatus.${x}`)}</option>)}
          </Select>
        </Field>
      ) : (
        <div />
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-2.5 md:col-span-2">
        <Checkbox label={t('ship.insurance')} {...r('insuranceRequired')} />
        <Checkbox label={t('ship.customs')} {...r('customsRequired')} />
        <Checkbox label={t('ship.special')} {...r('specialHandling')} />
      </div>
      <p className="-mt-2 text-xs text-ink-soft md:col-span-2">{t('ship.flagsHint')}</p>
      <Field label={t('ship.requirements')} className="md:col-span-2">
        <Textarea {...r('requirements')} />
      </Field>
    </div>
  );
}
