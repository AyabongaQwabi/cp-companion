'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ArrowRight, ClipboardList, LineChart, Timer } from 'lucide-react';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import Footer from '@/components/Footer';
import { getSession, type Session } from '@/lib/session';

const FEATURES = [
  {
    icon: ClipboardList,
    title: 'Build once, reuse every time',
    body: 'Import employees straight from your past appointments, or add them once — occupation, sites, and job spec files all save to their profile.',
    href: '/features/roster',
  },
  {
    icon: Timer,
    title: 'Book in minutes, not hours',
    body: 'Select people by occupation or group, apply services to everyone at once, and submit — the appointment lands in ClinicPlus exactly like one booked directly.',
    href: '/features/bulk-booking',
  },
  {
    icon: LineChart,
    title: "See what you're actually spending",
    body: 'Insights shows your own appointment history, financials, and most-booked services — scoped to your company, exportable whenever you need it.',
    href: '/features/insights',
  },
];

const STATS = [
  { value: '2 clinics', label: 'Hendrina & Churchill' },
  { value: 'Minutes', label: 'To book a full crew' },
  { value: '1 login', label: 'Your existing ClinicPlus account' },
];

const HERO_MESSAGES = [
  {
    title: (
      <>
        Stop <span className="text-gold-300">retyping</span> the same 100 employees every booking
      </>
    ),
    description:
      'ClinicPlus Companion is a saved employee roster for companies that book medicals through ClinicPlus. Pick people from your roster instead of typing them out from scratch, and get a real appointment created in ClinicPlus in minutes.',
  },
  {
    title: (
      <>
        Built for <span className="text-gold-300">power users</span> who book at scale
      </>
    ),
    description:
      'Reuse employee records, group crews by occupation or site, apply services in bulk, and move from a blank booking to a complete appointment without the repetitive admin.',
  },
  {
    title: (
      <>
        Turn repeat bookings into a <span className="text-gold-300">workflow</span>
      </>
    ),
    description:
      'Keep your roster, job specs, booking history, and spend insights together so the next medical run starts with useful data instead of an empty form.',
  },
];

