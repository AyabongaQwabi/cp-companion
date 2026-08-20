import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type { EmployeeDirectoryEntry, EmployeeStats } from '@/lib/types';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

/**
 * Single employee's directory entry + stats, keyed by the employeeDirectory _id returned from the
 * list route (GET /api/admin/employees) — not by idNumber, since a name-only-matched row has no
 * idNumber at all.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid employee id' }, { status: 400 }));
  }

  try {
    const companionDb = await getCompanionDb();
    const entry = await companionDb
      .collection<EmployeeDirectoryEntry>('employeeDirectory')
      .findOne({ _id: new ObjectId(id) as never });

    if (!entry) {
      return withAdminStatsCors(NextResponse.json({ error: 'Employee not found' }, { status: 404 }));
    }

    const stats = await companionDb
      .collection<EmployeeStats>('employeeStats')
      .findOne({ employeeDirectoryId: id });

    return withAdminStatsCors(
      NextResponse.json({ ...entry, _id: String(entry._id), stats: stats || null })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
