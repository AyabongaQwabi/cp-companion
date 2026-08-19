import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';

/**
 * Exact-semantics delete, not a soft flag: copies the full, unmodified appointment document into
 * production.deleted_appointments, then deletes it from production.appointments — matching the
 * soft-delete pattern the real app already uses. Atomic in intent: the insert into
 * deleted_appointments must succeed before the delete from appointments runs; if the insert
 * fails, this aborts and leaves the original untouched. The one window this can't fully close is
 * the reverse case (delete succeeds, but the process dies before the audit log write below) — the
 * insert-then-delete ordering itself guarantees the appointment is never in neither collection.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { userId } = body;

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();
  const appointments = prodDb.collection('appointments');
  const deletedAppointments = prodDb.collection('deleted_appointments');

  const appointment = await appointments.findOne({ id, 'usersWhoCanManage.id': userId });
  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  const charge = await chargeForAction(userId, 'appointment.delete');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  try {
    await deletedAppointments.insertOne(appointment);
  } catch (err) {
    // Fail closed: if the copy into deleted_appointments doesn't succeed, never proceed to
    // delete the original — leave production.appointments untouched.
    await companionDb.collection('auditLog').insertOne({
      action: 'DELETE_APPOINTMENT_FAILED',
      appointmentId: id,
      userId,
      error: err instanceof Error ? err.message : String(err),
      at: new Date(),
    });
    return NextResponse.json({ error: 'Failed to archive appointment — nothing was deleted' }, { status: 500 });
  }

  await appointments.deleteOne({ _id: appointment._id });

  await companionDb.collection('auditLog').insertOne({
    action: 'DELETE_APPOINTMENT',
    appointmentId: id,
    userId,
    before: appointment,
    at: new Date(),
  });

  return NextResponse.json({ ok: true });
}
