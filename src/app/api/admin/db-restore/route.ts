import { NextRequest, NextResponse } from 'next/server';
import { listBackupRuns, runDbRestore } from '@/lib/db-restore';
import { getCompanionDb } from '@/lib/mongodb';

// 300 is the max Vercel Hobby allows (Builder rejects deploys with anything higher).
export const maxDuration = 300;

/**
 * Destructive, rarely-used admin operation — deliberately NOT wired into admin-stats-cors.ts's
 * CORS allowlist like the read-only /api/admin/* routes, so it can only ever be called
 * server-to-server (curl, scripts/restore-db-from-r2.mjs), never from a browser. Auth reuses
 * ADMIN_STATS_SECRET (x-admin-stats-secret header) since this is the same "no persisted admin
 * session to forward" situation those routes already solve for.
 *
 * GET  ?list=1                                    -> list available backup run timestamps
 * POST { run, dbName, drop?, confirm: true }       -> restore one db from one backup run
 *
 * confirm must be exactly `true` in the JSON body — a missing/falsy value is rejected before any
 * database write happens, since there's no interactive prompt possible over HTTP the way
 * scripts/restore-db-from-r2.mjs has one.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.ADMIN_STATS_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'ADMIN_STATS_SECRET is not configured' }, { status: 500 });
  }
  if (req.headers.get('x-admin-stats-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runs = await listBackupRuns();
  return NextResponse.json({ ok: true, runs });
}

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_STATS_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'ADMIN_STATS_SECRET is not configured' }, { status: 500 });
  }
  if (req.headers.get('x-admin-stats-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { run, dbName, drop, confirm } = body as {
    run?: string;
    dbName?: string;
    drop?: boolean;
    confirm?: boolean;
  };

  if (confirm !== true) {
    return NextResponse.json(
      { error: 'Refusing to restore without confirm: true in the request body' },
      { status: 400 }
    );
  }
  if (!run || typeof run !== 'string') {
    return NextResponse.json({ error: '"run" (backup timestamp) is required' }, { status: 400 });
  }
  if (dbName !== 'production' && dbName !== 'cp_companion') {
    return NextResponse.json(
      { error: '"dbName" must be "production" or "cp_companion"' },
      { status: 400 }
    );
  }

  const companionDb = await getCompanionDb();

  try {
    const result = await runDbRestore({ run, dbName, drop: Boolean(drop) });
    await companionDb.collection('auditLog').insertOne({
      action: 'DB_RESTORE_RUN',
      run,
      dbName,
      drop: Boolean(drop),
      collections: result.collections,
      at: new Date(),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await companionDb.collection('auditLog').insertOne({
      action: 'DB_RESTORE_FAILED',
      run,
      dbName,
      drop: Boolean(drop),
      error: err instanceof Error ? err.message : String(err),
      at: new Date(),
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
