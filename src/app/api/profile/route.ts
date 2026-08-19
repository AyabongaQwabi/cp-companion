import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { chargeForAction, getOrCreateWallet } from '@/lib/credits';

/**
 * Profile stats + production.users details in one round trip. Counts are scoped the same way
 * Insights scopes appointments (usersWhoCanManage.id) and the way the roster/companies features
 * are scoped (userId on cp_companion.employees; usersWhoCanManage/usersWhoCanEdit on
 * production.companies) — nothing here introduces a new scoping rule.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();

  const usersCollection = prodDb.collection('users');
  const user = await usersCollection.findOne({ id: userId });
  if (!user) {
    return NextResponse.json({ error: 'User not found in production.users' }, { status: 404 });
  }

  const [appointmentCount, deletedAppointmentCount, companyCount, employeeCount, wallet] =
    await Promise.all([
      prodDb.collection('appointments').countDocuments({ 'usersWhoCanManage.id': userId }),
      prodDb.collection('deleted_appointments').countDocuments({ 'usersWhoCanManage.id': userId }),
      prodDb.collection('companies').countDocuments({
        isDecomissioned: { $ne: true },
        $or: [{ 'usersWhoCanManage.id': userId }, { 'usersWhoCanEdit.id': userId }],
      }),
      companionDb.collection('employees').countDocuments({ userId, status: { $nin: ['inactive', 'terminated'] } }),
      getOrCreateWallet(userId),
    ]);

  return NextResponse.json({
    userId: user.id,
    details: {
      name: user.details?.name || '',
      surname: user.details?.surname || '',
      email: user.details?.email || '',
      contactNumber: user.details?.contactNumber || '',
    },
    stats: {
      appointmentCount: appointmentCount + deletedAppointmentCount,
      companyCount,
      employeeCount,
      creditBalance: wallet.balance,
    },
  });
}

interface UpdateProfileBody {
  userId: string;
  details: {
    name?: string;
    surname?: string;
    email?: string;
    contactNumber?: string;
  };
}

/**
 * Edits production.users.details.* — charged like any other priced action (Part E's
 * confirm-before-spend flow), but at the higher 50-credit "changes a real production account"
 * price rather than the usual few-credit UI actions. Only ever touches `details`, never role,
 * companiesManaging/companiesCanEdit, or the password hash.
 */
export async function PATCH(req: NextRequest) {
  const body: UpdateProfileBody = await req.json();
  const { userId, details } = body;

  if (!userId || !details) {
    return NextResponse.json({ error: 'userId and details required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const usersCollection = prodDb.collection('users');
  const user = await usersCollection.findOne({ id: userId });
  if (!user) {
    return NextResponse.json({ error: 'User not found in production.users' }, { status: 404 });
  }

  const charge = await chargeForAction(userId, 'profile.editDetails');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const updates: Record<string, string> = {};
  for (const [key, value] of Object.entries(details)) {
    if (value !== undefined) updates[`details.${key}`] = value.trim();
  }

  await usersCollection.updateOne({ _id: user._id }, { $set: updates });

  const companionDb = await getCompanionDb();
  await companionDb.collection('auditLog').insertOne({
    action: 'EDIT_PROFILE',
    userId,
    at: new Date(),
  });

  return NextResponse.json({ ok: true });
}
