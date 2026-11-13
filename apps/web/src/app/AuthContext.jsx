import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createTranslator } from '@cargoclear/core';
import { supabase } from '../lib/supabase.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

const LANG_KEY = 'cargoclear.lang';
const detectLang = () => {
  try {
    const s = localStorage.getItem(LANG_KEY);
    if (['ru', 'kk', 'en'].includes(s)) return s;
  } catch { /* storage unavailable */ }
  const n = (navigator.language || 'ru').slice(0, 2);
  return n === 'kk' ? 'kk' : n === 'en' ? 'en' : 'ru';
};

/** Maps a Supabase auth error to an i18n key. Messages from the server are never shown verbatim. */
export function authErrorKey(error) {
  if (!error) return null;
  const msg = String(error.message ?? '').toLowerCase();
  const code = String(error.code ?? '');
  if (error.status === 0 || /fetch|network|failed to/.test(msg)) return 'auth.err.network';
  if (code === 'invalid_credentials' || /invalid login/.test(msg)) return 'auth.err.invalid';
  if (code === 'email_not_confirmed' || /not confirmed/.test(msg)) return 'auth.err.unconfirmed';
  if (code === 'user_already_exists' || /already registered/.test(msg)) return 'auth.err.exists';
  if (code === 'weak_password' || /password/.test(msg)) return 'auth.err.weak';
  if (error.status === 429 || /rate limit|too many/.test(msg)) return 'auth.err.rate';
  if (/expired|invalid.*(token|link)|session/.test(msg)) return 'auth.err.expired';
  return 'auth.err.generic';
}

/** Session state for the cloud mode. Only rendered when Supabase is configured. */
export function AuthProvider({ client = supabase, children }) {
  const [state, setState] = useState({ loading: true, session: null, recovery: false, expired: false });
  const [lang, setLangState] = useState(detectLang);
  const [demo, setDemo] = useState(false);
  const manualOut = useRef(false);

  useEffect(() => {
    let alive = true;
    client.auth.getSession().then(({ data }) => {
      if (alive) setState((s) => ({ ...s, loading: false, session: data?.session ?? null }));
    }).catch(() => alive && setState((s) => ({ ...s, loading: false })));
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      setState((s) => {
        const signedOut = event === 'SIGNED_OUT';
        return {
          loading: false,
          session: session ?? null,
          recovery: event === 'PASSWORD_RECOVERY' ? true : signedOut ? false : s.recovery,
          // an unexpected sign-out (refresh token rejected / revoked) is reported, an explicit one is not
          expired: signedOut ? !manualOut.current && Boolean(s.session) : false,
        };
      });
      if (event === 'SIGNED_OUT') manualOut.current = false;
    });
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [client]);

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const t = useMemo(() => createTranslator(lang), [lang]);

  const api = useMemo(() => ({
    client,
    ...state,
    user: state.session?.user ?? null,
    lang, setLang, t, demo,
    enterDemo: () => setDemo(true),
    exitDemo: () => setDemo(false),
    clearRecovery: () => setState((s) => ({ ...s, recovery: false })),
    dismissExpired: () => setState((s) => ({ ...s, expired: false })),
    signIn: async (email, password) => {
      const { error } = await client.auth.signInWithPassword({ email, password });
      return { error: authErrorKey(error) };
    },
    signUp: async ({ fullName, company, email, password }) => {
      const { data, error } = await client.auth.signUp({
        email, password,
        options: { data: { full_name: fullName, company_name: company, preferred_language: lang }, emailRedirectTo: `${window.location.origin}/login` },
      });
      // when e-mail confirmation is on, Supabase returns no session: the user must confirm first
      return { error: authErrorKey(error), needsConfirmation: !error && !data?.session };
    },
    signOut: async () => {
      manualOut.current = true;
      await client.auth.signOut();
    },
    // identical result whether or not the address exists (no account enumeration); only transport errors are shown
    resetPassword: async (email) => {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      const key = authErrorKey(error);
      return { error: key === 'auth.err.network' || key === 'auth.err.rate' ? key : null };
    },
    updatePassword: async (password) => {
      const { error } = await client.auth.updateUser({ password });
      return { error: authErrorKey(error) };
    },
  }), [client, state, lang, setLang, t, demo]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
