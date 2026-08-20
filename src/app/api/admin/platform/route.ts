import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { isSuperadmin } from '@/lib/roles';
import type {
  DormancyFlag,
  NewCompanyLead,
  DataQualityFlag,
  AnomalyFlag,
  AdoptionMetric,
  SyncLogEntry,
} from '@/lib/types';

/**
 * Backs the superadmin-only platform dashboard (/admin/platform) — reads exclusively from the
 * derived collections the hourly sync pipeline (src/lib/sync) writes, never queries production
 * live. Same server-side isSuperadmin fail-closed gate as /api/service-validity-periods; the
 * client-side page gate is UX only, this is the real boundary.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId || !(await isSuperadmin(userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = await getCompanionDb();

  const [dormancy, newLeads, dataQuality, anomalies, latestAdoptionMetric, lastSyncRuns] = await Promise.all([
    db.collection<DormancyFlag>('dormancyFlags').find().sort({ daysSinceLastBooking: -1 }).toArray(),
    db.collection<NewCompanyLead>('newCompanyLeads').find({ isOnCompanion: false }).sort({ firstSeenAt: -1 }).toArray(),
    db.collection<DataQualityFlag>('dataQualitySweep').find().sort({ lastSyncedAt: -1 }).toArray(),
    db.collection<AnomalyFlag>('anomalyFlags').find().sort({ flaggedAt: -1 }).toArray(),
    db.collection<AdoptionMetric>('adoptionMetrics').find().sort({ computedAt: -1 }).limit(1).toArray(),
    db.collection<SyncLogEntry>('syncLog').find().sort({ startedAt: -1 }).limit(10).toArray(),
  ]);

  return NextResponse.json({
    dormancy,
    newLeads,
    dataQuality,
    anomalies,
    adoptionMetric: latestAdoptionMetric[0] ?? null,
    recentSyncRuns: lastSyncRuns,
  });
}
