import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Banner, Button, Field, Input } from '../../components/ui.jsx';
import { useAuth } from '../../app/AuthContext.jsx';
import AuthLayout from './AuthLayout.jsx';
import { forgotSchema, loginSchema, registerSchema, resetSchema } from './schemas.js';

const msg = (t, e) => (e?.message ? t(e.message) : undefined);

export function Login() {
  const { t, signIn, expired, dismissExpired, enterDemo, user } = useAuth();
  const [error, setError] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  if (user) return <Navigate to="/" replace />;
  const submit = handleSubmit(async (v) => {
    setError(null);
    dismissExpired();
    const r = await signIn(v.email, v.password);
    if (r.error) setError(r.error);
  });
  return (
    <AuthLayout title={t('auth.login.title')} subtitle={t('auth.login.subtitle')}
      footer={<>{t('auth.login.noAccount')} <Link className="font-semibold text-brand hover:underline" to="/register">{t('auth.register.cta')}</Link></>}>
      {expired && <Banner tone="warn" title={t('auth.expired.title')} className="mb-4">{t('auth.expired.text')}</Banner>}
      {error && <Banner tone="bad" className="mb-4"><span role="alert">{t(error)}</span></Banner>}
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label={t('auth.email')} error={msg(t, errors.email)}><Input type="email" autoComplete="email" inputMode="email" {...register('email')} data-auth-email /></Field>
        <Field label={t('auth.password')} error={msg(t, errors.password)}><Input type="password" autoComplete="current-password" {...register('password')} data-auth-password /></Field>
        <Button type="submit" variant="primary" className="w-full" loading={isSubmitting} disabled={isSubmitting} data-auth-submit>{t('auth.login.submit')}</Button>
        <div className="text-right text-sm"><Link className="text-brand hover:underline" to="/forgot-password">{t('auth.forgot.cta')}</Link></div>
      </form>
      <div className="mt-5 border-t border-line pt-4">
        <Button className="w-full" onClick={enterDemo} data-auth-demo>{t('auth.demo.cta')}</Button>
        <p className="mt-2 text-xs text-ink-soft">{t('auth.demo.hint')}</p>
      </div>
    </AuthLayout>
  );
}

export function Register() {
  const { t, signUp, user } = useAuth();
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', company: '', email: '', password: '', confirm: '' },
  });
  if (user && !done) return <Navigate to="/" replace />;
  const submit = handleSubmit(async (v) => {
    setError(null);
    const r = await signUp(v);
    if (r.error) return setError(r.error);
    if (r.needsConfirmation) setDone(true);
  });
  if (done)
    return (
      <AuthLayout title={t('auth.confirm.title')} footer={<Link className="font-semibold text-brand hover:underline" to="/login">{t('auth.backToLogin')}</Link>}>
        <Banner tone="ok" title={t('auth.confirm.banner')}>{t('auth.confirm.text')}</Banner>
      </AuthLayout>
    );
  return (
    <AuthLayout title={t('auth.register.title')} subtitle={t('auth.register.subtitle')}
      footer={<>{t('auth.register.haveAccount')} <Link className="font-semibold text-brand hover:underline" to="/login">{t('auth.login.cta')}</Link></>}>
      {error && <Banner tone="bad" className="mb-4"><span role="alert">{t(error)}</span></Banner>}
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label={t('auth.fullName')} required error={msg(t, errors.fullName)}><Input autoComplete="name" {...register('fullName')} /></Field>
        <Field label={t('auth.company')} required error={msg(t, errors.company)}><Input autoComplete="organization" {...register('company')} /></Field>
        <Field label={t('auth.email')} required error={msg(t, errors.email)}><Input type="email" autoComplete="email" inputMode="email" {...register('email')} /></Field>
        <Field label={t('auth.password')} required hint={t('auth.passwordHint')} error={msg(t, errors.password)}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
        <Field label={t('auth.confirm')} required error={msg(t, errors.confirm)}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
        <Button type="submit" variant="primary" className="w-full" loading={isSubmitting} disabled={isSubmitting}>{t('auth.register.submit')}</Button>
      </form>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  const { t, resetPassword } = useAuth();
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });
  const submit = handleSubmit(async (v) => {
    setError(null);
    const r = await resetPassword(v.email);
    if (r.error) setError(r.error);
    else setSent(true);
  });
  return (
    <AuthLayout title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')} footer={<Link className="font-semibold text-brand hover:underline" to="/login">{t('auth.backToLogin')}</Link>}>
      {sent ? (
        <Banner tone="ok" title={t('auth.forgot.sentTitle')}>{t('auth.forgot.sent')}</Banner>
      ) : (
        <>
          {error && <Banner tone="bad" className="mb-4"><span role="alert">{t(error)}</span></Banner>}
          <form onSubmit={submit} noValidate className="space-y-4">
            <Field label={t('auth.email')} error={msg(t, errors.email)}><Input type="email" autoComplete="email" inputMode="email" {...register('email')} /></Field>
            <Button type="submit" variant="primary" className="w-full" loading={isSubmitting} disabled={isSubmitting}>{t('auth.forgot.submit')}</Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}

/** Opened from the e-mail link. The Supabase client turns the link into a recovery session; without it the form is not usable. */
export function ResetPassword() {
  const { t, updatePassword, session, loading, clearRecovery, signOut } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' } });
  const submit = handleSubmit(async (v) => {
    setError(null);
    const r = await updatePassword(v.password);
    if (r.error) return setError(r.error);
    setDone(true); // the recovery session stays active until the user continues, so this confirmation is not replaced by the app
  });
  return (
    <AuthLayout title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')}>
      {done ? (
        <>
          <Banner tone="ok" title={t('auth.reset.doneTitle')}>{t('auth.reset.done')}</Banner>
          <Button variant="primary" className="mt-4 w-full" onClick={() => { clearRecovery(); navigate('/', { replace: true }); }}>{t('auth.reset.continue')}</Button>
        </>
      ) : !loading && !session ? (
        <>
          <Banner tone="warn" title={t('auth.expired.linkTitle')}>{t('auth.expired.link')}</Banner>
          <Link to="/forgot-password" className="mt-4 inline-block font-semibold text-brand hover:underline">{t('auth.forgot.cta')}</Link>
        </>
      ) : (
        <>
          {error && <Banner tone="bad" className="mb-4"><span role="alert">{t(error)}</span></Banner>}
          <form onSubmit={submit} noValidate className="space-y-4">
            <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')} error={msg(t, errors.password)}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
            <Field label={t('auth.confirm')} error={msg(t, errors.confirm)}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
            <Button type="submit" variant="primary" className="w-full" loading={isSubmitting} disabled={isSubmitting}>{t('auth.reset.submit')}</Button>
            <Button type="button" className="w-full" onClick={signOut}>{t('common.cancel')}</Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
