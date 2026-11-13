import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { useApp } from '../app/DataContext.jsx';
import { cx } from './ui.jsx';

/**
 * Tooltip for a logistics term. Opens on hover, focus or tap; closes on Escape or outside tap.
 * Text lives in the dictionaries as `gloss.<term>`.
 */
export function InfoTip({ term, className }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <span ref={ref} className={cx('relative inline-flex align-middle', className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`${t('gloss.what')}: ${t(`gloss.${term}.t`)}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex -m-2.5 h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand md:m-0 md:h-5 md:w-5"
      >
        <Info size={14} />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-40 mt-1.5 w-60 max-w-[70vw] -translate-x-1/2 rounded-lg bg-navy px-3 py-2 text-left text-xs font-normal leading-snug text-white shadow-lg max-sm:left-0 max-sm:translate-x-0"
        >
          <b className="block">{t(`gloss.${term}.t`)}</b>
          {t(`gloss.${term}.d`)}
        </span>
      )}
    </span>
  );
}
