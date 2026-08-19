import type { Metadata } from 'next';
import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { absoluteUrl, SITE_NAME } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'OHSA Compliance Checklist for Employee Medicals',
  description:
    'A general, educational overview of OHSA and COIDA considerations for occupational medical surveillance in South Africa — not legal advice.',
  alternates: {
    canonical: absoluteUrl('/resources/guides/ohsa-compliance-checklist'),
  },
};

const ARTICLE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'OHSA compliance checklist for employee medicals',
  description:
    'A general, educational overview of OHSA and COIDA considerations for occupational medical surveillance in South Africa.',
  publisher: {
    '@type': 'Organization',
    name: SITE_NAME,
  },
  mainEntityOfPage: absoluteUrl('/resources/guides/ohsa-compliance-checklist'),
};

export default function OhsaChecklistGuidePage() {
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
            OHSA compliance checklist for employee medicals
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-6">
            A general overview of what South African employers commonly need to think about for
            occupational health medical surveillance, under the Occupational Health and Safety Act
            (OHSA) and the Compensation for Occupational Injuries and Diseases Act (COIDA).
          </p>
        </FadeIn>

        <FadeIn onScroll delay={0.05}>
          <Card className="p-6 mb-10 border-gold-300/50">
            <p className="text-sm text-gray-700 leading-relaxed">
              <strong>This is educational content, not legal advice.</strong> It doesn&apos;t cite
              specific clauses or sections of OHSA or COIDA, and it doesn&apos;t determine what
              your company is legally required to do. ClinicPlus Companion is a booking and
              recordkeeping tool &mdash; it doesn&apos;t perform or certify compliance. For
              obligations specific to your workforce and sites, consult a qualified occupational
              health and safety practitioner or legal advisor, or the Department of Employment and
              Labour.
            </p>
          </Card>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Why medical surveillance exists</h2>
          <p className="text-gray-500 leading-relaxed mb-6">
            OHSA generally requires employers to protect the health and safety of employees in
            their workplace, which for many industrial, mining, and construction employers
            includes medical surveillance &mdash; checking that employees are fit for their role
            and monitoring for work-related health effects over time. COIDA governs compensation
            for occupational injuries and diseases, which is part of why accurate medical records
            matter beyond the booking itself.
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Common surveillance touchpoints</h2>
          <Card className="p-6 mb-10">
            <ul className="space-y-2 text-sm text-gray-700 leading-relaxed list-disc list-inside">
              <li>Pre-employment or entry medicals before an employee starts a role</li>
              <li>Periodic medicals during employment, at intervals appropriate to the role and risk exposure</li>
              <li>Exit medicals when an employee leaves or changes role</li>
              <li>Induction for roles or sites that require it</li>
              <li>Screening relevant to the specific hazards of the role (for example, drug, sugar, or hearing and lung function checks)</li>
            </ul>
          </Card>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">What&apos;s generally useful to keep on record</h2>
          <p className="text-gray-500 leading-relaxed mb-6">
            Employers commonly keep records of which medicals were done, when, and for which
            employee and role, so that surveillance intervals can be tracked and exit medicals can
            confirm whether a recent medical already exists. This is the same information
            Companion&apos;s roster and appointment history are built to hold &mdash; see the{' '}
            <Link href="/resources/guides/employee-medical-recordkeeping" className="text-red-500 hover:text-red-600 underline transition-colors">
              recordkeeping guide
            </Link>
            .
          </p>
        </FadeIn>

        <FadeIn onScroll>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Where Companion fits, and where it doesn&apos;t</h2>
          <p className="text-gray-500 leading-relaxed mb-10">
            Companion helps organize and book the medicals your compliance process calls for, and
            keeps a record of what was booked. It doesn&apos;t determine your legal obligations,
            interpret OHSA or COIDA for your specific workforce, or issue compliance
            certification &mdash; those remain the responsibility of your organization and its
            occupational health advisors.
          </p>
        </FadeIn>

        <FadeIn onScroll delay={0.1}>
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/book" variant="primary">
              Book surveillance medicals
            </LinkButton>
            <LinkButton href="/solutions/occupational-health-officers" variant="secondary">
              Solutions for OH officers
            </LinkButton>
          </div>
        </FadeIn>
      </main>
      <Footer />
    </div>
  );
}
