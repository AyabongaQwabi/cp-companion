import { NextRequest, NextResponse } from 'next/server';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { getAdminCompanionDb, getCompanionDb } from '@/lib/mongodb';

export function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function GET(req: NextRequest) {
  const unauthorized = checkAdminStatsSecret(req);
  if (unauthorized) return unauthorized;

  const adminUserId = req.nextUrl.searchParams.get('adminUserId');
  if (!adminUserId) {
    return withAdminStatsCors(NextResponse.json({ error: 'adminUserId is required' }, { status: 400 }));
  }

  const [adminDb, companionDb] = await Promise.all([getAdminCompanionDb(), getCompanionDb()]);
  const [subscription, payments, pending] = await Promise.all([
    adminDb.collection('adminSubscriptions').findOne({ adminUserId, plan: 'standard' }),
    adminDb
      .collection('adminPaymentEvents')
      .find({ adminUserId })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray(),
    companionDb
      .collection('pendingCheckouts')
      .find({ adminUserId, purpose: 'admin_subscription' })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray(),
  ]);

  return withAdminStatsCors(
    NextResponse.json({
      subscription,
      payments,
      pending,
    })
  );
}
