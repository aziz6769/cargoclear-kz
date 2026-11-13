import { ShieldCheck } from 'lucide-react';
import { LANGUAGES } from '@cargoclear/core';
import { useAuth } from '../../app/AuthContext.jsx';
import { cx } from '../../components/ui.jsx';

/** Branded shell for the public (signed-out) pages. */
export default function AuthLayout({ title, subtitle, children, footer }) {
  const { t, lang, setLang } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-canvas md:flex-row">
      <aside className="flex flex-col justify-between bg-navy px-6 py-6 text-white md:w-[420px] md:px-10 md:py-10">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal"><ShieldCheck size={20} /></span>
          <span className="text-xl font-bold tracking-tight">CargoClear <span className="font-medium text-teal">KZ</span></span>
        </div>
        <div className="my-6 hidden md:block">
          <h2 className="font-display text-2xl font-bold leading-snug">{t('auth.hero.title')}</h2>
          <p className="mt-3 text-sm text-slate-300">{t('auth.hero.text')}</p>
        </div>
        <p className="hidden text-xs text-slate-400 md:block">{t('auth.hero.note')}</p>
      </aside>
      <main className="flex flex-1 flex-col px-4 py-6 sm:px-8 md:py-10">
        <div className="mb-4 flex justify-end">
          <div className="flex overflow-hidden rounded-lg border border-line bg-white text-xs font-semibold" role="group" aria-label="language">
            {LANGUAGES.map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
                className={cx('min-w-[40px] px-2.5 py-2.5 uppercase md:py-1.5', lang === l ? 'bg-navy text-white' : 'text-ink-soft hover:bg-white')}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="mx-auto w-full max-w-md flex-1">
          <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          <div className="mt-6 rounded-xl border border-line bg-white p-5 shadow-sm sm:p-6">{children}</div>
          {footer && <div className="mt-4 text-center text-sm text-ink-soft">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
