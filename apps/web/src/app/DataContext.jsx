import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  RepoError,
  createAssistant,
  createHttpProvider,
  rulesProvider,
  validEndpoint,
  buildAllViews,
  createTranslator,
  formatDate,
  formatMoney,
  formatPct,
} from '@cargoclear/core';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const EMPTY = { shipments: [], carriers: [], offers: [], comparisons: [], documents: [], events: [], settings: DEFAULT_SETTINGS };

/**
 * Glue between the UI and the data access layer.
 * `repo` is the only way the UI touches data; swap it for a REST-backed repo later.
 */
export function DataProvider({ repo, children }) {
  const [st, setSt] = useState({ status: 'loading', data: null, error: null });
  const [toasts, setToasts] = useState([]);

  const load = useCallback(async () => {
    try {
      await repo.init();
      const [shipments, carriers, offers, comparisons, documents, events, settings] = await Promise.all([
        repo.getShipments(),
        repo.getCarriers(),
        repo.getOffers(),
        repo.getComparisons(),
        repo.getDocuments(),
        repo.getEvents(),
        repo.getSettings(),
      ]);
      setSt({ status: 'ready', data: { shipments, carriers, offers, comparisons, documents, events, settings }, error: null });
    } catch (error) {
      console.error(error);
      setSt({ status: 'error', data: null, error });
    }
  }, [repo]);

  useEffect(() => {
    load();
  }, [load]);

  const data = st.data ?? EMPTY;
  const settings = data.settings;
  const lang = settings.language;
  const t = useMemo(() => createTranslator(lang), [lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const views = useMemo(() => buildAllViews({ ...data }), [data]);

  const fmt = useMemo(
    () => ({
      money: (n, cur) => formatMoney(n, cur ?? settings.currency, lang),
      pct: (n) => formatPct(n, lang),
      date: (d) => formatDate(d, lang),
    }),
    [lang, settings.currency],
  );

  const notify = useCallback((tone, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((x) => [...x, { id, tone, message }]);
    setTimeout(() => setToasts((x) => x.filter((i) => i.id !== id)), 3800);
  }, []);

  /** Run a repository mutation, refresh data, toast the outcome. Returns { ok, value }. */
  const act = useCallback(
    async (fn, okKey) => {
      try {
        const value = await fn();
        await load();
        if (okKey) notify('ok', t(okKey));
        return { ok: true, value };
      } catch (error) {
        if (!(error instanceof RepoError)) console.error(error); // RepoError = expected, already shown as a toast
        notify('bad', t(error instanceof RepoError ? `err.${error.code}` : 'err.generic'));
        return { ok: false, error };
      }
    },
    [load, notify, t],
  );

  /** (Re)build the jury demo scenario in the current language. Touches only the demo records. */
  const launchDemo = useCallback(() => act(() => repo.launchDemo(lang)), [act, repo, lang]);

  /** Assistant service: rule-based unless the owner configured their own AI proxy endpoint (never an API key). */
  const aiEndpoint = settings.assistantEndpoint;
  const assistant = useMemo(() => {
    let provider = rulesProvider;
    try {
      if (validEndpoint(aiEndpoint)) provider = createHttpProvider({ endpoint: aiEndpoint });
    } catch {
      /* invalid endpoint -> stay rule-based */
    }
    return createAssistant({ repo, provider });
  }, [repo, aiEndpoint]);

  const value = useMemo(
    () => ({ status: st.status, error: st.error, repo, reload: load, data, settings, lang, t, views, fmt, notify, act, launchDemo, assistant }),
    [st.status, st.error, repo, load, data, settings, lang, t, views, fmt, notify, act, launchDemo, assistant],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex flex-col gap-2 md:bottom-6">
        {toasts.map((x) => (
          <div
            key={x.id}
            role="status"
            className={`pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
              x.tone === 'bad' ? 'bg-bad' : 'bg-navy'
            }`}
          >
            {x.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
