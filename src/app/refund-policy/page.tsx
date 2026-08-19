import type { Metadata } from 'next';
import Footer from '@/components/Footer';
import PublicHeader from '@/components/PublicHeader';
import contactConfig from '../../../config/contact.json';
import { absoluteUrl } from '@/lib/seo';

const SUPPORT_EMAIL = contactConfig.supportEmail;

export const metadata: Metadata = {
  title: 'Refund Policy',
  description: 'Refund policy for ClinicPlus Companion credit purchases.',
  alternates: {
    canonical: absoluteUrl('/refund-policy'),
  },
};

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 text-sm leading-relaxed text-gray-700">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Refund Policy</h1>
        <p className="text-gray-500 mb-8">Last updated {new Date().toLocaleDateString('en-ZA')}</p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">No refunds on credit purchases</h2>
        <p className="mb-4">
          Credit purchases are final. Once a payment for credits has been confirmed, it cannot be
          refunded or reversed, and the credits added to your balance cannot be exchanged for
          money.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">No refunds or reversals on completed actions</h2>
        <p className="mb-4">
          Once an action has been confirmed and credits have been deducted for it — adding an
          employee, creating an appointment, uploading a file, or any other priced action — that
          charge is final. There is no mechanism in Companion to reverse a debit or restore spent
          credits, even if you change your mind afterward.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">Why every priced action asks you to confirm first</h2>
        <p className="mb-4">
          Because nothing is refundable, every action that costs credits shows you, before it
          runs, exactly what it is, exactly what it costs, and exactly what your balance will be
          afterward — with a separate confirm click required. This step exists specifically to
          protect you from spending credits by accident. Please read it before confirming: it is
          the only point at which you can stop an action before it becomes final. Once you
          confirm, the action and its charge cannot be undone.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">Payment issues</h2>
        <p className="mb-4">
          If a Yoco payment fails or is declined, you are not charged and no credits are added —
          you can simply try again. If you believe you were charged by Yoco without receiving the
          corresponding credits, contact us and we will investigate.
        </p>

        <h2 className="font-semibold text-gray-900 mt-8 mb-2">Contact</h2>
        <p>
          Questions about a specific charge can be sent to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-red-500 hover:text-red-600 transition-colors underline">
            {SUPPORT_EMAIL}
          </a>{' '}
          — while charges themselves are final per this policy, we&apos;re happy to help
          investigate anything that looks wrong.
        </p>
      </main>
      <Footer />
    </div>
  );
}
