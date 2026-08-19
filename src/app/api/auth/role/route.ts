import { NextRequest, NextResponse } from 'next/server';
import { isSuperadmin } from '@/lib/roles';

/**
 * Cheap client-side lookup so the UI can conditionally show superadmin-only links (e.g. the
 * service-validity settings page). This is UX only — every route that actually gates on
 * superadmin re-checks server-side independently and fails closed regardless of what this
 * endpoint returns.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  return NextResponse.json({ superadmin: await isSuperadmin(userId) });
}
