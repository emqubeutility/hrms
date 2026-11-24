import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { brandLogoSrc, useBranding } from '../lib/branding';
import BranchSwitcher from './BranchSwitcher';
import { NotificationItem, getNotifications } from '../lib/dashboard-api';
import { getMyMenu, MenuNode } from '../lib/api';
import { UserType } from '../lib/user-types';

/* ------------------------------------------------------------------ icons (outline, 24px grid) */

type IconProps = { className?: string };
const Svg = ({ className, children }: IconProps & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {children}
  </svg>
);
const HomeIcon = (p: IconProps) => <Svg {...p}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></Svg>;
const IdIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10.5" r="2.25" /><path d="M5.5 17c.6-2 2.2-3 3.5-3s2.9 1 3.5 3M14.5 9h4M14.5 12.5h4" /></Svg>;
const UsersIcon = (p: IconProps) => <Svg {...p}><circle cx="9" cy="8" r="4" /><path d="M2 21v-1a7 7 0 0 1 14 0v1" /><path d="M16 4.1a4 4 0 0 1 0 7.8M18 14.2A7 7 0 0 1 22 21" /></Svg>;
const ClockIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
const CalendarIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>;
const WalletIcon = (p: IconProps) => <Svg {...p}><rect x="2.5" y="6" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M16 15h2" /><path d="M5 6V5a2 2 0 0 1 2-2h9" /></Svg>;
const BarsIcon = (p: IconProps) => <Svg {...p}><path d="M5 20V11M12 20V4M19 20v-6" /></Svg>;
const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);
const SlidersIcon = (p: IconProps) => <Svg {...p}><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></Svg>;
const HelpIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1 1-1.1 1.7v.5M12 17h.01" /></Svg>;
const LogoutIcon = (p: IconProps) => <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></Svg>;
const ChevronRight = (p: IconProps) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>;
const ChevronDown = (p: IconProps) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>;
const ChevronLeft = (p: IconProps) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
const BellIcon = (p: IconProps) => <Svg {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Svg>;
const GlobeIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></Svg>;
const MenuIcon = (p: IconProps) => <Svg {...p}><path d="M3 6h18M3 12h18M3 18h18" /></Svg>;

const BrandLogo = ({ className }: IconProps) => {
  const { branding } = useBranding();
  if (branding.hasLogo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brandLogoSrc(branding)} alt={branding.appName} title={branding.appName} className={`rounded-md object-contain ${className ?? ''}`} />;
  }
  return (
  <div className={`flex items-center justify-center rounded-md ${className ?? ''}`} title={branding.appName}>
  <svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="auto" height="auto" x="0" y="0" viewBox="0 0 509.421 509.421" xmlSpace="preserve"><g><path d="M409.421 251.348V123.073c-35.366 0-64.139 28.772-64.139 64.138s28.773 64.137 64.139 64.137"  fill="#9bc9ff" data-original="#9bc9ff"></path><path d="M473.56 187.211c0-35.366-28.772-64.138-64.139-64.138v128.275c35.367 0 64.139-28.772 64.139-64.137"  fill="#57a4ff" data-original="#57a4ff"></path><path d="M509.421 366.348c0-55.14-44.859-100-100-100-28.619 0-55.206 12.071-73.879 32.602 26.098 21.11 43.814 52.191 47.288 87.398h126.591zM173.879 298.95c-18.673-20.53-45.26-32.602-73.879-32.602-55.14 0-100 44.86-100 100v20h126.59c3.475-35.207 21.191-66.288 47.289-87.398M100 251.348V123.073c-35.366 0-64.138 28.772-64.138 64.138S64.634 251.348 100 251.348"  fill="#9bc9ff" data-original="#9bc9ff"></path><path d="M164.138 187.211c0-35.366-28.772-64.138-64.138-64.138v128.275c35.366 0 64.138-28.772 64.138-64.137"  fill="#57a4ff" data-original="#57a4ff"></path><path d="M335.542 298.95c-22.114-17.888-50.242-28.619-80.832-28.619v148.76h128.75v-20c0-4.3-.216-8.55-.63-12.742-3.474-35.208-21.19-66.289-47.288-87.399M334.71 170.331c0-44.11-35.89-80-80-80v160c44.11 0 80-35.88 80-80"  fill="#003f8a" data-original="#003f8a"></path><path d="M173.879 298.95c-26.098 21.11-43.814 52.191-47.289 87.398-.414 4.193-.63 8.443-.63 12.742v20h128.75V270.33c-30.589.001-58.717 10.732-80.831 28.62M254.71 250.331v-160c-44.11 0-80 35.89-80 80 0 44.12 35.89 80 80 80"  fill="#005ece" data-original="#005ece"></path></g></svg></div>
  );
};

