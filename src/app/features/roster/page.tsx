import type { Metadata } from 'next';
import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Employee Roster Management',
  description:
    'Save employee names, ID numbers, occupations, sites, groups, and job spec files once, and reuse them on every bulk occupational health booking through ClinicPlus.',
  alternates: {
    canonical: absoluteUrl('/features/roster'),
  },
};

export default function RosterFeaturePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <FadeIn>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight mb-4">
            Employee roster
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-10">
            A roster is your list of employees stored in Companion, separate from &mdash; but used
            to fill in &mdash; the appointments you create in ClinicPlus. Add each employee once,
            and pick them from the roster every time you book instead of typing their details
            again.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">What&apos;s stored per employee</h2>
          <Card className="p-6 mb-10">
            <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
              <li>Name and South African ID or passport number</li>
              <li>Occupation</li>
              <li>Default service selections (mine medical, drug test, exit medical, and so on)</li>
              <li>Default sites, including access card status</li>
              <li>Group membership, for booking by team or department</li>
              <li>Job spec files, so the same document doesn&apos;t need re-uploading</li>
              <li>Notes</li>
            </ul>
          </Card>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Where roster data comes from</h2>
          <p className="text-gray-500 leading-relaxed mb-4">
            You can add employees to the roster manually, or import them from appointments
            you&apos;ve already booked through ClinicPlus &mdash; so companies with an existing
            appointment history don&apos;t have to start from a blank list.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Groups</h2>
          <p className="text-gray-500 leading-relaxed mb-4">
            Employees can be grouped &mdash; by site, shift, or department, for example &mdash; so
            a bulk booking can pull in &quot;everyone on the night shift&quot; or &quot;all of Site
            B&quot; instead of selecting each person individually.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Roster data isn&apos;t the appointment</h2>
          <p className="text-gray-500 leading-relaxed mb-10">
            The roster is Companion&apos;s own record, used to pre-fill a booking. The actual
            appointment &mdash; dates, clinic, selected services &mdash; is created directly in
            ClinicPlus&apos;s system when you submit it, the same as if you&apos;d booked it there
            yourself.
          </p>
        </FadeIn>

        <FadeIn onScroll delay={0.1}>
          <div className="flex flex-wrap gap-3 mb-10">
            <LinkButton href="/book" variant="primary">
              Book from your roster
            </LinkButton>
            <LinkButton href="/features/bulk-booking" variant="secondary">
              See bulk booking
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
