import type { Metadata } from 'next';
import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Spend & Appointment Insights',
  description:
    'See your company’s own occupational health appointment history, credit spend, and most-booked services in one place.',
  alternates: {
    canonical: absoluteUrl('/features/insights'),
  },
};

export default function InsightsFeaturePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <FadeIn>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight mb-4">
            Spend &amp; appointment insights
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-10">
            Insights shows your own appointment history and Companion credit spend, scoped to your
            company &mdash; not a companywide ClinicPlus report, but a record of what you&apos;ve
            booked and used through Companion.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">What you can see</h2>
          <Card className="p-6 mb-10">
            <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
              <li>Appointment history &mdash; what was booked, when, and at which clinic</li>
              <li>Most-booked services across your roster</li>
              <li>Companion credit balance and transaction history</li>
              <li>Data scoped to your own company, exportable when you need it</li>
            </ul>
          </Card>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Two separate ledgers</h2>
          <p className="text-gray-500 leading-relaxed mb-4">
            Companion tracks two different things, and Insights keeps them distinct. Credits are
            what you spend inside Companion for actions like bulk bookings &mdash; topped up
            through Yoco, with a signup bonus on first login. The cost of the appointments
            themselves &mdash; the medicals, screening, and services booked for your employees
            &mdash; is invoiced by ClinicPlus directly, the same as any appointment booked outside
            Companion.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Why it matters for HR and safety officers</h2>
          <p className="text-gray-500 leading-relaxed mb-10">
            Companies managing medicals across multiple sites or job categories can use Insights
            to see patterns &mdash; which services are booked most, how spend trends over time
            &mdash; without having to reconstruct that from individual appointment records.
          </p>
        </FadeIn>

        <FadeIn onScroll delay={0.1}>
          <div className="flex flex-wrap gap-3 mb-10">
            <LinkButton href="/book" variant="primary">
              Book an appointment
            </LinkButton>
            <LinkButton href="/features/bulk-booking" variant="secondary">
              See bulk booking
            </LinkButton>
          </div>
          <p className="text-sm text-gray-500">
            Related reading:{' '}
            <Link
              href="/solutions/occupational-health-officers"
              className="text-red-500 hover:text-red-600 underline transition-colors"
            >
              solutions for occupational health officers
            </Link>
            .
          </p>
        </FadeIn>
      </main>
      <Footer />
    </div>
  );
}