/* ------------------------------------------------------------------ navigation model */

interface NavChild {
  href: string;
  label: string;
}

interface NavEntry {
  key: string;
  label: string;
  icon: (p: IconProps) => React.JSX.Element;
  href?: string;
  children?: NavChild[];
  /** Module not built yet: shown (as in the mockup) but not clickable. */
  soon?: boolean;
  /** Show the expand chevron, as in the mockup. */
  chevron?: boolean;
}

const ROLE_LABEL: Record<number, string> = {
  [UserType.Executive]: 'Executive',
  [UserType.Manager]: 'Manager',
  [UserType.SystemAdmin]: 'System Admin',
  [UserType.HRAdmin]: 'HR Admin',
};

/** Pages that work without signing in. Every other page sends a signed-out visitor to /login. */
const PUBLIC_PATHS = ['/login', '/reset-password'];

/** DefaultIcon covers any menu item a System Admin adds without picking one of these classes. */
const DefaultIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="2" /><circle cx="5" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></Svg>;
const ICON_BY_CLASS: Record<string, (p: IconProps) => React.JSX.Element> = {
  'fa fa-home': HomeIcon,
  'fa fa-users': UsersIcon,
  'fa fa-clock-o': ClockIcon,
  'fa fa-calendar': CalendarIcon,
  'fa fa-cogs': GearIcon,
  'fa fa-sliders': SlidersIcon,
};

/**
 * The sidebar's main sections, built from what Menus & Rights (GET /rbac/my-menu) actually grants
 * this user — a group heading becomes an expandable entry, a leaf with a pageUrl becomes a link.
 * getMyMenu already drops any branch with nothing visible in it, so every node here has something to show.
 */
function buildEntries(nodes: MenuNode[]): NavEntry[] {
  return nodes.map((n) => {
    const icon = (n.iconClass && ICON_BY_CLASS[n.iconClass]) || DefaultIcon;
    if (n.pageUrl) return { key: `m${n.id}`, label: n.name, icon, href: n.pageUrl };
    const children: NavChild[] = n.children.filter((c) => c.pageUrl).map((c) => ({ href: c.pageUrl as string, label: c.name }));
    return { key: `m${n.id}`, label: n.name, icon, children };
  });
}

function initialsOf(name?: string | null) {
  if (!name) return '?';
  const parts = name.replace(/[._-]+/g, ' ').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name[0].toUpperCase();
}

