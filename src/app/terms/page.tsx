import Link from 'next/link';
import type { Metadata } from 'next';
import Footer from '@/components/Footer';
import PublicHeader from '@/components/PublicHeader';
import contactConfig from '../../../config/contact.json';
import { absoluteUrl } from '@/lib/seo';

const SUPPORT_EMAIL = contactConfig.supportEmail;

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of service governing use of ClinicPlus Booking Companion, a standalone product built by Namoota Technology (Pty) Ltd.',
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
          ClinicPlus Booking Companion (&quot;Companion&quot;, &quot;the service&quot;) is a
          standalone product independently designed, built, and operated by{' '}
          <strong className="text-gray-900">Namoota Technology (Pty) Ltd</strong>
          (&quot;Namoota&quot;, &quot;we&quot;, &quot;us&quot;), a business registered in South
          Africa. Companion is not owned or operated by ClinicPlus. By creating an account, logging
          in, or otherwise using Companion, you agree to these terms, which are governed by the
          laws of South Africa.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">2. What Companion is</h2>
        <p className="mb-4">
          Companion is an independent account-management tool built for ClinicPlus clients who
          book occupational health medicals repeatedly and want a faster way to manage their
          roster, groups, and appointments. You must have an existing ClinicPlus account to use
          it. Appointments created through Companion are created directly in ClinicPlus&apos;s own
          booking system, subject to the same clinical, scheduling, and payment processes as any
          appointment booked directly with ClinicPlus.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">3. Companion is optional, not mandatory</h2>
        <p className="mb-4">
          Companion is an optional add-on. You are never required to use it, and it does not
          replace, disable, or restrict your ability to use the ClinicPlus bookings website
          directly at any time. You can stop using Companion and continue booking through
          ClinicPlus as normal.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">4. Companion is a paid, credit-based tool</h2>
        <p className="mb-4">
          Companion is not a free application. It is a credit-based companion tool built for power
          users who want to get the most out of ClinicPlus account management — bulk roster
          imports, group-based bookings, compliance tracking, and reporting. Actions in Companion
          are paid for with credits, purchased in advance. Credit prices for each action are shown
          before you confirm, along with your resulting balance. All credit purchases and action
          charges are final — see our{' '}
          <Link href="/refund-policy" className="text-red-500 hover:text-red-600 transition-colors underline">
            Refund Policy
          </Link>{' '}
          for details.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">5. Your data and your consent</h2>
        <p className="mb-4">
          To operate Companion, Namoota processes the information you choose to enter, including
          employee names, ID or passport numbers, occupations, sites, groups, uploaded job spec
          documents, and appointment and billing history. By using Companion, you consent to
          Namoota collecting, storing, and processing this data for the purpose of providing the
          service, as described further in our{' '}
          <Link href="/privacy" className="text-red-500 hover:text-red-600 transition-colors underline">
            Privacy Policy
          </Link>
          . You confirm you have the authority and any consent needed from the employees whose
          information you submit.
        </p>
        <p className="mb-4">
          Namoota also aggregates booking and roster data across companies using Companion to
          produce anonymized benchmark statistics — for example, average spend per employee for
          companies of a similar size, or how a typical rebooking interval compares to yours. A
          benchmark is only ever calculated and shown when it is based on at least five other
          companies with a broadly similar profile; below that number, no benchmark is generated
          for that comparison at all. These benchmarks never identify, name, or make any other
          company individually recoverable — you will never see another company&apos;s name, exact
          figures, or any detail that could single one out. By using Companion, you consent to your
          company&apos;s data being included, in anonymized aggregate form only, in these
          cross-company benchmarks.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">6. Email notifications</h2>
        <p className="mb-4">
          If you opt in to email notifications when accepting these terms, Namoota may email you
          about your bookings, compliance reminders, credit balance, and product updates. You can
          change this preference at any time from Settings.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">7. Your responsibilities</h2>
        <p className="mb-4">
          You are responsible for the accuracy of information you enter into your roster and
          appointments, including employee ID numbers, occupations, and uploaded documents. You
          must have the authority and consent needed to submit employee medical information on
          their behalf, as set out in the non-disclosure agreement you accept when creating an
          appointment.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">8. Payment confirmation</h2>
        <p className="mb-4">
          Creating an appointment through Companion does not itself confirm or process payment for
          the medical services booked — that remains an offline process handled directly by
          ClinicPlus, exactly as it is for appointments booked through ClinicPlus&apos;s own
          systems.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">9. Availability</h2>
        <p className="mb-4">
          We aim to keep Companion available and reliable but do not guarantee uninterrupted
          access. Companion depends on ClinicPlus&apos;s own systems for login verification and
          appointment creation; outages on ClinicPlus&apos;s side may affect Companion.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">10. Limitation of liability</h2>
        <p className="mb-4">
          Companion is provided on an &quot;as is&quot; basis. To the maximum extent permitted by
          South African law, Namoota Technology (Pty) Ltd is not liable for indirect or
          consequential losses arising from your use of the service, including losses arising from
          data you choose to submit, and from ClinicPlus&apos;s own systems, availability, or
          appointment processes, which Namoota does not control.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">11. Changes to these terms</h2>
        <p className="mb-4">
          We may update these terms from time to time. Where changes are substantive, you will be
          asked to review and re-accept them the next time you log in before you can continue using
          Companion. Continued use of Companion after changes take effect constitutes acceptance
          of the updated terms.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">12. Contact</h2>
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
