import Link from 'next/link';
import type { Metadata } from 'next';
import Footer from '@/components/Footer';
import PublicHeader from '@/components/PublicHeader';
import contactConfig from '../../../config/contact.json';
import { absoluteUrl } from '@/lib/seo';

const SUPPORT_EMAIL = contactConfig.supportEmail;

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of service governing use of ClinicPlus Companion by ClinicPlus clients.',
  alternates: {
    canonical: absoluteUrl('/terms'),
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 text-sm leading-relaxed text-gray-700">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-gray-500 mb-8">Last updated {new Date().toLocaleDateString('en-ZA')}</p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">1. Who this agreement is with</h2>
        <p className="mb-4">
          ClinicPlus Companion (&quot;Companion&quot;, &quot;the service&quot;) is operated by
          ClinicPlus Pty Ltd, a business registered in South Africa. By using Companion, you agree
          to these terms, which are governed by the laws of South Africa.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">2. What Companion is</h2>
        <p className="mb-4">
          Companion is an independent tool that lets ClinicPlus clients maintain a reusable
          employee roster and create real appointments in ClinicPlus&apos;s booking system. You
          must have an existing ClinicPlus account to use it. Companion is not a replacement for
          ClinicPlus itself — appointments created through Companion are created in the same
          system, subject to the same clinical, scheduling, and payment processes as any
          appointment booked directly with ClinicPlus.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">3. Credits</h2>
        <p className="mb-4">
          Actions in Companion are paid for with credits, purchased in advance. Credit prices for
          each action are shown before you confirm, along with your resulting balance. All credit
          purchases and action charges are final — see our{' '}
          <Link href="/refund-policy" className="text-red-500 hover:text-red-600 transition-colors underline">
            Refund Policy
          </Link>{' '}
          for details.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">4. Your responsibilities</h2>
        <p className="mb-4">
          You are responsible for the accuracy of information you enter into your roster and
          appointments, including employee ID numbers, occupations, and uploaded documents. You
          must have the authority and consent needed to submit employee medical information on
          their behalf, as set out in the non-disclosure agreement you accept when creating an
          appointment.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">5. Payment confirmation</h2>
        <p className="mb-4">
          Creating an appointment through Companion does not itself confirm or process payment for
          the medical services booked — that remains an offline process handled directly by
          ClinicPlus, exactly as it is for appointments booked through ClinicPlus&apos;s own
          systems.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">6. Availability</h2>
        <p className="mb-4">
          We aim to keep Companion available and reliable but do not guarantee uninterrupted
          access. Companion depends on ClinicPlus&apos;s own systems for login verification and
          appointment creation; outages on ClinicPlus&apos;s side may affect Companion.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">7. Limitation of liability</h2>
        <p className="mb-4">
          Companion is provided on an &quot;as is&quot; basis. To the maximum extent permitted by
          South African law, ClinicPlus Pty Ltd is not liable for indirect or consequential losses
          arising from your use of the service.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">8. Changes to these terms</h2>
        <p className="mb-4">
          We may update these terms from time to time. Continued use of Companion after changes
          take effect constitutes acceptance of the updated terms.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">9. Contact</h2>
        <p>
          Questions about these terms can be sent to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-red-500 hover:text-red-600 transition-colors underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </main>
      <Footer />
    </div>
  );
}
