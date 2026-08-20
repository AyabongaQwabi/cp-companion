import { NextRequest, NextResponse } from 'next/server';
import moment from 'moment';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { computeAndCacheFinanceAnalytics } from '@/lib/sync/finance-analytics';
import type { FinanceAnalyticsCache } from '@/lib/types';
import { adminStatsCorsPreflight, withAdminStatsCors } from '@/lib/admin-stats-cors';

/**
 * Backs cp-redesign-admin's Analytics page, replacing the legacy GET_FINANCE_ANALYTICS socket
 * round-trip to clinicplus-server-latest-stable-version (which loaded the full month's
 * appointments plus entire companies/users collections into memory — see
 * src/lib/sync/finance-analytics.ts). Reads from the hourly sync cache
 * (financeAnalyticsCache) for the current/previous month; any other month is computed on demand
 * and written through to that same cache so a repeat request is instant.
 *
 * Auth: shared-secret header, same pattern as /api/cron/sync and /api/admin/dashboard-stats.
 * Called cross-origin from the browser (cp-redesign-admin is a separate deployment), so CORS
 * headers are required — see src/lib/admin-stats-cors.ts.
 */
export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function GET(req: NextRequest) {
  const secret = process.env.ADMIN_STATS_SECRET;
  if (!secret) {
    return withAdminStatsCors(
      NextResponse.json({ error: 'ADMIN_STATS_SECRET is not configured' }, { status: 500 })
    );
  }

  const provided = req.headers.get('x-admin-stats-secret');
  if (provided !== secret) {
    return withAdminStatsCors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  const dateParam = req.nextUrl.searchParams.get('date'); // "01-MMMM-YYYY", matches the admin app's existing format
  const typeParam = req.nextUrl.searchParams.get('type');
  const type = typeParam === 'x-rays' ? 'x-rays' : 'all';

  const monthKey = dateParam
    ? moment(dateParam, 'DD-MMMM-YYYY').format('YYYY-MM')
    : moment().format('YYYY-MM');

  if (!moment(monthKey, 'YYYY-MM', true).isValid()) {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid date' }, { status: 400 }));
  }

  try {
    const companionDb = await getCompanionDb();
    const cached = await companionDb
      .collection<FinanceAnalyticsCache>('financeAnalyticsCache')
      .findOne({ monthKey, type });

    if (cached) {
      return withAdminStatsCors(NextResponse.json(cached));
    }

    const prodDb = await getProductionDb();
    const computed = await computeAndCacheFinanceAnalytics(prodDb, companionDb, monthKey, type);
    return withAdminStatsCors(NextResponse.json(computed));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      )
    );
  }
}
