import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { syncDateCleanup } from '@/lib/sync/date-cleanup';

/**
 * Daily job (Vercel-native cron, see vercel.json). Fixes malformed production.appointments
 * details.date values — missing/null/empty/garbled strings caused by an HTML date picker bug.
 * Unlike the lifecycle-status job, this one DOES overwrite an existing field (details.date) by
 * design; see src/lib/sync/date-cleanup.ts for the recovery rules and audit logging.
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
    const result = await syncDateCleanup(prodDb, companionDb);

    await companionDb.collection('syncLog').insertOne({
      runId: `date-cleanup-${runStartedAt.getTime()}`,
      startedAt: runStartedAt,
      finishedAt: new Date(),
      status: result.errors > 0 ? (result.processed > 0 ? 'partial' : 'failed') : 'success',
      jobs: [{ name: 'date-cleanup', processed: result.processed, errors: result.errors, durationMs: Date.now() - runStartedAt.getTime() }],
    });

    return NextResponse.json({ ok: result.errors === 0, ...result });
  } catch (err) {
    await companionDb.collection('auditLog').insertOne({
      action: 'DATE_CLEANUP_JOB_FAILED',
      error: err instanceof Error ? err.message : String(err),
      at: new Date(),
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
