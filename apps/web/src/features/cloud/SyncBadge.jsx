import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Cloud, CloudOff, HardDrive, Loader2, LogIn, Play, RefreshCw } from 'lucide-react';
import { useApp } from '../../app/DataContext.jsx';
import { cx } from '../../components/ui.jsx';

const TONE = {
  synced: 'border-teal/30 bg-teal/10 text-teal-700',
  syncing: 'border-brand/30 bg-brand-50 text-brand',
  pending: 'border-amber-300 bg-amber-50 text-amber-800',
  offline: 'border-amber-300 bg-amber-50 text-amber-800',
  error: 'border-bad/40 bg-red-50 text-bad',
  auth: 'border-bad/40 bg-red-50 text-bad',
};
const ICON = { synced: Cloud, syncing: Loader2, pending: RefreshCw, offline: CloudOff, error: AlertTriangle, auth: LogIn };

/** Always visible: where the data lives (cloud / this device / demo) and whether it is synchronised. */
export default function SyncBadge({ compact = false }) {
  const { mode, sync, syncNow, t, fmt } = useApp();
  const navigate = useNavigate();
  if (mode === 'local')
    return <span data-sync="local" title={t('sync.local.hint')} className="hidden h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-xs font-medium text-ink-soft md:inline-flex"><HardDrive size={14} />{!compact && t('sync.local')}</span>;
  if (mode === 'demo')
    return <span data-sync="demo" title={t('sync.demo.hint')} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-800"><Play size={14} />{!compact && t('sync.demo')}</span>;
  const s = sync?.state ?? 'syncing';
  const Icon = ICON[s] ?? Cloud;
  const label =
    s === 'pending' ? t('sync.pending', { n: sync.pending })
    : s === 'synced' ? t('sync.synced')
    : t(`sync.${s}`);
  const time = s === 'synced' && sync?.lastSyncAt ? ` · ${new Date(sync.lastSyncAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '';
  return (
    <button
      type="button"
      data-sync={s}
      aria-live="polite"
      title={t(`sync.${s}.hint`)}
      onClick={() => (s === 'error' || s === 'auth' ? navigate('/profile#sync') : syncNow())}
      className={cx('inline-flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold lg:px-3', TONE[s])}
    >
      <Icon size={14} className={s === 'syncing' ? 'animate-spin' : ''} />
      <span className={compact ? 'max-lg:hidden' : ''}>{label}{time}</span>
    </button>
  );
}
