import type { Metadata } from 'next';
import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Solutions',
  description:
    'How ClinicPlus Companion fits mining and industrial employers, multi-site employers, and occupational health officers who book bulk medicals through ClinicPlus.',
  alternates: {
    canonical: absoluteUrl('/solutions'),
  },
};

const SOLUTIONS = [
  {
    title: 'Mining & industrial employers',
    href: '/solutions/mining-industrial',
    body: 'Mine medicals, general mine induction, and compulsory-mine requirements for the workforce categories ClinicPlus already serves.',
  },
  {
    title: 'Multi-site employers',
    href: '/solutions/multi-site-employers',
    body: 'Companies with employees working across more than one site, needing consistent records and site-specific booking.',
  },
  {
    title: 'Occupational health officers',
    href: '/solutions/occupational-health-officers',
    body: 'For the people responsible for keeping employee medical records current and organizing surveillance appointments.',
  },
];

export default function SolutionsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-16 w-full">
        <FadeIn>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight mb-4">
            Solutions
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-12 max-w-2xl">
            Companion&apos;s service catalog &mdash; mine medicals, general mine induction, exit
            medicals, and screening &mdash; is built around the employers ClinicPlus already
            serves: mining, industrial, and construction operations booking occupational medicals
            for their workforce.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {SOLUTIONS.map((s, i) => (
            <FadeIn key={s.href} delay={i * 0.08} onScroll>
              <Card className="p-6 h-full flex flex-col">
                <h2 className="font-semibold text-gray-900 mb-2">
                  <Link href={s.href} className="hover:text-red-500 transition-colors">
                    {s.title}
                  </Link>
                </h2>
                <p className="text-gray-500 text-sm leading-relaxed flex-1">{s.body}</p>
                <Link
                  href={s.href}
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
            <LinkButton href="/features" variant="secondary">
              See features
            </LinkButton>
          </div>
        </FadeIn>
      </main>
      <Footer />
    </div>
  );
}
