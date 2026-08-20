import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { syncLegacyAuditEvents } from '@/lib/audit-legacy-sync';

/**
 * Hourly re-sync of legacy production.{appointments,companies,users}[].tracking entries into
 * cp_companion.audit_events (see src/lib/audit-legacy-sync.ts for the mapping rules and
 * scripts/backfill-audit-events.mjs for the original one-off/re-runnable backfill this route
 * effectively repeats on a schedule). Cadence: hourly, via an external scheduler (cron-job.org),
 * matching the existing /api/cron/sync pattern (see that route's own header comment) — NOT a
 * Vercel native cron, since this project is on Vercel's Hobby plan and native crons there are
 * capped at once/day. Auth follows /api/cron/sync exactly: a shared secret, CRON_SYNC_SECRET,
 * sent as a custom `X-Cron-Secret` header (not Vercel's own `Authorization: Bearer` scheme, which
 * is reserved for CRON_SECRET-gated native crons like process-account-deletions and
 * compliance-alerts).
 *
 * Idempotent upserts (deterministicLegacyEventId in audit-legacy-sync.ts) make over-frequent or
 * overlapping runs safe — re-importing the same tracking entry twice just $sets the same document
 * again, never creates a duplicate.
 *
 * Incremental scope limitation (documented, not guessed around): production.appointments and
 * production.companies have no updatedAt/similar field — confirmed by src/lib/sync/index.ts's own
 * comment on this exact point ("production.appointments/companies have no updatedAt field, only
 * a tracking[] array"). That module's workaround (filter on `tracking.date >= since`, from the
 * last successful run's cutoff, via cp_companion.syncLog) is reused here: this route scans only
 * documents whose tracking array has an entry newer than the last successful sync-audit-events
 * run, not the true full collection. Documents with NO tracking entry at all since the cutoff are
 * skipped entirely, which is correct (nothing new to import from them). There is no dedicated
 * syncLog-style cutoff table for this route; a simple in-request lookback window is used instead
 * (LOOKBACK_MS below) rather than adding a new collection just to track a cursor — safe because
 * upserts are idempotent, so a generous overlap window costs extra work, never incorrect data.
 */
const LOOKBACK_MS = 2 * 60 * 60 * 1000; // 2 hours — comfortably covers gaps if a run is missed or delayed

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
    const since = new Date(Date.now() - LOOKBACK_MS);
    const counts = await syncLegacyAuditEvents(prodDb, companionDb, since);

    return NextResponse.json({ ok: true, since: since.toISOString(), counts });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
