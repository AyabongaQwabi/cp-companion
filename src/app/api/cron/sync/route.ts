import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { runSyncPipeline } from '@/lib/sync';

/**
 * Hourly production-sync/enrichment pipeline (Section 0). Invoked by an external scheduler
 * (cron-job.org, not Vercel's native cron — see the deploy notes for why: this project is on
 * Vercel's Hobby plan, whose native vercel.json crons are capped at once/day). Auth is a shared
 * secret sent as a custom header, not the URL alone — the URL sits unguarded in cron-job.org's
 * own dashboard, so the header is the only real gate.
 *
 * GET, not POST: cron-job.org's free tier supports both, but GET means the exact same request
 * (with no body) can be triggered manually from a browser for verification, and is the simplest
 * possible thing for a scheduler to fire repeatedly.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SYNC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SYNC_SECRET is not configured' }, { status: 500 });
  }

  const provided = req.headers.get('x-cron-secret');
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [prodDb, companionDb] = await Promise.all([getProductionDb(), getCompanionDb()]);
    const result = await runSyncPipeline(prodDb, companionDb);

    return NextResponse.json({
      ok: result.status !== 'failed',
      runId: result.runId,
      status: result.status,
      jobs: result.jobs,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
