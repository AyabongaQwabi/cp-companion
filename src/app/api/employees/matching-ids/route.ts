import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';

/**
 * Returns just the _ids of every roster employee matching the current search/occupation/group
 * filter — backs "select all matching" in EmployeeSelectionModal, so selecting "all" respects
 * whatever filter is active rather than silently selecting the entire roster.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const search = req.nextUrl.searchParams.get('search')?.trim();
  const occupation = req.nextUrl.searchParams.get('occupation');
  const groupId = req.nextUrl.searchParams.get('groupId');
  const companyId = req.nextUrl.searchParams.get('companyId');

  const query: Record<string, unknown> = { userId, status: { $nin: ['inactive', 'terminated'] } };
  if (occupation) {
    query.occupation = occupation;
  }
  if (groupId) {
    query.groupIds = groupId;
  }
  if (companyId) {
    query.companyIds = companyId;
  }
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = { $regex: escaped, $options: 'i' };
    query.$or = [{ name: regex }, { idNumber: regex }, { occupation: regex }];
  }

  const db = await getCompanionDb();
  const docs = await db
    .collection('employees')
    .find(query, { projection: { _id: 1 } })
    .toArray();

  return NextResponse.json({ ids: docs.map((d) => d._id.toString()) });
}
