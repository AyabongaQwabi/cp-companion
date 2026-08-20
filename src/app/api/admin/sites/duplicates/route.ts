import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type { SiteDirectoryDuplicateFlag, SiteDirectoryEntry } from '@/lib/types';

/**
 * Lists pending fuzzy-duplicate flags from cp_companion.siteDirectoryDuplicateFlags (populated by
 * syncSiteDirectory's detectDuplicates pass — see src/lib/sync/site-directory.ts), resolved to
 * include both sites' current names/appointmentCounts so the admin review UI doesn't need a
 * second round trip per row. Only 'pending' flags are returned — 'merged'/'dismissed' rows are
 * historical record only, not surfaced here.
 */
export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  try {
    const companionDb = await getCompanionDb();
    const flags = await companionDb
      .collection<SiteDirectoryDuplicateFlag>('siteDirectoryDuplicateFlags')
      .find({ status: 'pending' })
      .sort({ similarityScore: -1 })
      .toArray();

    const siteIds = Array.from(
      new Set(flags.flatMap((f) => [f.siteIdA, f.siteIdB]).filter((sid) => ObjectId.isValid(sid)))
    );

    const sites = siteIds.length
      ? await companionDb
          .collection<SiteDirectoryEntry>('siteDirectory')
          .find({ _id: { $in: siteIds.map((sid) => new ObjectId(sid)) } as never })
          .project({ name: 1, appointmentCount: 1, status: 1 })
          .toArray()
      : [];

    const sitesById = new Map(sites.map((s) => [String(s._id), s]));

    const rows = flags.map((flag) => ({
      ...flag,
      _id: String(flag._id),
      siteA: sitesById.get(flag.siteIdA)
        ? {
            _id: flag.siteIdA,
            name: sitesById.get(flag.siteIdA)!.name,
            appointmentCount: sitesById.get(flag.siteIdA)!.appointmentCount,
            status: sitesById.get(flag.siteIdA)!.status,
          }
        : null,
      siteB: sitesById.get(flag.siteIdB)
        ? {
            _id: flag.siteIdB,
            name: sitesById.get(flag.siteIdB)!.name,
            appointmentCount: sitesById.get(flag.siteIdB)!.appointmentCount,
            status: sitesById.get(flag.siteIdB)!.status,
          }
        : null,
    }));

    return withAdminStatsCors(NextResponse.json({ duplicates: rows, totalCount: rows.length }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
