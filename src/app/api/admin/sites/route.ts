import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type { SiteDirectoryEntry } from '@/lib/types';

/**
 * Lists cp_companion.siteDirectory — the client-worksite directory mined from
 * production.appointments.details.employees[].sites[] by syncSiteDirectory (see
 * src/lib/sync/site-directory.ts). Distinct from ClinicPlus's own two physical clinics
 * (Hendrina/Churchill, served by /api/admin/availability/capacity) and from cp_companion.sites
 * (RosterSite, a single user's personal convenience list) — see the SiteDirectoryEntry doc
 * comment in types.ts. Pagination follows the same 0-indexed page + fixed PAGE_SIZE convention as
 * GET /api/admin/employees (the other /api/admin/* list route), not the 1-indexed convention used
 * by non-admin routes like /api/employees.
 */
export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const search = (req.nextUrl.searchParams.get('search') || '').trim();
  const status = req.nextUrl.searchParams.get('status');
  const companyId = req.nextUrl.searchParams.get('companyId');
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get('page') || '0', 10) || 0);

  try {
    const companionDb = await getCompanionDb();
    const directory = companionDb.collection<SiteDirectoryEntry>('siteDirectory');

    const filter: Record<string, unknown> = {};
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }
    if (status === 'active' || status === 'dormant') {
      filter.status = status;
    }
    if (companyId) {
      filter.companyIds = companyId;
    }

    const [totalCount, entries] = await Promise.all([
      directory.countDocuments(filter),
      directory
        .find(filter)
        .sort({ lastUsedAt: -1 })
        .skip(page * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .toArray(),
    ]);

    return withAdminStatsCors(
      NextResponse.json({
        sites: entries.map((e) => ({ ...e, _id: String(e._id) })),
        page,
        pageCount: Math.ceil(totalCount / PAGE_SIZE),
        totalCount,
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
