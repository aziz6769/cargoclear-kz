import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  GitCompare,
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Package,
  Plus,
  Settings,
  ShieldCheck,
  Truck,
  User,
  X,
} from 'lucide-react';
import { Bot, FileText, Play } from 'lucide-react';
import { Suspense } from 'react';
import { PageSkeleton } from './Skeleton.jsx';
import { LangSwitch } from './LangSwitch.jsx';
import { useApp } from '../app/DataContext.jsx';
import { Banner, Button, cx } from './ui.jsx';

const NAV = [
  { to: '/', key: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/compare/new', key: 'nav.newComparison', icon: PlusCircle },
  { to: '/comparisons', key: 'nav.comparisons', icon: GitCompare },
  { to: '/shipments', key: 'nav.shipments', icon: Package },
  { to: '/carriers', key: 'nav.carriers', icon: Truck },
  { to: '/analytics', key: 'nav.analytics', icon: BarChart3 },
  { to: '/documents', key: 'nav.documents', icon: FileText },
  { to: '/assistant', key: 'nav.assistant', icon: Bot },
  { to: '/history', key: 'nav.history', icon: History },
  { to: '/settings', key: 'nav.settings', icon: Settings },
];

const BOTTOM = [
  { to: '/', key: 'nav.home', icon: LayoutDashboard, end: true },
  { to: '/compare/new', key: 'nav.compare', icon: GitCompare },
  { to: '/shipments', key: 'nav.shipments', icon: Package },
  { to: '/history', key: 'nav.history', icon: History },
  { to: '/settings', key: 'nav.profile', icon: User },
];

function Sidebar({ expanded, setExpanded }) {
  const { t } = useApp();
  const label = expanded ? 'inline' : 'hidden lg:inline';
  return (
    <aside
      className={cx(
        'sticky top-0 hidden h-screen shrink-0 flex-col bg-navy text-white transition-[width] md:flex',
        expanded ? 'w-64' : 'w-[72px] lg:w-64',
      )}
    >
      <div className="flex h-16 items-center gap-3 px-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal">
          <ShieldCheck size={18} />
        </span>
        <span className={cx('text-[17px] font-bold tracking-tight', label)}>
          CargoClear <span className="font-medium text-teal">KZ</span>
        </span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map(({ to, key, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={t(key)}
            className={({ isActive }) =>
              cx(
                'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            <span className={label}>{t(key)}</span>
          </NavLink>
        ))}
      </nav>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mx-3 mb-4 flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-slate-400 hover:bg-white/5 hover:text-white lg:hidden"
        aria-label="toggle sidebar"
      >
        {expanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        {expanded && <span>{t('nav.collapse')}</span>}
      </button>
    </aside>
  );
}

function Topbar() {
  const { t, settings, launchDemo } = useApp();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-white/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:h-16 md:px-8">
      <div className="flex items-center gap-2 md:hidden">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-teal">
          <ShieldCheck size={18} />
        </span>
        <span className="font-bold max-[359px]:hidden">CargoClear</span>
      </div>
      <div className="hidden text-sm text-ink-soft md:block">{t('app.tagline')}</div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          icon={Play}
          data-launch-demo
          aria-label={t('demo.launch')}
          onClick={async () => {
            const r = await launchDemo();
            if (r.ok) navigate('/demo');
          }}
        >
          <span className="max-lg:hidden">{t('demo.launch')}</span>
        </Button>
        <LangSwitch />
        <Button variant="primary" icon={Plus} onClick={() => navigate('/compare/new')} className="hidden sm:inline-flex">
          {t('common.newComparison')}
        </Button>
        <span className="hidden h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand lg:flex" title={settings.profile.name}>
          {(settings.profile.name || 'U').slice(0, 1).toUpperCase()}
        </span>
      </div>
    </header>
  );
}

function BottomNav() {
  const { t } = useApp();
  return (
    <nav
      aria-label="primary"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {BOTTOM.map(({ to, key, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cx('relative flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium', isActive ? 'text-brand' : 'text-ink-soft')
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-brand" />}
              <span className={cx('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-brand-50')}>
                <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
              </span>
              <span className="max-w-full truncate">{t(key)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppShell() {
  const { t } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);
  return (
    <div className="flex min-h-screen">
      <Sidebar expanded={expanded} setExpanded={setExpanded} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-[1280px] min-w-0 flex-1 px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-8 md:py-6 md:pb-10">
          {bannerOpen && (
            <div className="relative mb-4 md:mb-5">
              <Banner tone="info" title={t('demo.title')} className="pr-12 text-[13px] md:text-sm">
                {t('demo.text')}
              </Banner>
              <button
                type="button"
                onClick={() => setBannerOpen(false)}
                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-ink-soft hover:text-ink"
                aria-label="dismiss"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
