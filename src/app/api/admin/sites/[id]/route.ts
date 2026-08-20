import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type { SiteDirectoryEntry } from '@/lib/types';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

// Fields an admin may edit via PATCH. Deliberately excludes every derived field
// (name/normalizedNameKey/companyIds/appointmentCount/firstSeenAt/lastUsedAt/status/lastSyncedAt)
// — those are owned exclusively by syncSiteDirectory and must never be hand-edited, or the next
// sync run's counts would be based on a corrupted baseline.
const EDITABLE_FIELDS = [
  'address',
  'gpsCoordinates',
  'region',
  'siteType',
  'capacity',
  'onSiteContactName',
  'onSiteContactPhone',
  'accessRequirements',
  'accessCardTypicallyRequired',
  'notes',
] as const;

/**
 * Single site detail: full siteDirectory document + linked companies (companyIds resolved to
 * names via production.companies, read-only lookup) + a recent volume trend. Trend shape mirrors
 * CompanyProfile.employeeCountTrend ({ date, count }[], one point per month) for consistency with
 * the rest of the admin portal's trend charts — here `count` is appointment volume for that month
 * rather than employee headcount, computed on demand from this site's own appointments (bounded
 * by this one site's history, same read-on-demand pattern as GET /api/admin/employees/[id]'s
 * past-services history).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid site id' }, { status: 400 }));
  }

  try {
    const companionDb = await getCompanionDb();
    const site = await companionDb
      .collection<SiteDirectoryEntry>('siteDirectory')
      .findOne({ _id: new ObjectId(id) as never });

    if (!site) {
      return withAdminStatsCors(NextResponse.json({ error: 'Site not found' }, { status: 404 }));
    }

    let linkedCompanies: { companyId: string; companyName: string }[] = [];
    let monthlyTrend: { date: string; count: number }[] = [];

    if (site.companyIds.length > 0) {
      const prodDb = await getProductionDb();
      const [companies, appointments] = await Promise.all([
        prodDb
          .collection('companies')
          .find({ id: { $in: site.companyIds } })
          .project({ id: 1, 'details.name': 1 })
          .toArray(),
        prodDb
          .collection('appointments')
          .find({
            status: 'approved',
            'details.company.id': { $in: site.companyIds },
            'details.employees.sites.name': { $regex: `^${escapeRegex(site.name)}$`, $options: 'i' },
          })
          .project({ 'details.date': 1 })
          .toArray(),
      ]);

      linkedCompanies = companies.map((c) => ({
        companyId: (c as { id: string }).id,
        companyName: (c as { details?: { name?: string } }).details?.name || '',
      }));

      const countsByMonth = new Map<string, number>();
      for (const appt of appointments) {
        const date = (appt as { details?: { date?: string } }).details?.date;
        if (!date) continue;
        const monthKey = date.slice(0, 7); // "YYYY-MM"
        countsByMonth.set(monthKey, (countsByMonth.get(monthKey) || 0) + 1);
      }
      monthlyTrend = Array.from(countsByMonth.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, count]) => ({ date, count }));
    }

    return withAdminStatsCors(
      NextResponse.json({
        ...site,
        _id: String(site._id),
        linkedCompanies,
        monthlyTrend,
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}

/**
 * Updates only the admin-editable metadata fields (EDITABLE_FIELDS above). Any other key in the
 * request body is silently ignored rather than erroring, matching the low-friction PATCH style of
 * other admin metadata routes in this app (e.g. thread status) — the derived fields are simply
 * never in EDITABLE_FIELDS so they can't be set even if present in the body.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid site id' }, { status: 400 }));
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  const update: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) update[field] = body[field];
  }

  if (Object.keys(update).length === 0) {
    return withAdminStatsCors(
      NextResponse.json({ error: `No editable fields provided. Allowed: ${EDITABLE_FIELDS.join(', ')}` }, { status: 400 })
    );
  }

  try {
    const companionDb = await getCompanionDb();
    const directory = companionDb.collection<SiteDirectoryEntry>('siteDirectory');

    const result = await directory.findOneAndUpdate(
      { _id: new ObjectId(id) as never },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!result) {
      return withAdminStatsCors(NextResponse.json({ error: 'Site not found' }, { status: 404 }));
    }

    return withAdminStatsCors(NextResponse.json({ ...result, _id: String(result._id) }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
