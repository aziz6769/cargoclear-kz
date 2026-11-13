import { useMemo } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { createCloudAdapter, createRepository } from '@cargoclear/core';
import { seed } from '@cargoclear/core/seed';
import App from '../App.jsx';
import { createDexieAdapter } from '../storage/dexieAdapter.js';
import { supabase } from '../lib/supabase.js';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { ForgotPassword, Login, Register, ResetPassword } from '../features/auth/Pages.jsx';
import { Banner, Spinner } from '../components/ui.jsx';

/** Local-only mode (no Supabase configured): exactly the Phase 3 behaviour, data in IndexedDB, demo seed included. */
export function LocalApp({ repo }) {
  return <App repo={repo} mode="local" />;
}

function DemoApp() {
  const { exitDemo, t } = useAuth();
  // Guest demo: a separate local database. It is never connected to the cloud and never uploaded.
  const repo = useMemo(() => createRepository(createDexieAdapter('cargoclear-kz-demo'), seed), []);
  return <App repo={repo} mode="demo" onExitDemo={exitDemo} exitLabel={t('auth.demo.exit')} />;
}

function CloudApp({ user }) {
  const { client } = useAuth();
  const bundle = useMemo(() => {
    // one cache database per account: another user on the same browser never sees these records
    const cache = createDexieAdapter(`cargoclear-cache-${user.id}`);
    const cloud = createCloudAdapter({ client, userId: user.id, cache });
    return { cloud, repo: createRepository(cloud, null) }; // seed = null: demo data can never reach the cloud
  }, [client, user.id]);
  const account = useMemo(
    () => ({ id: user.id, email: user.email ?? '', name: user.user_metadata?.full_name ?? '', company: user.user_metadata?.company_name ?? '' }),
    [user],
  );
  return <App repo={bundle.repo} cloud={bundle.cloud} mode="cloud" account={account} />;
}

function Switch() {
  const { loading, user, recovery, demo, t } = useAuth();
  if (loading) return <Spinner label={t('common.loading')} />;
  if (recovery) return <Routes><Route path="*" element={<ResetPassword />} /></Routes>;
  if (user) return <Routes><Route path="/login" element={<Navigate to="/" replace />} /><Route path="/register" element={<Navigate to="/" replace />} /><Route path="*" element={<CloudApp user={user} />} /></Routes>;
  if (demo) return <DemoApp />;
  return (
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<Login />} />
    </Routes>
  );
}

/** Mode switch. Private routes are simply not rendered without a session (protected routes); RLS is the real guard. */
export default function Root({ localRepo, client = supabase }) {
  if (!client) {
    return localRepo ? <LocalApp repo={localRepo} /> : <Banner tone="bad">Supabase is not configured</Banner>;
  }
  return (
    <AuthProvider client={client}>
      <Switch />
    </AuthProvider>
  );
}