export default function HomeClient() {
  // getSession() reads localStorage synchronously; the lazy initializer runs once on mount and
  // is null during SSR, matching every other page's auth-guard pattern. This page never
  // redirects a logged-in user away — they can visit the home page on purpose, and get a link
  // back to the dashboard instead of being shown the "Log in" prompt.
  const [session] = useState<Session | null>(() => getSession());
  const [heroIndex, setHeroIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const interval = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % HERO_MESSAGES.length);
    }, 5500);
    return () => window.clearInterval(interval);
  }, [prefersReducedMotion]);

  const heroMessage = HERO_MESSAGES[heroIndex];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-background/80 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center" aria-label="ClinicPlus Companion home">
          <Image
            src="/logo-wide.png"
            alt="ClinicPlus Companion"
            width={1942}
            height={809}
            priority
            className="h-10 w-auto"
          />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/features" className="text-gray-700 hover:text-gray-900 transition-colors hidden sm:inline">
            Features
          </Link>
          <Link href="/solutions" className="text-gray-700 hover:text-gray-900 transition-colors hidden sm:inline">
            Solutions
          </Link>
          {session ? (
            <Link href="/roster" className="text-gray-700 hover:text-gray-900 transition-colors">
              Go to dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-pill border border-gold-400/40 bg-gradient-to-b from-red-500 to-red-600 px-4 py-2 font-medium text-white shadow-md shadow-red-500/15 transition-[transform,box-shadow] duration-150 hover:scale-[1.02] hover:shadow-premium active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              Log in
            </Link>
          )}
        </nav>
      </header>

      <main className="flex-1 w-full">
        <section className="relative min-h-[calc(100vh-4.5rem)] overflow-hidden">
          <Image
            src="/hero.jpg"
            alt="ClinicPlus Companion dashboard preview"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-gray-950/80 via-gray-950/45 to-transparent" />
          <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-5xl flex-col justify-center px-6 py-20">
            <FadeIn>
              <div className="min-h-[13.5rem] sm:min-h-[12rem]" aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={heroIndex}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? undefined : { opacity: 0, y: -14 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  >
                    <h1 className="max-w-2xl text-4xl sm:text-5xl font-semibold mb-4 leading-tight tracking-tight text-white">
                      {heroMessage.title}
                    </h1>
                    <p className="max-w-2xl text-white/80 text-lg leading-relaxed">
                      {heroMessage.description}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </FadeIn>

            <FadeIn delay={0.16}>
              <div className="flex flex-wrap gap-3 mt-8">
                {session ? (
                  <LinkButton href="/roster" variant="primary">
                    Go to dashboard
                  </LinkButton>
                ) : (
                  <LinkButton href="/login" variant="primary">
                    Log in with your ClinicPlus account
                  </LinkButton>
                )}
                <LinkButton href="/finances" variant="secondary" className="bg-white/95">
                  See pricing
                </LinkButton>
              </div>
            </FadeIn>
          </div>
        </section>

        <FadeIn onScroll>
          <div className="max-w-4xl mx-auto px-6 mt-14 grid grid-cols-3 divide-x divide-gray-200 border border-gray-200 rounded-card bg-white/60">
            {STATS.map((s) => (
              <div key={s.label} className="px-4 py-5 text-center">
                <p className="text-lg sm:text-xl font-semibold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </FadeIn>

        <div className="max-w-5xl mx-auto px-6 mt-20">
          <FadeIn onScroll>
            <p className="text-xs font-semibold tracking-wide text-gold-700 uppercase mb-2 text-center">
              Why teams switch
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 text-center mb-12">
              Everything you need to book bulk medicals fast
            </h2>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <FadeIn key={f.title} onScroll delay={i * 0.08}>
                <Link
                  href={f.href}
                  className="group flex h-full flex-col rounded-card border border-gray-200 bg-white p-6 shadow-sm transition-[box-shadow,transform,border-color] duration-200 hover:shadow-md hover:border-gold-400/40 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-card bg-red-50 border border-gold-400/20">
                    <f.icon className="h-5 w-5 text-red-500" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2 group-hover:text-red-500 transition-colors">
                    {f.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed flex-1">{f.body}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-red-500 group-hover:gap-1.5 transition-[gap]">
                    Learn more
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </Link>
              </FadeIn>
            ))}
          </div>
        </div>

        <FadeIn onScroll delay={0.1}>
          <div className="mx-auto mt-20 max-w-4xl px-6">
            <div className="relative overflow-hidden rounded-card border border-gold-400/30 bg-gradient-to-b from-gray-900 to-gray-950 px-8 py-10 sm:px-12 sm:py-12 text-center">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400/70 to-transparent" />
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2">
                Built for mining and industrial employers
              </h2>
              <p className="text-white/70 leading-relaxed mb-6 max-w-2xl mx-auto">
                Mine medicals, general mine induction, and exit medicals make up most of what
                Companion books in bulk. See how it fits your operation on{' '}
                <Link href="/solutions" className="text-gold-300 hover:text-gold-200 underline transition-colors">
                  Solutions
                </Link>
                , or read the{' '}
                <Link href="/resources/guides/bulk-booking-occupational-health" className="text-gold-300 hover:text-gold-200 underline transition-colors">
                  bulk booking guide
                </Link>
                .
              </p>
              {!session && (
                <LinkButton href="/login" variant="primary">
                  Log in with your ClinicPlus account
                </LinkButton>
              )}
            </div>
          </div>
        </FadeIn>

        {!session && (
          <p className="mx-auto max-w-3xl px-6 mt-10 text-xs text-gray-400 text-center">
            You&apos;ll need an existing ClinicPlus account to use Companion — it reuses your
            ClinicPlus login, so there&apos;s nothing new to sign up for.
          </p>
        )}
      </main>

      <Footer />
    </div>
  );
}
