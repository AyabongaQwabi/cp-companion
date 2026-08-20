import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const sinceRaw = req.nextUrl.searchParams.get('since');
  const since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 5 * 60 * 1000);
  if (Number.isNaN(since.getTime())) {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid since timestamp' }, { status: 400 }));
  }

  try {
    const prodDb = await getProductionDb();
    const createdFilter = { 'tracking.0.date': { $gt: since } };
    const [appointments, companies, users] = await Promise.all([
      prodDb.collection('appointments').find(createdFilter).sort({ 'tracking.0.date': -1 }).limit(50).toArray(),
      prodDb.collection('companies').find(createdFilter).sort({ 'tracking.0.date': -1 }).limit(50).toArray(),
      prodDb.collection('users').find(createdFilter).sort({ 'tracking.0.date': -1 }).limit(50).toArray(),
    ]);

    return withAdminStatsCors(
      NextResponse.json({
        serverTime: new Date(),
        items: [
          ...appointments.map((doc) => ({ type: 'appointment', id: doc.id, label: doc.details?.company?.name || doc.id, createdAt: doc.tracking?.[0]?.date })),
          ...companies.map((doc) => ({ type: 'company', id: doc.id, label: doc.details?.name || doc.id, createdAt: doc.tracking?.[0]?.date })),
          ...users.map((doc) => ({ type: 'user', id: doc.id, label: `${doc.details?.name || ''} ${doc.details?.surname || ''}`.trim() || doc.id, createdAt: doc.tracking?.[0]?.date })),
        ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
