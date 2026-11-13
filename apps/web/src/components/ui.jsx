import { forwardRef, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { useApp } from '../app/DataContext.jsx';

export const cx = (...a) => a.filter(Boolean).join(' ');

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, className, children, ...p }) {
  const sizes = { sm: 'h-10 px-3 text-sm md:h-8', md: 'h-11 px-4 text-sm md:h-10', lg: 'h-12 px-5 text-[15px] md:h-11' };
  const variants = {
    primary: 'bg-brand text-white hover:bg-brand-600',
    secondary: 'border border-line bg-white text-ink hover:bg-canvas',
    ghost: 'text-ink-soft hover:bg-canvas hover:text-ink',
    danger: 'bg-bad text-white hover:bg-red-600',
    dangerGhost: 'text-bad hover:bg-bad-50',
  };
  return (
    <button
      type="button"
      {...p}
      disabled={p.disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50',
        sizes[size],
        variants[variant],
        className,
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, tone = 'ghost', ...p }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...p}
      className={cx(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors md:h-8 md:w-8',
        tone === 'danger' ? 'text-bad hover:bg-bad-50' : 'text-ink-soft hover:bg-canvas hover:text-ink',
      )}
    >
      <Icon size={16} />
    </button>
  );
}

export function Card({ className, children, ...p }) {
  return (
    <div {...p} className={cx('card', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

const TONES = {
  neutral: 'bg-canvas text-ink-soft',
  ok: 'bg-ok-50 text-ok',
  warn: 'bg-warn-50 text-warn-ink',
  bad: 'bg-bad-50 text-bad',
  brand: 'bg-brand-50 text-brand',
  teal: 'bg-teal-50 text-teal',
};
export function Badge({ tone = 'neutral', className, children }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {children}
    </span>
  );
}

export const inputCls =
  'h-11 w-full rounded-lg border border-line bg-white px-3 text-base text-ink placeholder:text-slate-400 md:h-10 md:text-sm ' +
  'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-canvas disabled:text-ink-soft';

export const Input = forwardRef(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx(inputCls, className)} />;
});
export const Select = forwardRef(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} {...p} className={cx(inputCls, 'pr-8', className)}>
      {children}
    </select>
  );
});
export const Textarea = forwardRef(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} rows={3} {...p} className={cx(inputCls, 'h-auto py-2', className)} />;
});

export const Checkbox = forwardRef(function Checkbox({ label, className, ...p }, ref) {
  return (
    <label className={cx('flex min-h-[40px] cursor-pointer items-center gap-2.5 text-sm text-ink md:min-h-0', className)}>
      <input ref={ref} type="checkbox" {...p} className="h-5 w-5 rounded border-line text-brand focus:ring-brand/30 md:h-4 md:w-4" />
      {label}
    </label>
  );
});

export function Field({ label, error, hint, required, className, children }) {
  const { t } = useApp();
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-ink-soft">
        {label}
        {required && <span className="text-bad"> *</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-bad">{t(error)}</span>}
      {hint && !error && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

export function Segmented({ options, value, onChange, className = 'inline-flex' }) {
  return (
    <div className={cx('gap-px overflow-hidden rounded-lg border border-line bg-line', className)} role="group">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cx(
              'px-2.5 py-2.5 text-xs font-medium transition-colors md:py-1.5',
              active ? o.activeCls ?? 'bg-brand text-white' : 'bg-white text-ink-soft hover:bg-canvas',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center bg-navy/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx('flex h-[100dvh] w-full flex-col bg-white shadow-xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton icon={X} label="close" onClick={onClose} />
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex gap-2 border-t border-line px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 max-sm:[&>button]:flex-1 sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, text, confirmLabel, onConfirm, onClose, danger = true }) {
  const { t } = useApp();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-soft">{text}</p>
    </Modal>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 max-sm:w-full">{actions}</div>}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, hint, tone = 'brand' }) {
  const tones = { brand: 'bg-brand-50 text-brand', teal: 'bg-teal-50 text-teal', ok: 'bg-ok-50 text-ok', warn: 'bg-warn-50 text-warn-ink' };
  return (
    <Card className="min-w-0 p-3.5 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 break-words text-[11px] sm:text-sm leading-snug text-ink-soft sm:text-sm">{label}</span>
        <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9', tones[tone])}>
          <Icon size={17} />
        </span>
      </div>
      <div className="tabular mt-2 whitespace-nowrap text-lg font-bold tracking-tight text-ink sm:mt-3 sm:text-2xl">{value}</div>
      {hint && <div className="mt-1 text-[11px] leading-snug text-ink-soft sm:text-xs">{hint}</div>}
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-canvas text-ink-soft">
          <Icon size={22} />
        </span>
      )}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-soft">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Banner({ tone = 'info', title, children, className }) {
  const map = {
    info: ['border-brand/20 bg-brand-50 text-navy', Info, 'text-brand'],
    warn: ['border-warn/40 bg-warn-50 text-warn-ink', AlertTriangle, 'text-warn-ink'],
    bad: ['border-bad/30 bg-bad-50 text-bad', AlertTriangle, 'text-bad'],
    ok: ['border-ok/30 bg-ok-50 text-ok', CheckCircle2, 'text-ok'],
  };
  const [cls, Icon, icn] = map[tone];
  return (
    <div className={cx('flex gap-3 rounded-xl border px-4 py-3 text-sm', cls, className)}>
      <Icon size={18} className={cx('mt-0.5 shrink-0', icn)} />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
      <Loader2 className="animate-spin" size={18} /> {label}
    </div>
  );
}

/** Primary form actions: pinned above the bottom navigation on phones, inline on larger screens. */
export function StickyBar({ children, className }) {
  return (
    <div
      className={cx(
        'fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex gap-2 border-t border-line bg-white/95 p-3 backdrop-blur',
        'md:static md:z-auto md:justify-end md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none',
        className,
      )}
    >
      {children}
    </div>
  );
}
