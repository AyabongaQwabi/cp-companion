import Link from 'next/link';
import { CalendarSearch, Home, LifeBuoy } from 'lucide-react';
import { LinkButton } from '@/components/ui/Button';
import { SITE_NAME } from '@/lib/seo';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full bg-gradient-to-b from-red-50 to-white border border-gold-400/30 shadow-premium"
            aria-hidden="true"
          />
          <CalendarSearch className="relative h-9 w-9 text-red-500" aria-hidden="true" />
        </div>

        <p className="text-sm font-semibold tracking-wide text-gold-700 mb-2">404</p>
        <h1 className="text-2xl font-semibold text-gray-900 mb-3">
          This page didn&apos;t make the appointment
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-8">
          The page you&apos;re looking for doesn&apos;t exist or may have moved. Double-check the
          link, or head back to somewhere familiar.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <LinkButton href="/" variant="primary" className="w-full sm:w-auto">
            <Home className="h-4 w-4" aria-hidden="true" />
            Back to dashboard
          </LinkButton>
          <LinkButton href="/appointments" variant="secondary" className="w-full sm:w-auto">
            <CalendarSearch className="h-4 w-4" aria-hidden="true" />
            View appointments
          </LinkButton>
        </div>

        <p className="mt-10 text-xs text-gray-400">
          Still stuck?{' '}
          <Link
            href="/resources"
            className="inline-flex items-center gap-1 text-red-500 hover:text-red-600 transition-colors font-medium"
          >
            <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
            Visit {SITE_NAME} resources
          </Link>
        </p>
      </div>
    </main>
  );
}
