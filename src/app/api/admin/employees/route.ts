import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type { EmployeeDirectoryEntry, EmployeeStats } from '@/lib/types';

/**
 * Lists the admin employee directory (cp_companion.employeeDirectory + employeeStats), populated
 * by scripts/backfill-employee-directory.mjs from production.appointments — never queries
 * production live, always reads the pre-derived directory so this stays fast regardless of how
 * many appointments exist. Supports a simple name/idNumber search and pagination matching the
 * cp-redesign-admin Pagination component's 0-indexed page contract.
 */
export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const search = (req.nextUrl.searchParams.get('search') || '').trim();
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get('page') || '0', 10) || 0);

  try {
    const companionDb = await getCompanionDb();
    const directory = companionDb.collection<EmployeeDirectoryEntry>('employeeDirectory');

    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { displayName: { $regex: search, $options: 'i' } },
        { idNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const [totalCount, entries] = await Promise.all([
      directory.countDocuments(filter),
      directory
        .find(filter)
        .sort({ lastSeenAt: -1 })
        .skip(page * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .toArray(),
    ]);

    const directoryIds = entries.map((e) => String(e._id));
    const statsCollection = companionDb.collection<EmployeeStats>('employeeStats');
    const statsDocs = directoryIds.length
      ? await statsCollection.find({ employeeDirectoryId: { $in: directoryIds } }).toArray()
      : [];
    const statsById = new Map(statsDocs.map((s) => [s.employeeDirectoryId, s]));

    const rows = entries.map((entry) => ({
      ...entry,
      _id: String(entry._id),
      stats: statsById.get(String(entry._id)) || null,
    }));

    return withAdminStatsCors(
      NextResponse.json({
        employees: rows,
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
