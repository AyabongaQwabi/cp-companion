import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type { SiteDirectoryDuplicateFlag, SiteDirectoryEntry } from '@/lib/types';

/**
 * Merges mergeSiteId into keepSiteId: unions companyIds, sums appointmentCount, keeps the
 * earliest firstSeenAt and latest lastUsedAt across both, then deletes the merged document.
 * Admin-editable metadata (address/region/notes/etc.) is NOT auto-merged — keepSiteId's own
 * values are left untouched, since guessing which of two admins' notes/contacts "wins" is exactly
 * the kind of silent-corruption risk this whole review-queue flow exists to avoid. An admin who
 * wants mergeSiteId's metadata carried over should manually copy it via PATCH before merging.
 *
 * Any siteDirectoryDuplicateFlags row referencing either id (as siteIdA or siteIdB, in either
 * flag) is marked 'merged' — including flags between one of these two sites and some unrelated
 * third site, since after the merge that flag's siteIdB no longer exists as a standalone site (it
 * still means the pair should stop being reviewed against a now-deleted id).
 */
export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

interface MergeBody {
  keepSiteId: string;
  mergeSiteId: string;
  adminId?: string;
}

export async function POST(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  let body: MergeBody;
  try {
    body = await req.json();
  } catch {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  const { keepSiteId, mergeSiteId, adminId } = body;

  if (!keepSiteId || !mergeSiteId) {
    return withAdminStatsCors(
      NextResponse.json({ error: 'keepSiteId and mergeSiteId required' }, { status: 400 })
    );
  }
  if (keepSiteId === mergeSiteId) {
    return withAdminStatsCors(
      NextResponse.json({ error: 'keepSiteId and mergeSiteId must be different' }, { status: 400 })
    );
  }
  if (!ObjectId.isValid(keepSiteId) || !ObjectId.isValid(mergeSiteId)) {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid site id' }, { status: 400 }));
  }

  try {
    const companionDb = await getCompanionDb();
    const directory = companionDb.collection<SiteDirectoryEntry>('siteDirectory');
    const flags = companionDb.collection<SiteDirectoryDuplicateFlag>('siteDirectoryDuplicateFlags');

    const [keepSite, mergeSite] = await Promise.all([
      directory.findOne({ _id: new ObjectId(keepSiteId) as never }),
      directory.findOne({ _id: new ObjectId(mergeSiteId) as never }),
    ]);

    if (!keepSite) {
      return withAdminStatsCors(NextResponse.json({ error: 'keepSiteId not found' }, { status: 404 }));
    }
    if (!mergeSite) {
      return withAdminStatsCors(NextResponse.json({ error: 'mergeSiteId not found' }, { status: 404 }));
    }

    const mergedCompanyIds = Array.from(new Set([...keepSite.companyIds, ...mergeSite.companyIds]));
    const firstSeenAt =
      new Date(keepSite.firstSeenAt) < new Date(mergeSite.firstSeenAt) ? keepSite.firstSeenAt : mergeSite.firstSeenAt;
    const lastUsedAt =
      new Date(keepSite.lastUsedAt) > new Date(mergeSite.lastUsedAt) ? keepSite.lastUsedAt : mergeSite.lastUsedAt;
    const appointmentCount = keepSite.appointmentCount + mergeSite.appointmentCount;

    await directory.updateOne(
      { _id: new ObjectId(keepSiteId) as never },
      {
        $set: {
          companyIds: mergedCompanyIds,
          firstSeenAt,
          lastUsedAt,
          appointmentCount,
        },
      }
    );

    await directory.deleteOne({ _id: new ObjectId(mergeSiteId) as never });

    const now = new Date();
    await flags.updateMany(
      { $or: [{ siteIdA: keepSiteId }, { siteIdB: keepSiteId }, { siteIdA: mergeSiteId }, { siteIdB: mergeSiteId }] },
      { $set: { status: 'merged', resolvedAt: now, ...(adminId ? { resolvedByAdminId: adminId } : {}) } }
    );

    const updatedKeepSite = await directory.findOne({ _id: new ObjectId(keepSiteId) as never });

    return withAdminStatsCors(
      NextResponse.json({
        ok: true,
        keptSite: updatedKeepSite ? { ...updatedKeepSite, _id: String(updatedKeepSite._id) } : null,
        mergedSiteId: mergeSiteId,
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
