import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  CalendarClock,
  ChevronDown,
  FileText,
  Home,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Moon,
  PiggyBank,
  Receipt,
  Repeat,
  Settings as SettingsIcon,
  Sun,
  Target,
  TrendingUp,
  User as UserIcon,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { get } from '@/lib/api';
import { Badge, FullPageSpinner, cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/family', label: 'Family', icon: Users },
  { to: '/income', label: 'Income', icon: TrendingUp },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/budgets', label: 'Budgets', icon: Wallet },
  { to: '/savings', label: 'Savings Goals', icon: Target },
  { to: '/recurring', label: 'Recurring Payments', icon: Repeat },
  { to: '/payments', label: 'Pending Payments', icon: CalendarClock },
  { to: '/transactions', label: 'Transactions', icon: ListOrdered },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/profile', label: 'Profile', icon: UserIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

const FAMILY_FREE = ['/family', '/profile', '/settings'];

/** Redirects to /login when signed out and to /family when the user has no family yet. */
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!user.familyId && !FAMILY_FREE.includes(location.pathname)) return <Navigate to="/family" replace />;
  return <AppLayout />;
}

function Brand() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 px-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
        <PiggyBank className="h-5 w-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-bold">Smart Family</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">Budget Planner</span>
      </span>
    </Link>
  );
}

function SidebarNav({ onNavigate, locked }: { onNavigate?: () => void; locked: boolean }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      {NAV.map(({ to, label, icon: Icon }) => {
        const disabled = locked && !FAMILY_FREE.includes(to);
        return (
          <NavLink
            key={to}
            to={disabled ? '/family' : to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                isActive && !disabled
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                disabled && 'opacity-50',
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useSettings();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const title = NAV.find((n) => n.to === location.pathname)?.label ?? 'Smart Family Budget';

  useEffect(() => {
    if (!user?.familyId) return;
    let alive = true;
    const load = () =>
      get<{ unreadCount: number }>('/notifications', { limit: 1, unread: 'true' })
        .then((r) => alive && setUnread(r.unreadCount))
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener('sfb:notifications-changed', load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('sfb:notifications-changed', load);
    };
  }, [user?.familyId, location.pathname]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
      <button onClick={onMenu} className="btn-ghost -ml-2 p-2 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <h2 className="truncate text-base font-semibold lg:text-lg">{title}</h2>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {user?.family && (
          <span className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300 md:inline-flex">
            <Home className="h-3.5 w-3.5" />
            {user.family.name}
          </span>
        )}
        <button onClick={toggleTheme} className="btn-ghost p-2" aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <Link to="/notifications" className="btn-ghost relative p-2" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" aria-haspopup="menu" aria-expanded={menuOpen}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">{user?.name.charAt(0).toUpperCase()}</span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block max-w-[9rem] truncate text-sm font-medium">{user?.name}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{user?.role === 'ADMIN' ? 'Admin' : 'Member'}</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <div className="px-3 py-2">
                <p className="truncate text-sm font-medium">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
                <div className="mt-1.5">
                  <Badge tone={user?.role === 'ADMIN' ? 'indigo' : 'slate'}>{user?.role === 'ADMIN' ? 'Admin' : 'Member'}</Badge>
                </div>
              </div>
              <Link role="menuitem" to="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                <UserIcon className="h-4 w-4" /> Profile
              </Link>
              <Link role="menuitem" to="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                <SettingsIcon className="h-4 w-4" /> Settings
              </Link>
              <button role="menuitem" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function AppLayout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const locked = !user?.familyId;

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <div className="flex h-16 items-center border-b border-slate-200 dark:border-slate-800">
          <Brand />
        </div>
        <SidebarNav locked={locked} />
        <div className="border-t border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">Plan together. Spend wisely. Stay debt-free.</div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-900">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 pr-3 dark:border-slate-800">
              <Brand />
              <button onClick={() => setOpen(false)} className="btn-ghost p-2" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav locked={locked} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