/* ------------------------------------------------------------------ layout */

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const { branding } = useBranding();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState<MenuNode[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [profileOpen, setProfileOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notes, setNotes] = useState<NotificationItem[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  useEffect(() => {
    try { setSeenAt(Number(localStorage.getItem('hrms.notesSeen') || 0)); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    if (!isAuthenticated) return;
    const load = () => getNotifications().then((r) => setNotes(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [isAuthenticated]);
  const unread = notes.filter((n) => new Date(n.at).getTime() > seenAt).length;
  const openBell = () => {
    setBellOpen((v) => !v);
    const now = Date.now();
    setSeenAt(now);
    try { localStorage.setItem('hrms.notesSeen', String(now)); } catch { /* storage unavailable */ }
  };

  const mustChangePassword = !!user?.mustChangePassword;

  useEffect(() => {
    if (!isAuthenticated || mustChangePassword) return;
    getMyMenu()
      .then((res) => setMenu(res.data))
      .catch(() => setMenu([]));
  }, [isAuthenticated, mustChangePassword]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && mustChangePassword && router.pathname !== '/change-password') {
      router.replace('/change-password');
    }
  }, [isLoading, isAuthenticated, mustChangePassword, router]);

  // Remember the collapsed rail per browser (convenience only).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('hrms.sidebarCollapsed') === '1');
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem('hrms.sidebarCollapsed', v ? '0' : '1');
      } catch {
        /* storage unavailable */
      }
      return !v;
    });
  };


  // Close menus on navigation.
  useEffect(() => {
    const close = () => {
      setMobileOpen(false);
      setProfileOpen(false);
      setBellOpen(false);
    };
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events]);

  const publicPage = PUBLIC_PATHS.includes(router.pathname);
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !publicPage) router.replace('/login');
  }, [isLoading, isAuthenticated, publicPage, router]);

  if (isLoading || (!isAuthenticated && !publicPage)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) return <>{children}</>;

  const userType = user?.userTypeId as UserType | undefined;
  const roleLabel = (userType && ROLE_LABEL[userType]) || 'User';
  const displayName = user?.fullName || user?.username || 'User';

  // Everything below "My Profile" is exactly what Menus & Rights grants this user; no role is hardcoded here.
  const rbacEntries = buildEntries(menu);
  const dashboardIdx = rbacEntries.findIndex((e) => e.href === '/');
  const myProfileAt = dashboardIdx === -1 ? 0 : dashboardIdx + 1;
  const entries: NavEntry[] = [
    ...rbacEntries.slice(0, myProfileAt),
    // Not a menu item: it needs the viewer's own employee id, which a static pageUrl can't carry.
    ...(user?.employeeId ? [{ key: 'my-profile', label: 'My Profile', icon: IdIcon, href: `/employee-profile/${user.employeeId}` } as NavEntry] : []),
    ...rbacEntries.slice(myProfileAt),
    { key: 'payroll', label: 'Payroll', icon: WalletIcon, soon: true },
    { key: 'reports-soon', label: 'Reports', icon: BarsIcon, soon: true, chevron: true },
  ];

  const pathMatches = (href: string) =>
    href === '/' ? router.pathname === '/' : router.pathname === href || router.pathname.startsWith(`${href}/`) || router.asPath.startsWith(`${href}/`);
  const isEmployeeProfile = router.pathname.startsWith('/employee-profile');
  const entryActive = (e: NavEntry) =>
    (e.href && pathMatches(e.href)) || (e.children ?? []).some((c) => pathMatches(c.href)) || (isEmployeeProfile && (e.children ?? []).some((c) => c.href === '/employees'));
  const isOpen = (e: NavEntry) => open[e.key] ?? entryActive(e);

  const doLogout = () => logout().then(() => router.push('/login'));


  /* ---------------- sidebar row (link or disabled "soon" item) ---------------- */
  const rowBase = 'group relative flex h-10 items-center rounded-lg text-sm font-medium transition-colors';
  const rowPad = collapsed ? 'lg:justify-center lg:px-0 px-3 gap-3 lg:gap-0' : 'px-3 gap-3';

  const Tooltip = ({ label }: { label: string }) =>
    collapsed ? (
      <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 lg:block">
        {label}
      </span>
    ) : null;

  // Left accent bar; on the collapsed rail it becomes a short underline (mockup).
  const ActiveBar = () => (
    <span
      className={
        collapsed
          ? 'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-blue-500 lg:bottom-0 lg:left-3.5 lg:right-3.5 lg:top-auto lg:h-0.5 lg:w-auto lg:translate-y-0'
          : 'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-blue-500'
      }
    />
  );

  const renderEntry = (e: NavEntry) => {
    const Icon = e.icon;
    const active = !!entryActive(e);
    const label = <span className={`${collapsed ? 'lg:hidden' : ''} flex-1 truncate`}>{e.label}</span>;
    const iconEl = <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`} />;

    if (e.soon) {
      // Same look as the mockup, slightly dimmed; not clickable until the module exists.
      return (
        <div key={e.key} className={`${rowBase} ${rowPad} cursor-not-allowed text-slate-500`} title={`${e.label} — coming in a later phase`} aria-disabled="true">
          <Icon className="h-5 w-5 shrink-0 text-slate-600" />
          {label}
          {e.chevron && <ChevronRight className={`${collapsed ? 'lg:hidden' : ''} h-4 w-4 shrink-0 text-slate-600`} />}
          <Tooltip label={`${e.label} (coming soon)`} />
        </div>
      );
    }

    if (e.href) {
      return (
        <Link key={e.key} href={e.href} className={`${rowBase} ${rowPad} ${active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'}`} aria-current={active ? 'page' : undefined}>
            {active && <ActiveBar />}
            {iconEl}
            {label}
            <Tooltip label={e.label} />
        </Link>
      );
    }

    const expanded = isOpen(e) && !collapsed;
    return (
      <div key={e.key}>
        <button
          type="button"
          onClick={() => {
            if (collapsed) {
              toggleCollapsed();
              setOpen((o) => ({ ...o, [e.key]: true }));
            } else {
              setOpen((o) => ({ ...o, [e.key]: !isOpen(e) }));
            }
          }}
          className={`${rowBase} ${rowPad} w-full text-left ${active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'}`}
          aria-expanded={expanded}
        >
          {active && <ActiveBar />}
          {iconEl}
          {label}
          <ChevronRight className={`${collapsed ? 'lg:hidden' : ''} h-4 w-4 shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          <Tooltip label={e.label} />
        </button>
        {expanded && (
          <div className="mt-1 space-y-0.5 pl-11">
            {(e.children ?? []).map((c) => {
              const childActive = pathMatches(c.href) || (c.href === '/employees' && isEmployeeProfile);
              return (
                <Link key={c.href} href={c.href} className={`block rounded-md px-3 py-1.5 text-sm ${childActive ? 'bg-slate-800/70 font-medium text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
                    {c.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const BottomLink = ({ icon: Icon, label, href, soon, onClick }: { icon: (p: IconProps) => React.JSX.Element; label: string; href?: string; soon?: boolean; onClick?: () => void }) => {
    const inner = (
      <>
        <Icon className={`h-5 w-5 shrink-0 ${soon ? 'text-slate-600' : 'text-slate-500 group-hover:text-slate-300'}`} />
        <span className={`${collapsed ? 'lg:hidden' : ''} flex-1 truncate`}>{label}</span>
        <Tooltip label={label} />
      </>
    );
    const cls = `${rowBase} ${rowPad} w-full text-left ${soon ? 'cursor-not-allowed text-slate-500' : pathMatches(href ?? '#') ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'}`;
    if (href && !soon) {
      return (
        <Link href={href} className={cls}>
          {inner}
        </Link>
      );
    }
    return (
      <button type="button" className={cls} onClick={onClick} disabled={soon} title={soon ? `${label} — available in a later phase` : undefined}>
        {inner}
      </button>
    );
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {mobileOpen && <div className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* ============ SIDEBAR ============ */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-visible bg-slate-900 px-3 pb-4 pt-5 text-white shadow-xl transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-20 lg:px-2.5' : 'lg:w-64'}`}
        aria-label="Main navigation"
      >
        {/* Decorative waves behind the sidebar content */}
        <svg className="pointer-events-none absolute bottom-0 left-0 h-[55%] w-full opacity-50" viewBox="0 0 282 520" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 120 C70 60 150 90 282 30 L282 520 L0 520 Z" fill="#1e293b" opacity=".85" />
          <path d="M0 210 C90 150 170 190 282 140 L282 520 L0 520 Z" fill="#172036" opacity=".6" />
          <circle cx="250" cy="420" r="120" fill="#c9d9ff" opacity=".06" />
        </svg>

        {/* Brand + collapse */}
        <div className={`relative z-10 flex items-center gap-2.5 px-2 pb-6 ${collapsed ? 'lg:flex-col lg:gap-3 lg:px-0 lg:pb-5' : ''}`}>
          <BrandLogo className={`h-[40px] w-[42px] shrink-0 ${collapsed ? 'lg:h-[30px] lg:w-[34px]' : ''}`} />
          <div className={`${collapsed ? 'lg:hidden' : ''} min-w-0`}>
            <p className="text-xl font-bold leading-none tracking-tight text-white">{branding.appName}</p>
            <p className="mt-1 whitespace-nowrap text-[11px] text-slate-400">Smart HR. Better Tomorrow.</p>
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`ml-auto hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 transition-colors hover:border-blue-600 hover:bg-blue-600 hover:text-white lg:flex ${collapsed ? 'lg:ml-0' : ''}`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft className={`h-3.5 w-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Main navigation */}
        {/* Scrolls when expanded; on the collapsed rail it must not clip the hover labels. */}
        <nav className={`relative z-10 flex-1 space-y-1 overflow-y-auto ${collapsed ? 'lg:overflow-visible' : ''}`}>{entries.map(renderEntry)}</nav>

        {/* Bottom: help, settings, user, logout */}
        <div className="relative z-10 mt-auto space-y-1">
          <div className="mx-1 my-3 h-px bg-slate-800" />
          <BottomLink icon={HelpIcon} label="Help & Support" soon />
          <BottomLink icon={GearIcon} label="Settings" href="/account" />
          <Link href="/account" className={`group relative mt-2.5 flex items-center gap-2.5 border-t border-slate-800 px-1 pt-3.5 ${collapsed ? 'lg:justify-center lg:border-0 lg:px-0 lg:pt-2' : ''}`}>
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-[13px] font-bold text-white ring-1 ring-slate-600">
                {initialsOf(displayName)}
              </span>
              <span className={`${collapsed ? 'lg:hidden' : ''} min-w-0 flex-1`}>
                <span className="block truncate text-[13px] font-semibold text-white">{displayName}</span>
                <span className="block truncate text-xs text-slate-400">{roleLabel}</span>
              </span>
              <ChevronDown className={`${collapsed ? 'lg:hidden' : ''} h-4 w-4 text-slate-400`} />
              <Tooltip label="My account" />
          </Link>
          <div className="pt-1.5">
            <BottomLink icon={LogoutIcon} label="Logout" onClick={doLogout} />
          </div>
        </div>
      </aside>

      {/* ============ MAIN ============ */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-7 lg:pt-6">
          {/* Top bar */}
          <header className="mb-5 flex h-14 items-center gap-3 lg:gap-4">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-gray-300 bg-white p-2 text-gray-600 shadow-sm hover:bg-gray-50 lg:hidden"
              aria-label="Open menu"
            >
              <MenuIcon className="h-5 w-5" />
            </button>

            <div className="ml-auto flex items-center gap-3 text-sm font-medium text-gray-700 lg:gap-[18px]">
              {/* Branch */}
              <BranchSwitcher />

              {/* Notifications */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { openBell(); setProfileOpen(false); }}
                  className="relative flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 shadow-sm hover:bg-gray-50"
                  aria-label="Notifications"
                  aria-expanded={bellOpen}
                >
                  <BellIcon className="h-[18px] w-[18px]" />
                  {unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
                </button>
                {bellOpen && (
                  <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-gray-200 bg-white text-sm shadow-lg">
                    <p className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-900">Notifications</p>
                    {notes.length === 0 ? (
                      <p className="px-4 py-4 text-gray-500">You are all caught up.</p>
                    ) : (
                      <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
                        {notes.map((n) => (
                          <li key={n.id}>
                            <Link href={n.href} onClick={() => setBellOpen(false)} className="block px-4 py-3 hover:bg-gray-50">
                              <p className="font-medium text-gray-900">{n.title}</p>
                              <p className="mt-0.5 text-xs text-gray-500">{n.detail}</p>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Language */}
              <div className="hidden items-center gap-1.5 sm:flex" title="Language">
                <GlobeIcon className="h-[18px] w-[18px] text-gray-500" />
                EN
                <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
              </div>

              {/* Profile */}
              <div className="relative border-l border-gray-200 pl-3 lg:pl-[18px]">
                <button
                  type="button"
                  onClick={() => { setProfileOpen((v) => !v); setBellOpen(false); }}
                  className="flex items-center gap-2.5 rounded-lg text-left"
                  aria-expanded={profileOpen}
                  aria-label="Account menu"
                >
                  <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-[13px] font-bold text-white">
                    {initialsOf(displayName)}
                  </span>
                  <span className="hidden md:block">
                    <span className="block text-sm font-semibold text-gray-900">{displayName}</span>
                    <span className="block text-xs font-normal text-gray-500">{roleLabel}</span>
                  </span>
                  <ChevronDown className="hidden h-3.5 w-3.5 text-gray-500 md:block" />
                </button>
                {profileOpen && (
                  <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-lg">
                    <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">My account</Link>
                    <Link href="/change-password"className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Change password</Link>
                    <button type="button" onClick={doLogout} className="block w-full px-4 py-2 text-left text-red-600 hover:bg-red-50">Logout</button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {children}
        </main>
        {branding.footerText && (
          <footer className="px-4 pb-6 text-center text-xs text-gray-400 sm:px-6 lg:px-7">{branding.footerText}</footer>
        )}
      </div>
    </div>
  );
}
