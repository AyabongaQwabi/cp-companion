import type { Metadata } from 'next';
import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Solutions for Multi-Site Employers',
  description:
    'Manage employee sites, access cards, and occupational health bookings consistently across multiple work locations with ClinicPlus Companion.',
  alternates: {
    canonical: absoluteUrl('/solutions/multi-site-employers'),
  },
};

export default function MultiSiteSolutionPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <FadeIn>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight mb-4">
            Multi-site employers
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-10">
            Companies whose employees work across more than one site &mdash; different mines,
            plants, or project locations &mdash; need to keep track of who&apos;s assigned where,
            and book medicals accordingly. Companion keeps site information on each employee&apos;s
            roster record, not scattered across separate spreadsheets or past appointments.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Sites on the roster</h2>
          <Card className="p-6 mb-10">
            <p className="text-sm text-gray-700 leading-relaxed">
              Each employee&apos;s roster record can carry a default list of sites, including
              whether they hold an access card for that site. When you book, that information
              carries into the appointment instead of being re-entered.
            </p>
          </Card>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Grouping by site</h2>
          <p className="text-gray-500 leading-relaxed mb-4">
            Employee groups can be organized by site, so a bulk booking can target &quot;everyone
            at Site A&quot; without having to pick individuals out of a full company roster each
            time.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">One clinic, employees from several sites</h2>
          <p className="text-gray-500 leading-relaxed mb-4">
            Appointments are still booked at a single ClinicPlus clinic &mdash; currently Hendrina
            or Churchill &mdash; per appointment. Multi-site employers commonly bring employees
            from several of their own sites into one clinic booking, which is exactly what
            selecting a group of employees for a single appointment supports.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Consistent records across locations</h2>
          <p className="text-gray-500 leading-relaxed mb-10">
            Insights shows appointment history and spend at the company level, not per site, so
            HR or safety staff coordinating across locations can see the full picture in one
            place rather than reconciling separate site-level records.
          </p>
        </FadeIn>

        <FadeIn onScroll delay={0.1}>
          <div className="flex flex-wrap gap-3 mb-10">
            <LinkButton href="/book" variant="primary">
              Book across your sites
            </LinkButton>
            <LinkButton href="/features/roster" variant="secondary">
              See roster management
            </LinkButton>
          </div>
          <p className="text-sm text-gray-500">
            Related reading:{' '}
            <Link
              href="/resources/guides/employee-medical-recordkeeping"
              className="text-red-500 hover:text-red-600 underline transition-colors"
            >
              employee medical recordkeeping guide
            </Link>
            .
          </p>
        </FadeIn>
      </main>
      <Footer />
    </div>
  );
}
