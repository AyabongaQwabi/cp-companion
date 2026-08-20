import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

const COLLECTIONS: Record<string, string> = {
  appointment: 'deleted_appointments',
  company: 'deleted_companies',
  user: 'deleted_users',
};

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const type = req.nextUrl.searchParams.get('type') || '';
  const companyId = req.nextUrl.searchParams.get('companyId');
  const dateFrom = req.nextUrl.searchParams.get('dateFrom');
  const dateTo = req.nextUrl.searchParams.get('dateTo');
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get('page') || '0', 10) || 0);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '25', 10)));
  const types = type && COLLECTIONS[type] ? [type] : Object.keys(COLLECTIONS);

  try {
    const prodDb = await getProductionDb();
    const results = await Promise.all(
      types.map(async (entityType) => {
        const filter: Record<string, unknown> = {};
        if (companyId && entityType === 'appointment') filter['details.company.id'] = companyId;
        if (dateFrom || dateTo) {
          const created: Record<string, Date> = {};
          if (dateFrom) created.$gte = new Date(dateFrom);
          if (dateTo) created.$lte = new Date(dateTo);
          filter['tracking.0.date'] = created;
        }
        const collection = prodDb.collection(COLLECTIONS[entityType]);
        const [total, rows] = await Promise.all([
          collection.countDocuments(filter),
          collection.find(filter).sort({ 'tracking.0.date': -1 }).skip(page * pageSize).limit(pageSize).toArray(),
        ]);
        return { entityType, total, rows: rows.map((row) => ({ ...row, _id: String(row._id), entityType })) };
      })
    );

    return withAdminStatsCors(NextResponse.json({ groups: results, page, pageSize }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
