'use client';

import { useEffect, useState, use } from 'react';
import { ShieldCheck, ShieldX } from 'lucide-react';
import Footer from '@/components/Footer';
import PublicHeader from '@/components/PublicHeader';

interface VerificationData {
  companyName: string;
  compliantCount: number;
  totalTrackedCount: number;
  trackedServiceCount: number;
  totalServiceCount: number;
  asOfDate: string;
}

/**
 * Fully public, no login, no NavBar/TermsGate (same pattern as /privacy and /terms) — reachable by
 * anyone with the link, per the opt-in design: a company shares this URL with a site or auditor.
 * Shows aggregate counts and a date only, never names or ID numbers — see
 * /api/verify/[token]/route.ts, which is the only source this page reads from.
 */
export default function ComplianceVerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<VerificationData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/verify/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        setData(await res.json());
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-lg mx-auto px-6 py-16 text-sm leading-relaxed text-gray-700 w-full">
        {loading && <p className="text-gray-500">Loading verification…</p>}

        {!loading && notFound && (
          <div className="text-center py-12">
            <ShieldX className="h-10 w-10 text-gray-300 mx-auto mb-3" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Verification link not found</h1>
            <p className="text-gray-500">
              This link is invalid or the company has turned off public verification.
            </p>
          </div>
        )}

        {!loading && data && (
          <div className="text-center py-8">
            <ShieldCheck className="h-10 w-10 text-red-500 mx-auto mb-3" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-gray-900 mb-1">{data.companyName}</h1>
            <p className="text-gray-500 mb-6">Compliance verification</p>

            <p className="text-3xl font-semibold text-gray-900 mb-1">
              {data.compliantCount} / {data.totalTrackedCount}
            </p>
            <p className="text-gray-500 mb-6">employees current on tracked medical types</p>

            <p className="text-xs text-gray-400 border-t border-gray-200 pt-4">
              Tracks {data.trackedServiceCount} of {data.totalServiceCount} ClinicPlus service types —
              not every service is currently expiry-tracked, so this reflects only the types
              tracked as of the date below, not full occupational health compliance.
            </p>
            <p className="text-xs text-gray-400 mt-2">As of {data.asOfDate}</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
