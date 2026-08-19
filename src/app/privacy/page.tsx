import type { Metadata } from 'next';
import Footer from '@/components/Footer';
import PublicHeader from '@/components/PublicHeader';
import contactConfig from '../../../config/contact.json';
import { absoluteUrl } from '@/lib/seo';

const SUPPORT_EMAIL = contactConfig.supportEmail;

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How ClinicPlus Companion collects, uses, and protects personal information under South Africa’s POPIA.',
  alternates: {
    canonical: absoluteUrl('/privacy'),
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 text-sm leading-relaxed text-gray-700">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-gray-500 mb-8">Last updated {new Date().toLocaleDateString('en-ZA')}</p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">1. Who we are</h2>
        <p className="mb-4">
          ClinicPlus Booking Companion is a standalone product independently built and operated by{' '}
          <strong className="text-gray-900">Namoota Technology (Pty) Ltd</strong> (&quot;we&quot;,
          &quot;us&quot;), not by ClinicPlus. This policy explains what personal information we
          collect through the Companion application, why, and how it is protected, in line with
          South Africa&apos;s Protection of Personal Information Act, 2013 (POPIA).
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">2. What we collect</h2>
        <p className="mb-4">
          To use Companion you log in with your existing ClinicPlus account (email and password),
          which we verify against ClinicPlus&apos;s own records but do not separately store or
          duplicate. Once logged in, you may store on your employee roster: employee names, South
          African ID or passport numbers, occupations, site assignments, and job spec documents.
          We also record appointment details you submit (dates, clinics, selected medical
          services) and your credit balance and transaction history.
        </p>
        <p className="mb-4">
          ID and passport numbers and job spec documents are special/sensitive personal
          information under POPIA. We process them only because they are necessary to book and
          administer occupational medical appointments on your behalf, and only for that purpose.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">3. Why we process it (lawful basis)</h2>
        <p className="mb-4">
          We process this information to provide the roster and appointment-booking service you
          request, to create appointments in ClinicPlus&apos;s system on your instruction, to
          process credit purchases, and to comply with legal and accounting obligations. Where we
          rely on your consent (for example, storing an employee&apos;s ID number on your roster),
          you may withdraw that consent at any time by deleting the relevant record.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">4. Who we share it with</h2>
        <p className="mb-4">
          Appointments you create through Companion are written into ClinicPlus&apos;s own
          production booking system, in the same way as if you had booked directly — ClinicPlus
          and its clinic staff see this information as they normally would for any appointment.
          Uploaded files (job spec documents, NDA records) are stored via ClinicPlus&apos;s
          existing file storage. Payment processing for credit top-ups is handled by Yoco
          (Yoco Group (Pty) Ltd), a South African payment services provider — we do not store your
          card details ourselves.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">5. How long we keep it</h2>
        <p className="mb-4">
          We keep roster and account data for as long as your account is active, and appointment
          and transaction records for as long as required for legal, tax, and accounting purposes.
          You can request deletion of individual roster employees at any time from within the app.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">6. Email notifications</h2>
        <p className="mb-4">
          When you first log in, you are asked whether you consent to receiving email
          notifications about your bookings, compliance reminders, credit balance, and product
          updates. This is optional and separate from your acceptance of these terms — you can
          change your preference at any time from Settings, and we will not email you for these
          purposes if you opt out.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">7. Your rights</h2>
        <p className="mb-4">
          Under POPIA you have the right to access, correct, or request deletion of your personal
          information, to object to processing, and to lodge a complaint with the Information
          Regulator of South Africa. To exercise any of these rights, contact us at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-red-500 hover:text-red-600 transition-colors underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">8. Security</h2>
        <p className="mb-4">
          We use reasonable technical and organisational measures to protect the personal
          information we hold, including access controls and encrypted connections. No system is
          completely secure, and we cannot guarantee absolute security.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">9. Contact</h2>
        <p>
          Questions about this policy or your information can be sent to{' '}
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
