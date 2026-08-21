import { NextRequest, NextResponse } from 'next/server';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { getProductionDb } from '@/lib/mongodb';
import type { ClinicPlusUserDocument } from '@/lib/types';

export function OPTIONS() {
  return adminStatsCorsPreflight();
}

function displayName(user: ClinicPlusUserDocument) {
  return [user.details?.name, user.details?.surname].filter(Boolean).join(' ').trim() || user.details?.email || 'Customer';
}

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const search = req.nextUrl.searchParams.get('q')?.trim();
  const role = req.nextUrl.searchParams.get('role') || 'client';
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') || 50), 1), 250);
  const query: Record<string, unknown> = {
    role,
    'details.email': { $type: 'string', $ne: '' },
  };
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ id: regex }, { 'details.name': regex }, { 'details.surname': regex }, { 'details.email': regex }];
  }

  const db = await getProductionDb();
  const [total, users] = await Promise.all([
    db.collection<ClinicPlusUserDocument>('users').countDocuments(query),
    (await db
      .collection<ClinicPlusUserDocument>('users')
      .find(query)
      .project({ id: 1, role: 1, details: 1, companiesCanEdit: 1, companiesManaging: 1 })
      .sort({ 'details.email': 1 })
      .limit(limit)
      .toArray()) as unknown as ClinicPlusUserDocument[],
  ]);

  return withAdminStatsCors(
    NextResponse.json({
      total,
      users: users.map((user) => ({
        id: user.id,
        name: displayName(user),
        email: user.details?.email || '',
        role: user.role,
        contactNumber: user.details?.contactNumber || '',
        companies: [...(user.companiesCanEdit || []), ...(user.companiesManaging || [])],
      })),
    })
  );
}
