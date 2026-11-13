import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, UploadCloud, User } from 'lucide-react';
import { useApp } from '../../app/DataContext.jsx';
import { useAuth } from '../../app/AuthContext.jsx';
import { ConfirmDialog } from '../../components/ui.jsx';

export const initialsOf = (name, email) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const src = parts.length ? parts.slice(0, 2).map((p) => p[0]).join('') : String(email || 'U')[0];
  return src.toUpperCase();
};

export default function AccountMenu() {
  const { t, account, sync, cloud } = useApp();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  if (!account) return null;
  const pending = cloud ? cloud.status().pending : 0;
  const out = async () => {
    await cloud?.settled(2500);
    await signOut();
  };
  return (
    <div className="relative" ref={ref}>
      <button type="button" data-account-menu aria-haspopup="menu" aria-expanded={open} aria-label={t('auth.account')} onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand">
        {initialsOf(account.name, account.email)}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-line bg-white p-1.5 shadow-lg">
          <div className="border-b border-line px-3 py-2">
            <div className="truncate text-sm font-semibold">{account.name || account.email}</div>
            {account.company && <div className="truncate text-xs text-ink-soft">{account.company}</div>}
            <div className="truncate text-xs text-ink-soft">{account.email}</div>
          </div>
          <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className="flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-sm hover:bg-canvas"><User size={16} />{t('auth.profile.menu')}</Link>
          <Link role="menuitem" to="/migrate" onClick={() => setOpen(false)} className="flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-sm hover:bg-canvas"><UploadCloud size={16} />{t('mig.menu')}</Link>
          <button role="menuitem" type="button" data-logout onClick={() => (pending > 0 || sync?.state === 'error' ? setConfirm(true) : out())}
            className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-bad hover:bg-red-50">
            <LogOut size={16} />{t('auth.logout')}
          </button>
        </div>
      )}
      <ConfirmDialog open={confirm} title={t('auth.logout')} text={t('auth.logout.pending', { n: pending })} confirmLabel={t('auth.logout')}
        onConfirm={async () => { setConfirm(false); await signOut(); }} onClose={() => setConfirm(false)} />
    </div>
  );
}
