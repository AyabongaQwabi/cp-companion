import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2) {
    return withAdminStatsCors(NextResponse.json({ query: q, results: {} }));
  }

  try {
    const prodDb = await getProductionDb();
    const companionDb = await getCompanionDb();
    const regex = { $regex: q, $options: 'i' };
    const [companies, users, appointments, sites, employees] = await Promise.all([
      prodDb
        .collection('companies')
        .find({ $or: [{ id: regex }, { 'details.name': regex }, { 'details.registrationNumber': regex }] })
        .project({ id: 1, details: 1 })
        .limit(8)
        .toArray(),
      prodDb
        .collection('users')
        .find({ $or: [{ id: regex }, { 'details.name': regex }, { 'details.surname': regex }, { 'details.email': regex }] })
        .project({ id: 1, details: 1, role: 1 })
        .limit(8)
        .toArray(),
      prodDb
        .collection('appointments')
        .find({ $or: [{ id: regex }, { 'details.company.name': regex }, { 'details.company.id': regex }] })
        .project({ id: 1, status: 1, details: 1 })
        .limit(8)
        .toArray(),
      companionDb
        .collection('siteDirectory')
        .find({ name: regex })
        .project({ name: 1, companyIds: 1, status: 1 })
        .limit(8)
        .toArray(),
      companionDb
        .collection('employeeDirectory')
        .find({ $or: [{ displayName: regex }, { idNumber: regex }] })
        .project({ displayName: 1, idNumber: 1, lastSeenAt: 1 })
        .limit(8)
        .toArray(),
    ]);

    return withAdminStatsCors(
      NextResponse.json({
        query: q,
        results: {
          companies,
          users,
          appointments,
          sites: sites.map((site) => ({ ...site, _id: String(site._id) })),
          employees: employees.map((employee) => ({ ...employee, _id: String(employee._id) })),
        },
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
