import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type {
  DormancyFlag,
  NewCompanyLead,
  DataQualityFlag,
  AnomalyFlag,
  AdoptionMetric,
  SyncLogEntry,
} from '@/lib/types';

/**
 * cp-redesign-admin's read-only counterpart to /api/admin/platform (the superadmin-only page
 * cp-companion serves for itself). Same six cp_companion collections, same query/sort logic, same
 * response shape — this route exists only because cp-redesign-admin's admins are a separate,
 * cp-companion-unaware user base with no shared login, so the isSuperadmin(userId) gate the
 * internal page uses doesn't apply to them. Gated instead via the shared-secret/CORS pattern every
 * other /api/admin/* route uses for cp-redesign-admin (see src/lib/admin-stats-cors.ts).
 *
 * Do not fold this into /api/admin/platform/route.ts — that route's isSuperadmin gate and internal
 * page must stay untouched. Keep this route's query logic in sync with that one if the underlying
 * sync pipeline collections change shape.
 */
export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  try {
    const db = await getCompanionDb();

    const [dormancy, newLeads, dataQuality, anomalies, latestAdoptionMetric, lastSyncRuns] = await Promise.all([
      db.collection<DormancyFlag>('dormancyFlags').find().sort({ daysSinceLastBooking: -1 }).toArray(),
      db.collection<NewCompanyLead>('newCompanyLeads').find({ isOnCompanion: false }).sort({ firstSeenAt: -1 }).toArray(),
      db.collection<DataQualityFlag>('dataQualitySweep').find().sort({ lastSyncedAt: -1 }).toArray(),
      db.collection<AnomalyFlag>('anomalyFlags').find().sort({ flaggedAt: -1 }).toArray(),
      db.collection<AdoptionMetric>('adoptionMetrics').find().sort({ computedAt: -1 }).limit(1).toArray(),
      db.collection<SyncLogEntry>('syncLog').find().sort({ startedAt: -1 }).limit(10).toArray(),
    ]);

    return withAdminStatsCors(
      NextResponse.json({
        dormancy,
        newLeads,
        dataQuality,
        anomalies,
        adoptionMetric: latestAdoptionMetric[0] ?? null,
        recentSyncRuns: lastSyncRuns,
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
