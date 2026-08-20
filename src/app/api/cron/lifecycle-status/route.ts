import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { syncLifecycleStatus } from '@/lib/sync/lifecycle-status';

/**
 * Daily job (Vercel-native cron, see vercel.json — appointment dates only change day-to-day, so
 * hourly would be pure waste). Enriches production.appointments with additive-only lifecycle
 * fields; see src/lib/sync/lifecycle-status.ts for the full rule set. Never edits or removes any
 * existing field on an appointment document.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runStartedAt = new Date();
  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();

  try {
    const result = await syncLifecycleStatus(prodDb);

    await companionDb.collection('syncLog').insertOne({
      runId: `lifecycle-status-${runStartedAt.getTime()}`,
      startedAt: runStartedAt,
      finishedAt: new Date(),
      status: result.errors > 0 ? (result.processed > 0 ? 'partial' : 'failed') : 'success',
      jobs: [{ name: 'lifecycle-status', processed: result.processed, errors: result.errors, durationMs: Date.now() - runStartedAt.getTime() }],
    });

    return NextResponse.json({ ok: result.errors === 0, ...result });
  } catch (err) {
    await companionDb.collection('auditLog').insertOne({
      action: 'LIFECYCLE_STATUS_JOB_FAILED',
      error: err instanceof Error ? err.message : String(err),
      at: new Date(),
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
