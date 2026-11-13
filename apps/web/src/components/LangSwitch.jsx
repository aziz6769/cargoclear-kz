import { LANGUAGES } from '@cargoclear/core';
import { useApp } from '../app/DataContext.jsx';
import { cx } from './ui.jsx';

export function LangSwitch({ className }) {
  const { lang, repo, reload } = useApp();
  const setLang = async (l) => {
    await repo.saveSettings({ language: l });
    reload();
  };
  return (
    <div className={cx('flex overflow-hidden rounded-lg border border-line bg-white text-xs font-semibold', className)} role="group" aria-label="language">
      {LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={cx('min-w-[40px] px-2.5 py-2.5 uppercase md:min-w-0 md:py-1.5', lang === l ? 'bg-navy text-white' : 'text-ink-soft hover:bg-canvas')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
