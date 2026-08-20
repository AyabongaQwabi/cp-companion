import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { runDbBackup } from '@/lib/db-backup';

// Dumping production's larger collections (e.g. appointments, ~34k docs) has been observed to
// take several minutes on this Atlas cluster's current tier. Request the longest duration this
// plan allows; Hobby caps at 60s regardless of this value, in which case this job WILL time out
// on the largest collections and Vercel's function plan needs upgrading (or the cluster tier does).
export const maxDuration = 800;

/**
 * Daily job (Vercel-native cron, see vercel.json). Dumps every collection in production and
 * cp_companion to newline-delimited EJSON, gzips each collection, and uploads to Cloudflare R2
 * (S3-compatible object storage, no egress fees) at
 * db-backups/<timestamp>/<db>/<collection>.jsonl.gz. After each run, deletes all but the 3 most
 * recent backup folders so storage cost stays flat. See src/lib/db-backup.ts.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runStartedAt = new Date();
  const companionDb = await getCompanionDb();

  try {
    const result = await runDbBackup();

    await companionDb.collection('syncLog').insertOne({
      runId: `db-backup-${runStartedAt.getTime()}`,
      startedAt: runStartedAt,
      finishedAt: new Date(),
      status: 'success',
      jobs: [
        {
          name: 'db-backup',
          runPrefix: result.runPrefix,
          keptRuns: result.retention.keptRuns,
          deletedRuns: result.retention.deletedRuns,
          durationMs: Date.now() - runStartedAt.getTime(),
        },
      ],
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await companionDb.collection('auditLog').insertOne({
      action: 'DB_BACKUP_JOB_FAILED',
      error: err instanceof Error ? err.message : String(err),
      at: new Date(),
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
