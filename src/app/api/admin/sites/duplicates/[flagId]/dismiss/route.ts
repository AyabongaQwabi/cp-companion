import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type { SiteDirectoryDuplicateFlag } from '@/lib/types';

/**
 * "These are actually different sites, don't ask again" — marks one
 * siteDirectoryDuplicateFlags row 'dismissed' without touching either siteDirectory document.
 * Kept as its own route (rather than a body-flag variant on POST /api/admin/sites/merge) because
 * dismiss never touches siteDirectory at all, only the flag itself — folding it into the merge
 * route would make that route's request shape ambiguous about whether a merge happened. The
 * dismissed pair is permanently excluded from future detectDuplicates runs (see
 * resolvedPairKeys in site-directory.ts), so it will not resurface.
 */
export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

interface DismissBody {
  adminId: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ flagId: string }> }) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const { flagId } = await params;
  if (!ObjectId.isValid(flagId)) {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid flag id' }, { status: 400 }));
  }

  let body: DismissBody;
  try {
    body = await req.json();
  } catch {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  if (!body.adminId) {
    return withAdminStatsCors(NextResponse.json({ error: 'adminId required' }, { status: 400 }));
  }

  try {
    const companionDb = await getCompanionDb();
    const flags = companionDb.collection<SiteDirectoryDuplicateFlag>('siteDirectoryDuplicateFlags');

    const now = new Date();
    const result = await flags.findOneAndUpdate(
      { _id: new ObjectId(flagId) as never },
      { $set: { status: 'dismissed', resolvedAt: now, resolvedByAdminId: body.adminId } },
      { returnDocument: 'after' }
    );

    if (!result) {
      return withAdminStatsCors(NextResponse.json({ error: 'Flag not found' }, { status: 404 }));
    }

    return withAdminStatsCors(NextResponse.json({ ...result, _id: String(result._id) }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
