import type { Metadata } from 'next';
import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { absoluteUrl, SITE_NAME } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Employee Medical Recordkeeping Guide',
  description:
    'What to keep on file for each employee’s occupational medicals — names, ID numbers, occupations, sites, and job spec files — and why it matters for repeat bookings.',
  alternates: {
    canonical: absoluteUrl('/resources/guides/employee-medical-recordkeeping'),
  },
};

const ARTICLE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Employee medical recordkeeping guide',
  description:
    'What to keep on file for each employee’s occupational medicals, and why it matters for repeat bookings.',
  publisher: {
    '@type': 'Organization',
    name: SITE_NAME,
  },
  mainEntityOfPage: absoluteUrl('/resources/guides/employee-medical-recordkeeping'),
};

export default function RecordkeepingGuidePage() {
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
            Employee medical recordkeeping
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-10">
            Booking the same employees for medicals repeatedly means retyping the same details
            each time, unless that information is kept somewhere reusable. Here&apos;s what&apos;s
            worth keeping on file, and how Companion&apos;s roster holds it.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Core identifying details</h2>
          <p className="text-gray-500 leading-relaxed mb-6">
            Name and South African ID or passport number are the baseline &mdash; required for
            every appointment and rarely changing once captured. Getting these right the first
            time avoids repeated data entry errors across future bookings.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Occupation and site</h2>
          <p className="text-gray-500 leading-relaxed mb-6">
            Occupation often determines which medical package applies (a mine medical versus a
            power station or construction medical, for example), and site determines where the
            employee works and whether they hold an access card. Keeping both current means the
            right service gets applied without having to ask each time.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Job spec files</h2>
          <p className="text-gray-500 leading-relaxed mb-6">
            Job spec documents are often required alongside a medical booking. Storing them once
            against an employee&apos;s record means the same file can be reused on their next
            appointment instead of being re-uploaded, provided the role hasn&apos;t changed.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Groups</h2>
          <p className="text-gray-500 leading-relaxed mb-6">
            Grouping employees &mdash; by site, shift, or department &mdash; turns recordkeeping
            into something that also speeds up booking: a group can be selected as a unit rather
            than searching for each employee individually.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Keeping records current</h2>
          <p className="text-gray-500 leading-relaxed mb-10">
            Roster records should be updated when an employee changes site, occupation, or role
            &mdash; and archived, not just deleted, when they leave, so historical appointment
            records stay intact. Individual roster records can be deleted from within the app when
            no longer needed.
          </p>
        </FadeIn>

        <FadeIn onScroll delay={0.1}>
          <Card className="p-6 mb-10">
            <p className="text-sm text-gray-700 leading-relaxed">
              See how roster data is stored and reused in the{' '}
              <Link href="/features/roster" className="text-red-500 hover:text-red-600 underline transition-colors">
                roster feature
              </Link>
              , or how it&apos;s protected in the{' '}
              <Link href="/privacy" className="text-red-500 hover:text-red-600 underline transition-colors">
                privacy policy
              </Link>
              .
            </p>
          </Card>
        </FadeIn>

        <FadeIn onScroll delay={0.15}>
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/book" variant="primary">
              Book with your roster
            </LinkButton>
            <LinkButton href="/resources/guides/ohsa-compliance-checklist" variant="secondary">
              OHSA compliance checklist
            </LinkButton>
          </div>
        </FadeIn>
      </main>
      <Footer />
    </div>
  );
}
