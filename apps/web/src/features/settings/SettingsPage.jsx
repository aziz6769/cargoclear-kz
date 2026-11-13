import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CURRENCIES, LANGUAGES } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Banner, Button, Card, CardHeader, Checkbox, ConfirmDialog, Field, Input, PageHeader, Select, cx } from '../../components/ui.jsx';

const LANG_NAMES = { ru: 'Русский', kk: 'Қазақша', en: 'English' };

function Choice({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'border-brand bg-brand-50 text-brand' : 'border-line bg-white text-ink hover:bg-canvas',
      )}
    >
      {children}
    </button>
  );
}

export default function SettingsPage() {
  const { t, settings, lang, repo, act, reload } = useApp();
  const [confirm, setConfirm] = useState(null); // 'reset' | 'wipe'
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      profile: settings.profile,
      business: settings.business,
      currency: settings.currency,
      rates: Object.fromEntries(Object.entries(settings.rates).map(([k, v]) => [k, v ?? ''])),
      notifications: settings.notifications,
    },
  });
  const base = watch('currency');

  const onSubmit = async (v) => {
    const rates = {};
    let bad = false;
    for (const [cur, raw] of Object.entries(v.rates)) {
      if (raw === '' || raw === null) {
        rates[cur] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        setError(`rates.${cur}`, { message: 'v.positive' });
        bad = true;
      } else rates[cur] = n;
    }
    if (bad) return;
    await act(() => repo.saveSettings({ profile: v.profile, business: v.business, currency: v.currency, rates, notifications: v.notifications }), 'set.saved');
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title={t('nav.settings')} subtitle={t('set.subtitle')} />

      <div className="space-y-6">
        <Card>
          <CardHeader title={t('set.language')} />
          <div className="flex flex-wrap gap-2 p-5">
            {LANGUAGES.map((l) => (
              <Choice key={l} active={lang === l} onClick={async () => { await repo.saveSettings({ language: l }); await reload(); }}>
                {LANG_NAMES[l]}
              </Choice>
            ))}
          </div>
          {lang === 'kk' && <p className="px-5 pb-4 text-xs text-ink-soft">{t('set.kkNote')}</p>}
        </Card>

        <Card>
          <CardHeader title={t('set.theme')} />
          <div className="flex flex-wrap items-center gap-2 p-5">
            <Choice active>{t('set.themeLight')}</Choice>
            <Choice disabled>{t('set.themeDark')}</Choice>
            <span className="text-xs text-ink-soft">{t('set.soon')}</span>
          </div>
        </Card>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
          <Card>
            <CardHeader title={t('set.profile')} />
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
              <Field label={t('set.name')}><Input {...register('profile.name')} /></Field>
              <Field label={t('car.email')}><Input type="email" {...register('profile.email')} /></Field>
              <Field label={t('car.phone')}><Input type="tel" {...register('profile.phone')} /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('set.business')} />
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
              <Field label={t('set.company')}><Input {...register('business.company')} /></Field>
              <Field label={t('set.bin')}><Input inputMode="numeric" {...register('business.bin')} /></Field>
              <Field label={t('set.city')}><Input {...register('business.city')} /></Field>
              <Field label={t('set.industry')}><Input {...register('business.industry')} /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('set.currency')} subtitle={t('set.currencyHint')} />
            <div className="space-y-4 p-5">
              <Field label={t('set.baseCurrency')} className="max-w-xs">
                <Select {...register('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
              </Field>
              <div>
                <div className="mb-2 text-sm font-semibold">{t('set.rates')}</div>
                <p className="mb-3 text-xs text-ink-soft">{t('set.ratesHint')}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {CURRENCIES.filter((c) => c !== base).map((c) => (
                    <Field key={c} label={`1 ${c} =`} error={errors.rates?.[c]?.message}>
                      <div className="flex items-center gap-2">
                        <Input type="number" inputMode="decimal" step="any" min="0" className="tabular" placeholder={t('set.notSet')} {...register(`rates.${c}`)} />
                        <span className="text-sm text-ink-soft">{base}</span>
                      </div>
                    </Field>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('set.notifications')} />
            <div className="space-y-3 p-5">
              <Checkbox label={t('set.nMissing')} {...register('notifications.missingInfo')} />
              <Checkbox label={t('set.nOffers')} {...register('notifications.newOffers')} />
              <Checkbox label={t('set.nEmail')} {...register('notifications.email')} />
              <p className="text-xs text-ink-soft">{t('set.nHint')}</p>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={isSubmitting}>{t('common.save')}</Button>
          </div>
        </form>

        <Card>
          <CardHeader title={t('set.data')} subtitle={t('set.dataHint')} />
          <div className="flex flex-wrap gap-3 p-5">
            <Button onClick={() => setConfirm('reset')}>{t('set.reset')}</Button>
            <Button variant="dangerGhost" onClick={() => setConfirm('wipe')}>{t('set.wipe')}</Button>
          </div>
        </Card>
        <Banner tone="info" title={t('set.integrationsTitle')}>{t('set.integrationsText')}</Banner>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm === 'wipe' ? t('set.wipe') : t('set.reset')}
        text={confirm === 'wipe' ? t('set.wipeText') : t('set.resetText')}
        confirmLabel={t('common.confirm')}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm;
          setConfirm(null);
          await act(() => (c === 'wipe' ? repo.clearAllData() : repo.resetDemoData()), c === 'wipe' ? 'set.wiped' : 'set.resetDone');
        }}
      />
    </div>
  );
}
