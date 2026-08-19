import type { Metadata } from 'next';
import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Solutions for Occupational Health Officers',
  description:
    'Keep employee medical records organized and book surveillance appointments in bulk — for occupational health and safety officers managing compliance through ClinicPlus.',
  alternates: {
    canonical: absoluteUrl('/solutions/occupational-health-officers'),
  },
};

export default function OHOfficersSolutionPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <FadeIn>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight mb-4">
            Occupational health &amp; safety officers
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-10">
            If you&apos;re responsible for organizing medical surveillance for your workforce
            &mdash; scheduling mine medicals, tracking who&apos;s due for an exit medical,
            arranging induction for new starters &mdash; Companion is built to reduce the manual
            work of getting that information into ClinicPlus.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">What this doesn&apos;t replace</h2>
          <Card className="p-6 mb-10 border-gold-300/50">
            <p className="text-sm text-gray-700 leading-relaxed">
              Companion is a booking and recordkeeping tool, not a compliance certification
              service. It doesn&apos;t determine what OHSA or COIDA require for a specific role or
              site, and nothing here is legal advice &mdash; it helps you organize and submit the
              appointments your own compliance process calls for.
            </p>
          </Card>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Recordkeeping</h2>
          <p className="text-gray-500 leading-relaxed mb-4">
            Each employee&apos;s roster entry holds their occupation, sites, default services, and
            job spec files, giving you one place to check what&apos;s on file for a given
            employee rather than searching through past appointments.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Booking surveillance medicals in bulk</h2>
          <p className="text-gray-500 leading-relaxed mb-4">
            When a group of employees is due for a periodic medical, exit medical, or induction,
            you can select them from the roster and apply the right services to all of them in
            one appointment rather than booking each individually.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Spend and appointment visibility</h2>
          <p className="text-gray-500 leading-relaxed mb-10">
            Insights gives a record of what&apos;s been booked and when, which is useful when
            reporting internally on medical surveillance activity, even though it isn&apos;t a
            substitute for your organization&apos;s own compliance documentation.
          </p>
        </FadeIn>

        <FadeIn onScroll delay={0.1}>
          <div className="flex flex-wrap gap-3 mb-10">
            <LinkButton href="/book" variant="primary">
              Book surveillance medicals
            </LinkButton>
            <LinkButton href="/features/insights" variant="secondary">
              See insights
            </LinkButton>
          </div>
          <p className="text-sm text-gray-500">
            Related reading:{' '}
            <Link
              href="/resources/guides/ohsa-compliance-checklist"
              className="text-red-500 hover:text-red-600 underline transition-colors"
            >
              OHSA compliance checklist
            </Link>
            .
          </p>
        </FadeIn>
      </main>
      <Footer />
    </div>
  );
}
