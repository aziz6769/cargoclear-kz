import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LANGUAGES } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { useAuth } from '../../app/AuthContext.jsx';
import { Badge, Banner, Button, Card, CardHeader, Field, Input, PageHeader, Select, Spinner } from '../../components/ui.jsx';
import { profileSchema, resetSchema } from '../auth/schemas.js';

const msg = (t, e) => (e?.message ? t(e.message) : undefined);

function ProfileForm() {
  const { t, notify, repo, reload } = useApp();
  const { client, user, lang } = useAuth();
  const [state, setState] = useState({ loading: true, error: null });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: '', company: '', language: lang },
  });
  useEffect(() => {
    let alive = true;
    client.from('profiles').select('full_name, company_name, preferred_language').eq('id', user.id).maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      if (error) return setState({ loading: false, error: 'auth.profile.loadError' });
      reset({ fullName: data?.full_name ?? user.user_metadata?.full_name ?? '', company: data?.company_name ?? user.user_metadata?.company_name ?? '', language: data?.preferred_language ?? lang });
      setState({ loading: false, error: null });
    });
    return () => { alive = false; };
  }, [client, user, reset, lang]);
  const submit = handleSubmit(async (v) => {
    const { error } = await client.from('profiles').update({ full_name: v.fullName, company_name: v.company }).eq('id', user.id);
    if (error) return notify('bad', t('auth.profile.saveError'));
    await client.auth.updateUser({ data: { full_name: v.fullName, company_name: v.company } });
    if (v.language !== lang) await repo.saveSettings({ language: v.language });
    notify('ok', t('auth.profile.saved'));
    reload();
  });
  if (state.loading) return <Spinner label={t('common.loading')} />;
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {state.error && <Banner tone="bad">{t(state.error)}</Banner>}
      <Field label={t('auth.fullName')} error={msg(t, errors.fullName)}><Input autoComplete="name" {...register('fullName')} /></Field>
      <Field label={t('auth.company')} error={msg(t, errors.company)}><Input autoComplete="organization" {...register('company')} /></Field>
      <Field label={t('auth.email')} hint={t('auth.profile.emailHint')}><Input value={user.email ?? ''} readOnly disabled /></Field>
      <Field label={t('set.language')}>
        <Select {...register('language')}>{LANGUAGES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}</Select>
      </Field>
      <Button type="submit" variant="primary" loading={isSubmitting} disabled={isSubmitting}>{t('common.save')}</Button>
    </form>
  );
}

function PasswordForm() {
  const { t, notify } = useApp();
  const { updatePassword } = useAuth();
  const [error, setError] = useState(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' } });
  const submit = handleSubmit(async (v) => {
    setError(null);
    const r = await updatePassword(v.password);
    if (r.error) return setError(r.error);
    reset();
    notify('ok', t('auth.profile.passwordChanged'));
  });
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <Banner tone="bad"><span role="alert">{t(error)}</span></Banner>}
      <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')} error={msg(t, errors.password)}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
      <Field label={t('auth.confirm')} error={msg(t, errors.confirm)}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
      <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>{t('auth.profile.changePassword')}</Button>
    </form>
  );
}

/** Pending / failed changes: nothing is dropped silently, the user decides to retry or discard. */
function SyncPanel() {
  const { t, cloud, sync, syncNow, notify, reload } = useApp();
  const [items, setItems] = useState([]);
  useEffect(() => {
    let alive = true;
    cloud.pendingChanges().then((x) => alive && setItems(x));
    return () => { alive = false; };
  }, [cloud, sync]);
  const failed = items.filter((i) => i.failed);
  return (
    <Card id="sync">
      <CardHeader title={t('sync.panel.title')} subtitle={t('sync.panel.subtitle')} />
      <div className="space-y-3 px-5 pb-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={sync?.state === 'synced' ? 'ok' : sync?.state === 'error' || sync?.state === 'auth' ? 'bad' : 'warn'}>{t(`sync.${sync?.state ?? 'syncing'}`, { n: sync?.pending ?? 0 })}</Badge>
          <span className="text-ink-soft">{t('sync.panel.pending', { n: items.length })}</span>
        </div>
        {sync?.error && <Banner tone="bad" title={t(`sync.err.${sync.error.kind ?? 'rejected'}`)}><span className="break-words text-xs">{String(sync.error.message ?? '')}</span></Banner>}
        {failed.length > 0 && <p className="text-ink-soft">{t('sync.panel.failed', { n: failed.length })}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={syncNow} data-sync-now>{t('sync.now')}</Button>
          {failed.length > 0 && (
            <>
              <Button variant="primary" onClick={async () => { await cloud.retryFailed(); await cloud.settled(4000); reload(); }}>{t('sync.retry')}</Button>
              <Button variant="danger" onClick={async () => { await cloud.discardFailed(); notify('ok', t('sync.discarded')); await syncNow(); }}>{t('sync.discard')}</Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function Profile() {
  const { t } = useApp();
  return (
    <div className="space-y-5">
      <PageHeader title={t('auth.profile.title')} subtitle={t('auth.profile.subtitle')} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader title={t('auth.profile.account')} /><div className="px-5 pb-5"><ProfileForm /></div></Card>
        <Card><CardHeader title={t('auth.profile.security')} /><div className="px-5 pb-5"><PasswordForm /></div></Card>
      </div>
      <SyncPanel />
    </div>
  );
}
