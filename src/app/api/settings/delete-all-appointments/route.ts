import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';

interface DeleteAllBody {
  userId: string;
  confirmationText: string;
}

/**
 * Bulk delete, scoped strictly to appointments this user manages (usersWhoCanManage.id) — same
 * copy-then-delete, fail-closed pattern as the single-appointment delete
 * (appointments/[id]/delete/route.ts), just applied to the whole matching set at once. Requires
 * typed "DELETE ALL" confirmation since this is destructive at scale, not a single click.
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
  const appointments = prodDb.collection('appointments');
  const deletedAppointments = prodDb.collection('deleted_appointments');

  const toDelete = await appointments.find({ 'usersWhoCanManage.id': userId }).toArray();
  if (toDelete.length === 0) {
    return NextResponse.json({ ok: true, deletedCount: 0 });
  }

  const charge = await chargeForAction(userId, 'settings.deleteAllAppointments');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  try {
    await deletedAppointments.insertMany(toDelete);
  } catch (err) {
    await companionDb.collection('auditLog').insertOne({
      action: 'DELETE_ALL_APPOINTMENTS_FAILED',
      userId,
      error: err instanceof Error ? err.message : String(err),
      at: new Date(),
    });
    return NextResponse.json(
      { error: 'Failed to archive appointments — nothing was deleted' },
      { status: 500 }
    );
  }

  const ids = toDelete.map((a) => a._id);
  await appointments.deleteMany({ _id: { $in: ids } });

  await companionDb.collection('auditLog').insertOne({
    action: 'DELETE_ALL_APPOINTMENTS',
    userId,
    deletedCount: toDelete.length,
    deletedAppointmentIds: toDelete.map((a) => a.id),
    at: new Date(),
  });

  return NextResponse.json({ ok: true, deletedCount: toDelete.length });
}
