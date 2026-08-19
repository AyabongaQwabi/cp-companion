import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';

/**
 * Distinct occupations actually present on the roster — used to populate the occupation filter
 * dropdown in EmployeeSelectionModal without loading the whole roster client-side just to
 * compute this. Distinct from cp_companion.occupations (the full reusable catalog, which may
 * contain occupations no current employee has).
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const db = await getCompanionDb();
  const occupations = await db
    .collection('employees')
    .distinct('occupation', { userId, status: { $nin: ['inactive', 'terminated'] }, occupation: { $ne: '' } });

  return NextResponse.json({ occupations: occupations.sort() });
}
