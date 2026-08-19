import type { Metadata } from 'next';
import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'What ClinicPlus Companion does: a saved employee roster, bulk appointment booking, and spend & appointment insights for companies that book medicals through ClinicPlus.',
  alternates: {
    canonical: absoluteUrl('/features'),
  },
};

const FEATURES = [
  {
    title: 'Employee roster',
    href: '/features/roster',
    body: 'Save employee names, ID numbers, occupations, sites, and job spec files once. Reuse them on every booking instead of retyping.',
  },
  {
    title: 'Bulk appointment booking',
    href: '/features/bulk-booking',
    body: 'Select employees by occupation or group, apply mine medicals, screening, or exit medicals across all of them at once, and submit a real ClinicPlus appointment.',
  },
  {
    title: 'Spend & appointment insights',
    href: '/features/insights',
    body: "See your company's own appointment history, credit spend, and most-booked services in one place.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-16 w-full">
        <FadeIn>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight mb-4">
            Features
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-12 max-w-2xl">
            ClinicPlus Companion adds three things to your existing ClinicPlus account: a saved
            employee roster, a bulk booking flow, and a view of your own spend and appointment
            history.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <FadeIn key={f.href} delay={i * 0.08} onScroll>
              <Card className="p-6 h-full flex flex-col">
                <h2 className="font-semibold text-gray-900 mb-2">
                  <Link href={f.href} className="hover:text-red-500 transition-colors">
                    {f.title}
                  </Link>
                </h2>
                <p className="text-gray-500 text-sm leading-relaxed flex-1">{f.body}</p>
                <Link
                  href={f.href}
                  className="text-sm text-red-500 hover:text-red-600 transition-colors mt-4 font-medium"
                >
                  Learn more →
                </Link>
              </Card>
            </FadeIn>
          ))}
        </div>

        <FadeIn onScroll delay={0.2}>
          <div className="mt-14 flex flex-wrap gap-3">
            <LinkButton href="/book" variant="primary">
              Book a bulk appointment
            </LinkButton>
            <LinkButton href="/solutions" variant="secondary">
              See solutions by employer type
            </LinkButton>
          </div>
        </FadeIn>
      </main>
      <Footer />
    </div>
  );
}
