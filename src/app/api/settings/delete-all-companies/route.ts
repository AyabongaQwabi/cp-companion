import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';

interface DeleteAllBody {
  userId: string;
  confirmationText: string;
}

/**
 * The highest blast-radius action in the app if the scope is wrong: MUST only ever touch
 * companies where usersWhoCanManage includes this user — never anything close to a global wipe
 * of ClinicPlus's companies. The query below is the entire safety boundary; it is deliberately
 * NOT `usersWhoCanEdit` (edit rights are not manage rights) and deliberately not unscoped. Same
 * copy-then-delete, fail-closed pattern as appointments, into a new production.deleted_companies
 * collection mirroring deleted_appointments.
 */
export async function POST(req: NextRequest) {
  const body: DeleteAllBody = await req.json();
  const { userId, confirmationText } = body;

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  if (confirmationText !== 'DELETE ALL') {
    return NextResponse.json({ error: 'Type DELETE ALL to confirm' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();
  const companies = prodDb.collection('companies');
  const deletedCompanies = prodDb.collection('deleted_companies');

  // Scope constraint is non-negotiable: usersWhoCanManage.id === userId, nothing broader.
  const toDelete = await companies.find({ 'usersWhoCanManage.id': userId }).toArray();
  if (toDelete.length === 0) {
    return NextResponse.json({ ok: true, deletedCount: 0 });
  }

  const charge = await chargeForAction(userId, 'settings.deleteAllCompanies');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  try {
    await deletedCompanies.insertMany(toDelete);
  } catch (err) {
    await companionDb.collection('auditLog').insertOne({
      action: 'DELETE_ALL_COMPANIES_FAILED',
      userId,
      error: err instanceof Error ? err.message : String(err),
      at: new Date(),
    });
    return NextResponse.json(
      { error: 'Failed to archive companies — nothing was deleted' },
      { status: 500 }
    );
  }

  const ids = toDelete.map((c) => c._id);
  await companies.deleteMany({ _id: { $in: ids } });

  await companionDb.collection('auditLog').insertOne({
    action: 'DELETE_ALL_COMPANIES',
    userId,
    deletedCount: toDelete.length,
    deletedCompanyIds: toDelete.map((c) => c.id),
    at: new Date(),
  });

  return NextResponse.json({ ok: true, deletedCount: toDelete.length });
}
