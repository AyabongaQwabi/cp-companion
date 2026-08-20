import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * cp-redesign-admin (cp-redesign-admin.vercel.app or similar) calls these routes cross-origin from
 * the browser, unlike every other consumer of this API (server-to-server cron, or same-origin
 * Companion pages) — so these are the only routes in the app that need CORS headers. Scoped here
 * rather than a blanket next.config.ts CORS policy so the rest of the API surface stays
 * same-origin-only by default.
 *
 * Methods/headers cover every /api/admin/* route added so far, including the write routes
 * (employees, availability, messaging) added alongside the original read-only dashboard/analytics
 * routes — POST/PATCH and DELETE are included so a future write route doesn't need a third
 * variant of this helper.
 */
export function withAdminStatsCors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'x-admin-stats-secret, content-type');
  return res;
}

export function adminStatsCorsPreflight(): NextResponse {
  return withAdminStatsCors(new NextResponse(null, { status: 204 }));
}

/**
 * Shared secret check used by every /api/admin/* route — cp-redesign-admin has no persisted auth
 * token to forward (see dashboard-stats/finance-analytics route comments for the original
 * rationale), so ADMIN_STATS_SECRET sent as `x-admin-stats-secret` is the gate. Returns a ready
 * -to-return NextResponse when the check fails (500 if unconfigured, 401 if the header doesn't
 * match), or null when the caller is authorized and the route should proceed.
 */
export function checkAdminStatsSecret(req: NextRequest): NextResponse | null {
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
  return null;
}
