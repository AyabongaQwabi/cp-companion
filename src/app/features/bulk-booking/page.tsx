import type { Metadata } from 'next';
import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Bulk Appointment Booking',
  description:
    'Book occupational medicals for many employees in one appointment — select people from your roster, apply services across all of them, and submit to ClinicPlus.',
  alternates: {
    canonical: absoluteUrl('/features/bulk-booking'),
  },
};

export default function BulkBookingFeaturePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <FadeIn>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight mb-4">
            Bulk appointment booking
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-10">
            Booking medicals for a group of employees one at a time is slow and repetitive.
            Companion lets you select many employees at once, apply the same services across all
            of them, and submit a single appointment that ClinicPlus receives exactly as if it had
            been booked directly.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">How a booking is built</h2>
          <Card className="p-6 mb-10">
            <ol className="space-y-2 text-sm text-gray-700 leading-relaxed list-decimal list-inside">
              <li>Pick employees from your roster, individually or by group</li>
              <li>Apply services in bulk &mdash; mine medicals, drug or health screening, exit medicals &mdash; or adjust per employee</li>
              <li>Choose a clinic (Hendrina or Churchill) and a date</li>
              <li>Review the price and confirm</li>
              <li>The appointment is created in ClinicPlus&apos;s booking system</li>
            </ol>
          </Card>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Service catalog</h2>
          <p className="text-gray-500 leading-relaxed mb-4">
            The same medical services available in ClinicPlus are available here: mine medicals
            with or without general mine induction, medicals for Black Wattle and Atoll, medicals
            for power stations, construction, and other industries, 6-in-1 and cannabis drug
            testing, pregnancy and sugar screening, HIV testing, clearance, full and short exit
            medicals, and the COVID-19 questionnaire.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Booking dates and limits</h2>
          <p className="text-gray-500 leading-relaxed mb-4">
            Appointments can&apos;t be booked on weekends or South African public holidays, and
            each clinic has a daily appointment limit. Companion checks both before the booking is
            submitted, so you find out immediately if a date doesn&apos;t work rather than after
            arriving at the clinic.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Clinics</h2>
          <p className="text-gray-500 leading-relaxed mb-10">
            Appointments can currently be booked at ClinicPlus&apos;s Hendrina and Churchill
            clinics.
          </p>
        </FadeIn>

        <FadeIn onScroll delay={0.1}>
          <div className="flex flex-wrap gap-3 mb-10">
            <LinkButton href="/book" variant="primary">
              Start a bulk booking
            </LinkButton>
            <LinkButton href="/features/roster" variant="secondary">
              See roster management
            </LinkButton>
          </div>
          <p className="text-sm text-gray-500">
            Related reading:{' '}
            <Link
              href="/resources/guides/bulk-booking-occupational-health"
              className="text-red-500 hover:text-red-600 underline transition-colors"
            >
              bulk booking guide
            </Link>
            .
          </p>
        </FadeIn>
      </main>
      <Footer />
    </div>
  );
}
