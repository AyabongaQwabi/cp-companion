'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Banknote,
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  KeyRound,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  User,
  UsersRound,
  X,
} from 'lucide-react';
import { SITE_NAME } from '@/lib/seo';
import { clearSession, type Session } from '@/lib/session';
import { subscribeToCreditBalance } from '@/lib/credit-balance-events';
import { LinkButton } from '@/components/ui/Button';

interface NavBarProps {
  session: Session;
}

const LINKS = [
  { href: '/roster', label: 'Roster', icon: ClipboardList },
  { href: '/roster/groups', label: 'Employee Groups', icon: UsersRound },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/appointments', label: 'Appointments', icon: CalendarDays },
  { href: '/availability', label: 'Availability', icon: Activity },
  { href: '/compliance', label: 'Compliance', icon: ShieldCheck },
  { href: '/insights', label: 'Insights', icon: CircleDollarSign },
  { href: '/finances', label: 'Finances', icon: Banknote },
];

function initials(name: string, surname: string) {
  return `${name?.[0] ?? ''}${surname?.[0] ?? ''}`.toUpperCase() || '?';
}

export default function NavBar({ session }: NavBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [balance, setBalance] = useState<number | null>(session.creditBalance ?? null);
  const [dueRecurringCount, setDueRecurringCount] = useState(0);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('clinicplus-companion:sidebar-collapsed') === 'true';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // The bar's rendered height varies per page (title/subtitle text can wrap) and with the mobile
  // menu open, so the spacer below it is measured rather than a guessed constant — keeps page
  // content starting exactly where the fixed bar ends instead of sliding under or leaving a gap.
  const [barHeight, setBarHeight] = useState(0);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--dashboard-sidebar-offset',
      sidebarCollapsed ? '6rem' : '17.5rem'
    );
    localStorage.setItem('clinicplus-companion:sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const refreshBalance = () => {
      fetch(`/api/wallet?userId=${encodeURIComponent(session.id)}`)
      .then((r) => r.json())
      .then((d) => setBalance(d.balance))
      .catch(() => {});
    };

    refreshBalance();
    const unsubscribe = subscribeToCreditBalance(session.id, setBalance);
    const interval = window.setInterval(refreshBalance, 10000);
    window.addEventListener('focus', refreshBalance);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshBalance);
    };
  }, [session.id]);

  useEffect(() => {
    fetch(`/api/recurring-flags?userId=${encodeURIComponent(session.id)}&dueOnly=1`)
      .then((r) => r.json())
      .then((d) => setDueRecurringCount(Array.isArray(d) ? d.length : 0))
      .catch(() => {});
  }, [session.id]);

  useEffect(() => {
    // UX-only check so the admin link only shows for superadmins — the real gate is server-side
    // on every /api/service-validity-periods call regardless of what this returns.
    fetch(`/api/auth/role?userId=${encodeURIComponent(session.id)}`)
      .then((r) => r.json())
      .then((d) => setIsSuperadmin(!!d.superadmin))
      .catch(() => {});
  }, [session.id]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!profileOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [profileOpen]);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const update = () => setBarHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [mobileOpen]);

  const logOut = () => {
    clearSession();
    router.push('/login');
  };

  const visibleLinks = isSuperadmin
    ? [...LINKS, { href: '/admin/service-validity', label: 'Admin: Service Validity', icon: KeyRound }]
    : LINKS;

  return (
    <>
      <span className="dashboard-nav-anchor" aria-hidden="true" />
      {/* Fixed at the true viewport top regardless of the page's own padding/max-width — the
          spacer div below reserves the equivalent height in normal flow so page content starts
          right after it instead of sliding underneath. */}
      <div
        ref={barRef}
        className={`fixed top-0 left-0 right-0 z-40 px-3 sm:px-5 py-3 bg-white/82 backdrop-blur-xl transition-shadow duration-200 motion-reduce:transition-none ${
          scrolled ? 'shadow-[0_12px_35px_rgba(15,23,42,0.08)] border-b border-gray-200/80' : 'border-b border-white/60'
        }`}
      >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/roster"
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-card bg-white shadow-md shadow-red-500/10 ring-1 ring-gray-200"
            aria-label={SITE_NAME}
          >
            <Image
              src="/logo-square.png"
              alt=""
              width={1254}
              height={1254}
              priority
              className="h-full w-full object-cover"
            />
          </Link>
          <div className="min-w-0">
            <Link href="/roster" className="block truncate text-base font-semibold text-gray-950 tracking-tight">
              {SITE_NAME}
            </Link>
            <p className="truncate text-xs text-gray-500">{session.name} {session.surname}</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2">
          {dueRecurringCount > 0 && (
            <Link
              href="/roster"
              className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-800 shadow-sm hover:shadow-premium transition-shadow motion-reduce:transition-none"
              title="Employees due for a repeat booking"
            >
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              {dueRecurringCount}
            </Link>
          )}
          <Link
            href="/finances"
            className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-gold-400/50 bg-gradient-to-b from-white to-gold-50/70 px-3 text-xs font-medium text-gray-900 shadow-sm hover:shadow-premium transition-shadow motion-reduce:transition-none"
            aria-live="polite"
          >
            <Banknote className="h-3.5 w-3.5 text-gold-700" aria-hidden="true" />
            <motion.span
              key={balance ?? 'unknown'}
              initial={{ y: -4, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="font-semibold tabular-nums"
            >
              {balance ?? '—'}
            </motion.span>
            credits
          </Link>
          <LinkButton href="/book" variant="primary" className="h-9 text-xs px-4 py-0 shadow-red-500/20">
            <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Book appointment
          </LinkButton>

          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((v) => !v)}
              aria-label="Account menu"
              aria-expanded={profileOpen}
              className="flex h-9 w-9 items-center justify-center rounded-pill border border-red-100 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100 hover:shadow-premium transition-all motion-reduce:transition-none"
            >
              {initials(session.name, session.surname)}
            </button>

            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 mt-2 w-56 rounded-card border border-gray-200 bg-white/95 shadow-lg shadow-gray-900/10 backdrop-blur py-1 z-50"
                >
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {session.name} {session.surname}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{session.email}</p>
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <User className="h-3.5 w-3.5" aria-hidden="true" />
                    Profile
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                    Settings
                  </Link>
                  <button
                    onClick={logOut}
                    className="flex w-full items-center gap-2 text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    Log out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <button
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-card border border-gray-200 bg-white text-gray-800 shadow-sm"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      <aside
        className={`hidden lg:flex fixed left-4 top-[5.5rem] bottom-4 z-30 flex-col rounded-card shadow-lg shadow-gray-900/5 backdrop-blur-xl transition-[width] duration-200 motion-reduce:transition-none ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
        aria-label="Main navigation"
      >
        <div
          className={`mb-4 flex items-center ${
            sidebarCollapsed ? 'justify-center' : 'justify-between gap-3'
          }`}
        >
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium uppercase leading-4 text-gray-400">
                  Main menu
                </p>
                <p className="truncate text-sm font-semibold leading-5 text-gray-900">Dashboard</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card text-gray-500 transition-colors hover:bg-gray-50 hover:text-red-600"
            aria-label={sidebarCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {visibleLinks.map((l) => {
            const Icon = l.icon;
            const isActive = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <motion.div key={l.href} whileHover={{ x: sidebarCollapsed ? 0 : 2 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href={l.href}
                  title={sidebarCollapsed ? l.label : undefined}
                  className={`group flex h-10 items-center rounded-card text-sm font-medium transition-colors ${
                    sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3'
                  } ${
                    isActive
                      ? 'bg-red-50 text-red-700 shadow-sm ring-1 ring-red-100'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? 'text-red-600' : 'text-gray-400 group-hover:text-red-500'
                    }`}
                    aria-hidden="true"
                  />
                  {!sidebarCollapsed && <span className="truncate">{l.label}</span>}
                </Link>
              </motion.div>
            );
          })}
        </nav>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="md:hidden overflow-hidden"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-2 pt-4 pb-2">
              <Link
                href="/finances"
                className="inline-flex items-center gap-1.5 rounded-card border border-gold-400/50 bg-gold-50/60 px-3 py-2 text-sm text-gray-900"
                onClick={() => setMobileOpen(false)}
                aria-live="polite"
              >
                <Banknote className="h-3.5 w-3.5 text-gold-700" aria-hidden="true" />
                <span className="font-semibold tabular-nums">{balance ?? '—'}</span> credits
              </Link>
              {visibleLinks.map((l) => {
                const isActive = pathname === l.href || pathname.startsWith(`${l.href}/`);
                const Icon = l.icon;
                return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className={`inline-flex items-center gap-2 rounded-card px-3 py-2 text-sm ${
                    isActive ? 'bg-red-50 text-red-700' : 'text-gray-600'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {l.label}
                </Link>
                );
              })}
              <LinkButton href="/book" variant="primary" className="mt-1 text-sm px-3 py-2" onClick={() => setMobileOpen(false)}>
                <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Book appointment
              </LinkButton>
              <div className="border-t border-gray-200 pt-3 flex flex-col gap-3">
                <p className="text-xs text-gray-400">{session.name} {session.surname} · {session.email}</p>
                <Link href="/profile" onClick={() => setMobileOpen(false)} className="inline-flex items-center gap-2 text-sm text-gray-600">
                  <User className="h-3.5 w-3.5" aria-hidden="true" />
                  Profile
                </Link>
                <Link href="/settings" onClick={() => setMobileOpen(false)} className="inline-flex items-center gap-2 text-sm text-gray-600">
                  <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                  Settings
                </Link>
                <button onClick={logOut} className="inline-flex items-center gap-2 text-sm text-red-600 text-left">
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  Log out
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      {/* Reserves the fixed bar's height in normal document flow so page content isn't hidden
          underneath it — the page itself scrolls normally, the bar stays pinned. */}
      <div style={{ height: barHeight }} />
    </>
  );
}
