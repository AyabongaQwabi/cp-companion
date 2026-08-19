'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ShieldCheck, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { clearSession, type Session } from '@/lib/session';

interface TermsGateProps {
  session: Session;
}

/**
 * Blocks every authenticated page (mounted once, inside NavBar, which every protected route
 * renders) behind a mandatory accept screen until this productionUserId has an accepted row for
 * the current CURRENT_TERMS_VERSION. Client-side only, matching the rest of the app's
 * localStorage-session model — there is no server-side page protection in this app to hook into.
 */
export default function TermsGate({ session }: TermsGateProps) {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'blocked' | 'clear'>('checking');
  const [emailConsent, setEmailConsent] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/terms?userId=${encodeURIComponent(session.id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setStatus(d.accepted ? 'clear' : 'blocked');
      })
      .catch(() => {
        if (!cancelled) setStatus('clear');
      });
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  const handleAccept = async () => {
    if (!agreed) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.id, emailConsent }),
      });
      if (!res.ok) throw new Error('Failed to record acceptance');
      setStatus('clear');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status !== 'blocked') return null;

  return (
    <div className="fixed inset-0 z-[100] bg-gray-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="bg-white w-full max-w-lg rounded-card border border-gray-200 shadow-2xl my-8"
      >
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-600 mb-2">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Before you continue
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            Accept the ClinicPlus Booking Companion terms
          </h2>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            ClinicPlus Booking Companion is an independent, standalone product built by{' '}
            <strong className="text-gray-900">Namoota Technology (Pty) Ltd</strong>. Read and
            accept the terms below to continue — you won&apos;t be able to view any other page
            until you do.
          </p>
        </div>

        <div className="px-6 py-5 max-h-72 overflow-y-auto text-sm text-gray-600 leading-relaxed space-y-3 bg-gray-50/60">
          <p>
            By continuing you agree to Namoota Technology&apos;s{' '}
            <Link href="/terms" target="_blank" className="text-red-600 underline hover:text-red-700">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" target="_blank" className="text-red-600 underline hover:text-red-700">
              Privacy Policy
            </Link>
            , including that:
          </p>
          <ul className="list-disc list-inside space-y-1.5">
            <li>Companion is a paid, credit-based tool and is not affiliated with or operated by ClinicPlus itself.</li>
            <li>Companion is optional — it does not replace the ClinicPlus bookings website, which remains fully usable on its own.</li>
            <li>You consent to Namoota Technology processing the roster, company, and appointment data you enter, including employee personal and medical-adjacent information, to operate the service.</li>
            <li>Namoota Technology Pty Ltd is protected against liability for data you choose to submit, as detailed in the Terms of Service.</li>
          </ul>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 space-y-3">
          <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span>
              I have read and agree to the{' '}
              <Link href="/terms" target="_blank" className="text-red-600 underline hover:text-red-700">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" target="_blank" className="text-red-600 underline hover:text-red-700">
                Privacy Policy
              </Link>
              , and consent to my data being used as described.
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={emailConsent}
              onChange={(e) => setEmailConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span className="inline-flex items-start gap-1.5">
              <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
              Send me email notifications about my bookings, compliance reminders, and product
              updates. (Optional — you can change this later in Settings.)
            </span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button
              onClick={handleAccept}
              disabled={!agreed || submitting}
              variant="primary"
              className="flex-1"
            >
              {submitting ? 'Saving…' : 'Agree and continue'}
            </Button>
            <button
              onClick={() => {
                clearSession();
                router.push('/login');
              }}
              className="text-sm text-gray-500 hover:text-gray-700 px-3"
            >
              Log out
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
