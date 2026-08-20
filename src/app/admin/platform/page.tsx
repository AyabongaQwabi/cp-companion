'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, TrendingUp, Moon, Building2, AlertTriangle, Fingerprint, Clock } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import LoadingState from '@/components/LoadingState';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import dashboardPages from '../../../../config/dashboard-pages.json';
import type {
  DormancyFlag,
  NewCompanyLead,
  DataQualityFlag,
  AnomalyFlag,
  AdoptionMetric,
  SyncLogEntry,
} from '@/lib/types';

interface PlatformData {
  dormancy: DormancyFlag[];
  newLeads: NewCompanyLead[];
  dataQuality: DataQualityFlag[];
  anomalies: AnomalyFlag[];
  adoptionMetric: AdoptionMetric | null;
  recentSyncRuns: SyncLogEntry[];
}

/**
 * Superadmin-only operator dashboard for Section 0's sync pipeline output — dormancy list, new
 * ClinicPlus-company leads not yet on Companion, the platform-wide data-quality sweep, the
 * pricing-anomaly watchdog, the Companion-vs-direct adoption metric, and recent sync run health.
 * Entirely read-only: nothing on this page writes anything, all data comes from cp_companion
 * collections the hourly sync job (src/lib/sync) materializes. Same fail-closed server-side
 * isSuperadmin gate as /admin/service-validity; this page's own gate is UX only.
 */
export default function PlatformAdminPage() {
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const [forbidden, setForbidden] = useState(false);
  const [data, setData] = useState<PlatformData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/platform?userId=${encodeURIComponent(session.id)}`);
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      router.push('/login');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [session, router, load]);

  if (!session) return null;

  if (forbidden) {
    return (
      <div className="max-w-2xl mx-auto px-4 pb-12">
        <NavBar session={session} />
        <PageIntro
          title={dashboardPages.forbidden.title}
          description={dashboardPages.forbidden.description}
          icon={ShieldAlert}
        />
        <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded-card p-4">
          This page is restricted to superadmins. Your account does not have that role.
        </div>
      </div>
    );
  }

  const lastRun = data?.recentSyncRuns?.[0];

  return (
    <div className="max-w-5xl mx-auto px-4 pb-12">
      <NavBar session={session} />
      <PageIntro
        title="Platform dashboard"
        description="Superadmin-only. Everything here reads from the hourly sync pipeline's derived collections, never live production."
        icon={ShieldAlert}
      />

      {loading && <LoadingState label="Loading platform data..." />}

      {!loading && data && (
        <div className="space-y-6">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-sm">Last sync run</h2>
            </div>
            {lastRun ? (
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge tone={lastRun.status === 'success' ? 'green' : lastRun.status === 'partial' ? 'gold' : 'red'}>
                    {lastRun.status}
                  </Badge>
                  <span>{new Date(lastRun.startedAt).toLocaleString()}</span>
                </div>
                <ul className="text-xs text-gray-500 mt-2 space-y-0.5">
                  {lastRun.jobs.map((j) => (
                    <li key={j.name}>
                      {j.name}: {j.processed} processed, {j.errors} errors ({j.durationMs}ms)
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No sync runs recorded yet.</p>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-sm">Platform adoption</h2>
            </div>
            {data.adoptionMetric ? (
              <p className="text-sm text-gray-700">
                <strong>{(data.adoptionMetric.adoptionRate * 100).toFixed(1)}%</strong> of all appointments (
                {data.adoptionMetric.companionCreatedAppointments} of {data.adoptionMetric.totalAppointments}) were
                created through Companion, as of {new Date(data.adoptionMetric.computedAt).toLocaleString()}.
              </p>
            ) : (
              <p className="text-sm text-gray-500">No adoption data yet.</p>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Moon className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-sm">Dormant companies ({data.dormancy.length})</h2>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Companies quiet for more than 2x their own historical booking interval. Outreach list only — nothing
              here is emailed automatically.
            </p>
            {data.dormancy.length === 0 ? (
              <p className="text-sm text-gray-500">None flagged.</p>
            ) : (
              <ul className="text-sm divide-y divide-gray-100">
                {data.dormancy.map((d) => (
                  <li key={d.companyId} className="py-2 flex justify-between">
                    <span>{d.companyName}</span>
                    <span className="text-gray-500 text-xs">
                      {d.daysSinceLastBooking}d since last booking (avg interval {d.avgBookingIntervalDays}d)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-sm">New ClinicPlus companies not on Companion ({data.newLeads.length})</h2>
            </div>
            {data.newLeads.length === 0 ? (
              <p className="text-sm text-gray-500">None flagged.</p>
            ) : (
              <ul className="text-sm divide-y divide-gray-100">
                {data.newLeads.map((l) => (
                  <li key={l.companyId} className="py-2 flex justify-between">
                    <span>{l.companyName}</span>
                    <span className="text-gray-500 text-xs">first seen {new Date(l.firstSeenAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Fingerprint className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-sm">Data quality sweep ({data.dataQuality.length})</h2>
            </div>
            {data.dataQuality.length === 0 ? (
              <p className="text-sm text-gray-500">No flags.</p>
            ) : (
              <ul className="text-sm divide-y divide-gray-100">
                {data.dataQuality.map((f, i) => (
                  <li key={i} className="py-2">
                    <Badge tone="gold">{f.flagType}</Badge>{' '}
                    <span className="text-gray-600">{f.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-sm">Pricing anomalies ({data.anomalies.length})</h2>
            </div>
            {data.anomalies.length === 0 ? (
              <p className="text-sm text-gray-500">No mismatches between stored and recomputed pricing.</p>
            ) : (
              <ul className="text-sm divide-y divide-gray-100">
                {data.anomalies.map((a) => (
                  <li key={a.appointmentId} className="py-2 flex justify-between">
                    <span>{a.appointmentId}</span>
                    <span className="text-gray-500 text-xs">
                      stored R{a.storedAmount} vs recomputed R{a.recomputedAmount} (diff {a.difference})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
