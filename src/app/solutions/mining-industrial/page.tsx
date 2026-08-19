import type { Metadata } from 'next';
import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Solutions for Mining & Industrial Employers',
  description:
    'Book mine medicals, general mine induction, and exit medicals in bulk for mining, power station, and construction workforces through ClinicPlus Companion.',
  alternates: {
    canonical: absoluteUrl('/solutions/mining-industrial'),
  },
};

export default function MiningIndustrialSolutionPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <FadeIn>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight mb-4">
            Mining &amp; industrial employers
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-10">
            ClinicPlus&apos;s medical service catalog is built around mining, power station, and
            construction workforces, and Companion is built on top of that same catalog. If your
            company books mine medicals, induction, or exit medicals for groups of employees,
            bulk booking is built for exactly that.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Mine medicals</h2>
          <Card className="p-6 mb-10">
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              Mine medicals are available with or without general mine induction. Both include a
              physical examination, blood pressure, height and weight, audiometry, spirometry,
              vision testing, a urine dipstick test, and a 6-in-1 urine drug test. X-rays are
              compulsory and selected separately.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              General mine induction is compulsory for the following mines: Mzimkhulu, Rietvlei,
              Mavungwani, Valley View, Mgayo, and Bultfontein. Induction can also be booked on its
              own for companies where it&apos;s not compulsory.
            </p>
          </Card>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Site-specific medicals</h2>
          <p className="text-gray-500 leading-relaxed mb-4">
            Separate medical packages cover Black Wattle and Atoll, and power stations,
            construction, and other industrial sites &mdash; the last of these with optional drug
            testing (cannabis or the 6-in-1 panel), sugar testing, and X-rays, so the package can
            be adjusted to what the site actually requires.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Exit medicals</h2>
          <p className="text-gray-500 leading-relaxed mb-4">
            When an employee leaves or changes role, a full exit medical applies if their last
            medical is older than six months, and a short exit medical applies if it&apos;s more
            recent. Both can be booked alongside a mine medical for the incoming employee in the
            same bulk appointment.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Booking for a workforce, not one person at a time</h2>
          <p className="text-gray-500 leading-relaxed mb-10">
            Mining and industrial employers typically book medicals for groups &mdash; a new
            intake, a shift, or a site &mdash; rather than one employee at a time. Companion&apos;s
            roster and bulk booking are built for that pattern: save the workforce once, then
            apply the right combination of medical, induction, and screening services across
            everyone being booked.
          </p>
        </FadeIn>

        <FadeIn onScroll delay={0.1}>
          <div className="flex flex-wrap gap-3 mb-10">
            <LinkButton href="/book" variant="primary">
              Book mine medicals in bulk
            </LinkButton>
            <LinkButton href="/features/bulk-booking" variant="secondary">
              See bulk booking
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
