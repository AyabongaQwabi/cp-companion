import type { Metadata } from 'next';
import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { absoluteUrl, SITE_NAME } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'How to Bulk Book Occupational Health Appointments',
  description:
    'A step-by-step guide to booking occupational medicals for multiple employees in one appointment, instead of booking each employee individually.',
  alternates: {
    canonical: absoluteUrl('/resources/guides/bulk-booking-occupational-health'),
  },
};

const ARTICLE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to bulk book occupational health appointments',
  description:
    'A step-by-step guide to booking occupational medicals for multiple employees in one appointment.',
  publisher: {
    '@type': 'Organization',
    name: SITE_NAME,
  },
  mainEntityOfPage: absoluteUrl('/resources/guides/bulk-booking-occupational-health'),
};

export default function BulkBookingGuidePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE_JSON_LD) }}
      />
      <PublicHeader />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 w-full">
        <FadeIn>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight mb-4">
            How to bulk book occupational health appointments
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-10">
            Companies that send groups of employees for medicals &mdash; a new intake, a shift, an
            entire site &mdash; don&apos;t need to book each person separately. Here&apos;s how a
            bulk booking works in ClinicPlus Companion.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Get your employees onto a roster</h2>
          <p className="text-gray-500 leading-relaxed mb-6">
            Before booking, employees need to exist on your Companion roster: name, ID number,
            occupation, and default sites. You can add them manually or import them from
            appointments you&apos;ve already booked through ClinicPlus, so this is usually a
            one-time setup rather than something repeated for every booking.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Select employees for the appointment</h2>
          <p className="text-gray-500 leading-relaxed mb-6">
            From the booking screen, select employees individually or by group &mdash; for
            example, everyone assigned to a particular site. Each selected employee carries their
            roster defaults (occupation, sites, job spec file) into the booking automatically.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Apply services in bulk</h2>
          <p className="text-gray-500 leading-relaxed mb-6">
            Apply a service &mdash; a mine medical, a specific drug test, an exit medical &mdash;
            to every selected employee at once, then adjust individual employees where their
            requirements differ (for example, someone who only needs induction, not a full
            medical).
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Choose a clinic and date</h2>
          <p className="text-gray-500 leading-relaxed mb-6">
            Appointments are booked at Hendrina or Churchill. Weekends and South African public
            holidays aren&apos;t available for booking, and each clinic has a daily appointment
            limit &mdash; Companion checks both before you submit.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Review and submit</h2>
          <p className="text-gray-500 leading-relaxed mb-10">
            The total price is calculated across every employee and service selected. Once
            submitted, the appointment is created directly in ClinicPlus&apos;s system, the same
            as a booking made there directly.
          </p>
        </FadeIn>

        <FadeIn onScroll delay={0.1}>
          <Card className="p-6 mb-10">
            <p className="text-sm text-gray-700 leading-relaxed">
              Bulk booking works best once your roster is in place &mdash; see the{' '}
              <Link href="/features/roster" className="text-red-500 hover:text-red-600 underline transition-colors">
                roster feature
              </Link>{' '}
              for what&apos;s stored per employee.
            </p>
          </Card>
        </FadeIn>

        <FadeIn onScroll delay={0.15}>
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/book" variant="primary">
              Start a bulk booking
            </LinkButton>
            <LinkButton href="/resources/faq" variant="secondary">
              See FAQ
            </LinkButton>
          </div>
        </FadeIn>
      </main>
      <Footer />
    </div>
  );
}
