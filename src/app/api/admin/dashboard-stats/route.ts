import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb } from '@/lib/mongodb';
import { getDashboardStats } from '@/lib/dashboard-stats';

/**
 * Backs cp-redesign-admin's dashboard home page, replacing the legacy GET_STATS/RECEIVE_STATS
 * socket round-trip to clinicplus-server-latest-stable-version (which took 5+ minutes — see
 * src/lib/dashboard-stats.ts for why). Computed live against production via indexed aggregation
 * rather than the hourly sync cache, since "Today"/"Yesterday" must reflect same-day bookings.
 *
 * Auth: shared-secret header, same pattern as /api/cron/sync — cp-redesign-admin has no persisted
 * auth token to forward, so a secret configured in both apps' env is the gate.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.ADMIN_STATS_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'ADMIN_STATS_SECRET is not configured' }, { status: 500 });
  }

  const provided = req.headers.get('x-admin-stats-secret');
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const typeParam = req.nextUrl.searchParams.get('type');
  const type = typeParam === 'x-rays' ? 'x-rays' : 'all';

  try {
    const prodDb = await getProductionDb();
    const result = await getDashboardStats(prodDb, type);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
