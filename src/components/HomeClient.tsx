'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import Footer from '@/components/Footer';
import { getSession, type Session } from '@/lib/session';

const FEATURES = [
  {
    title: 'Build once, reuse every time',
    body: 'Import employees straight from your past appointments, or add them once — occupation, sites, and job spec files all save to their profile.',
    href: '/features/roster',
  },
  {
    title: 'Book in minutes, not hours',
    body: 'Select people by occupation or group, apply services to everyone at once, and submit — the appointment lands in ClinicPlus exactly like one booked directly.',
    href: '/features/bulk-booking',
  },
  {
    title: "See what you're actually spending",
    body: 'Insights shows your own appointment history, financials, and most-booked services — scoped to your company, exportable whenever you need it.',
    href: '/features/insights',
  },
];

export default function HomeClient() {
  // getSession() reads localStorage synchronously; the lazy initializer runs once on mount and
  // is null during SSR, matching every other page's auth-guard pattern. This page never
  // redirects a logged-in user away — they can visit the home page on purpose, and get a link
  // back to the dashboard instead of being shown the "Log in" prompt.
  const [session] = useState<Session | null>(() => getSession());

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
              <h1 className="max-w-2xl text-4xl sm:text-5xl font-semibold mb-4 leading-tight tracking-tight text-white">
                Stop <span className="text-gold-300">retyping</span> the same 100 employees every
                booking
              </h1>
            </FadeIn>

            <FadeIn delay={0.08}>
              <p className="max-w-2xl text-white/80 mb-8 text-lg leading-relaxed">
                ClinicPlus Companion is a saved employee roster for companies that book medicals through
                ClinicPlus. Pick people from your roster instead of typing them out from scratch, and
                get a real appointment created in ClinicPlus in minutes.
              </p>
            </FadeIn>

            <FadeIn delay={0.16}>
              <div className="flex flex-wrap gap-3">
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

        <div className="max-w-3xl mx-auto px-6 mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 text-sm">
          {FEATURES.map((f) => (
            <FadeIn key={f.title} onScroll>
              <h2 className="font-semibold mb-1 text-gray-900">
                <Link href={f.href} className="hover:text-red-500 transition-colors">
                  {f.title}
                </Link>
              </h2>
              <p className="text-gray-500 leading-relaxed">{f.body}</p>
            </FadeIn>
          ))}
        </div>

        <FadeIn onScroll delay={0.1}>
          <div className="mx-auto mt-16 max-w-3xl border-t border-gray-200 px-6 pt-10">
            <h2 className="font-semibold text-gray-900 mb-2">Built for mining and industrial employers</h2>
            <p className="text-gray-500 leading-relaxed mb-4">
              Mine medicals, general mine induction, and exit medicals make up most of what
              Companion books in bulk. See how it fits your operation on{' '}
              <Link href="/solutions" className="text-red-500 hover:text-red-600 underline transition-colors">
                Solutions
              </Link>
              , or read the{' '}
              <Link href="/resources/guides/bulk-booking-occupational-health" className="text-red-500 hover:text-red-600 underline transition-colors">
                bulk booking guide
              </Link>
              .
            </p>
          </div>
        </FadeIn>

        {!session && (
          <p className="mx-auto max-w-3xl px-6 mt-16 text-xs text-gray-400">
            You&apos;ll need an existing ClinicPlus account to use Companion — it reuses your
            ClinicPlus login, so there&apos;s nothing new to sign up for.
          </p>
        )}
      </main>

      <Footer />
    </div>
  );
}
