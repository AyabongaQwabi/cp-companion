import type { Metadata } from 'next';
import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { FadeIn } from '@/components/ui/FadeIn';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Resources',
  description:
    'Guides and answers on bulk occupational health booking, employee medical recordkeeping, and OHSA compliance for South African employers.',
  alternates: {
    canonical: absoluteUrl('/resources'),
  },
};

const GUIDES = [
  {
    title: 'Bulk booking occupational health appointments',
    href: '/resources/guides/bulk-booking-occupational-health',
    body: 'How to book medicals for many employees in one appointment instead of one at a time.',
  },
  {
    title: 'Employee medical recordkeeping',
    href: '/resources/guides/employee-medical-recordkeeping',
    body: 'What to keep on file per employee, and why it matters for repeat bookings and audits.',
  },
  {
    title: 'OHSA compliance checklist',
    href: '/resources/guides/ohsa-compliance-checklist',
    body: 'A general, educational overview of OHSA and COIDA considerations for medical surveillance — not legal advice.',
  },
];

export default function ResourcesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-16 w-full">
        <FadeIn>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight mb-4">
            Resources
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-12 max-w-2xl">
            Guides on booking and recordkeeping for occupational health medicals, written for HR
            and safety staff at companies that book through ClinicPlus.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-14">
          {GUIDES.map((g, i) => (
            <FadeIn key={g.href} delay={i * 0.08} onScroll>
              <Card className="p-6 h-full flex flex-col">
                <h2 className="font-semibold text-gray-900 mb-2">
                  <Link href={g.href} className="hover:text-red-500 transition-colors">
                    {g.title}
                  </Link>
                </h2>
                <p className="text-gray-500 text-sm leading-relaxed flex-1">{g.body}</p>
                <Link
                  href={g.href}
                  className="text-sm text-red-500 hover:text-red-600 transition-colors mt-4 font-medium"
                >
                  Read guide →
                </Link>
              </Card>
            </FadeIn>
          ))}
        </div>

        <FadeIn onScroll>
          <Card className="p-6">
            <h2 className="font-semibold text-gray-900 mb-2">
              <Link href="/resources/faq" className="hover:text-red-500 transition-colors">
                Frequently asked questions
              </Link>
            </h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Common questions about roster data, bulk booking, credits, and clinics.
            </p>
          </Card>
        </FadeIn>
      </main>
      <Footer />
    </div>
  );
}
