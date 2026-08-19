import type { Metadata } from 'next';
import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description:
    'Answers to common questions about ClinicPlus Companion — roster data, bulk booking, credits, clinics, and account access.',
  alternates: {
    canonical: absoluteUrl('/resources/faq'),
  },
};

const FAQS = [
  {
    q: 'What is ClinicPlus Companion?',
    a: 'ClinicPlus Companion is a saved employee roster and bulk appointment booking add-on for companies that already book occupational medicals through ClinicPlus. It stores employee names, ID numbers, occupations, sites, and job spec files so they can be reused every time you book, instead of retyped.',
  },
  {
    q: 'Do I need a new account to use Companion?',
    a: "No. Companion uses your existing ClinicPlus login. If you're already a ClinicPlus client, you don't need to sign up separately.",
  },
  {
    q: 'Which clinics can I book at?',
    a: 'Appointments can currently be booked at ClinicPlus clinics in Hendrina and Churchill.',
  },
  {
    q: 'What services can I book in bulk?',
    a: 'The full ClinicPlus service catalog: mine medicals with or without general mine induction, medicals for Black Wattle and Atoll, medicals for power stations, construction, and other industries, 6-in-1 and cannabis drug testing, pregnancy and sugar screening, HIV testing, clearance, full and short exit medicals, and the COVID-19 questionnaire.',
  },
  {
    q: 'Are there dates I can’t book?',
    a: "Yes. Bookings aren't available on weekends or South African public holidays, and each clinic has a daily appointment limit. Companion checks both before a booking is submitted.",
  },
  {
    q: 'What are credits, and how are they different from what I pay ClinicPlus?',
    a: "Credits are Companion's own currency, spent on actions like bulk bookings inside the app — topped up through Yoco, with a signup bonus on first login. The cost of the medical appointments themselves is invoiced by ClinicPlus directly, the same as any appointment booked outside Companion. These are two separate things.",
  },
  {
    q: 'How do I top up my credit balance?',
    a: 'Credit top-ups are processed through Yoco, a South African payment provider, from inside the app.',
  },
  {
    q: 'Is roster data shared with anyone besides ClinicPlus?',
    a: "Appointments you create are written into ClinicPlus's own booking system, the same as if booked directly. Job spec files are stored via ClinicPlus's existing file storage. Payment processing for credit top-ups is handled by Yoco. See the privacy policy for full detail.",
  },
  {
    q: 'Can I delete an employee from my roster?',
    a: 'Yes, individual roster employees can be deleted from within the app at any time.',
  },
  {
    q: 'Does Companion handle OHSA or COIDA compliance for me?',
    a: "No. Companion is a booking and recordkeeping tool. It doesn't determine your legal obligations under OHSA or COIDA, or certify compliance — it helps you organize and submit the appointments your own compliance process calls for.",
  },
];

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: f.a,
    },
  })),
};

export default function FaqPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <PublicHeader />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 w-full">
        <FadeIn>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight mb-4">
            Frequently asked questions
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-10">
            Common questions about roster data, bulk booking, credits, and clinics.
          </p>
        </FadeIn>

        <div className="space-y-4 mb-14">
          {FAQS.map((f, i) => (
            <FadeIn key={f.q} delay={Math.min(i * 0.04, 0.3)} onScroll>
              <Card className="p-5">
                <h2 className="font-semibold text-gray-900 mb-2">{f.q}</h2>
                <p className="text-sm text-gray-500 leading-relaxed">{f.a}</p>
              </Card>
            </FadeIn>
          ))}
        </div>

        <FadeIn onScroll>
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/book" variant="primary">
              Book an appointment
            </LinkButton>
            <LinkButton href="/resources" variant="secondary">
              See all resources
            </LinkButton>
          </div>
          <p className="text-sm text-gray-500 mt-6">
            Still have questions? See the{' '}
            <Link href="/privacy" className="text-red-500 hover:text-red-600 underline transition-colors">
              privacy policy
            </Link>{' '}
            or{' '}
            <Link href="/terms" className="text-red-500 hover:text-red-600 underline transition-colors">
              terms of service
            </Link>
            .
          </p>
        </FadeIn>
      </main>
      <Footer />
    </div>
  );
}
