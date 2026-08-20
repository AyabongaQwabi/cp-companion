import { NextResponse } from 'next/server';

/**
 * cp-redesign-admin (cp-redesign-admin.vercel.app or similar) calls these routes cross-origin from
 * the browser, unlike every other consumer of this API (server-to-server cron, or same-origin
 * Companion pages) — so these are the only routes in the app that need CORS headers. Scoped here
 * rather than a blanket next.config.ts CORS policy so the rest of the API surface stays
 * same-origin-only by default.
 */
export function withAdminStatsCors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'x-admin-stats-secret, content-type');
  return res;
}

export function adminStatsCorsPreflight(): NextResponse {
  return withAdminStatsCors(new NextResponse(null, { status: 204 }));
}
