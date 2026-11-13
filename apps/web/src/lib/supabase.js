import { createClient } from '@supabase/supabase-js';

// Only the project URL and the PUBLISHABLE (anon) key belong in the browser. Data safety comes from Row Level Security.
// Never put a service_role key, a database password or any other privileged secret into a VITE_* variable.
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

export const cloudConfigured = Boolean(url && key);

export const supabase = cloudConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
