import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { isDateBlocked, blockedDateReason, resolveClinicLimit } from '@/lib/booking-rules';
import { chargeForAction } from '@/lib/credits';
import type { AppointmentDocument } from '@/lib/types';

/**
 * Single appointment detail — read-only, free (appointment.view). Scoped to the requesting
 * user's usersWhoCanManage the same way as the list route; a user who isn't on the appointment
 * gets a 404 rather than leaking that the id exists.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const appointment = await prodDb
    .collection('appointments')
    .findOne({ id, 'usersWhoCanManage.id': userId });

  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  return NextResponse.json(appointment);
}

interface EditAppointmentBody {
  userId: string;
  date?: string;
  clinic?: string;
  companyNameOnMedical?: string;
  companyResponsibleForPayment?: string;
  purchaseOrderNumber?: string | null;
}

/**
 * Edits appointment-level fields only — date, clinic, companyNameOnMedical,
 * companyResponsibleForPayment, purchaseOrderNumber — the same fields
 * cp-redesign-admin/src/views/appointments/appointment/edit/index.js exposes as editable at the
 * top level (its Company field is disabled there; sites/access-card pricing was removed from
 * invoicing entirely per clinicplus-constants.ts, so there's nothing site-level to edit here).
 * Deliberately never touches status, payment.hasBeenPaid, payment.proofOfPayment, employees,
 * usersWhoCanManage, or any other field — those have their own dedicated endpoints or are frozen
 * by design (per the spec: never set status: 'approved' from this app).
 *
 * Any edit that changes date or clinic re-runs the exact same booking-validity checks used at
 * creation (blocked dates, per-clinic per-date headcount limit) before saving, excluding this
 * appointment's own existing headcount from the same-day count it's being compared against — an
 * edit must never be allowed to produce an appointment that couldn't have been created fresh.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body: EditAppointmentBody = await req.json();
  const { userId, date, clinic, companyNameOnMedical, companyResponsibleForPayment, purchaseOrderNumber } = body;

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();
  const appointments = prodDb.collection<AppointmentDocument & { _id: unknown }>('appointments');

  const existing = await appointments.findOne({ id, 'usersWhoCanManage.id': userId });
  if (!existing) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  const nextDate = date ?? existing.details.date;
  const nextClinic = clinic ?? existing.details.clinic;
  const changingDateOrClinic = nextDate !== existing.details.date || nextClinic !== existing.details.clinic;

  if (changingDateOrClinic) {
    if (isDateBlocked(nextDate)) {
      return NextResponse.json({ error: blockedDateReason(nextDate) }, { status: 422 });
    }

    const settingsDocs = await prodDb.collection('systemSettings').find().toArray();
    const limits: Record<string, number> = settingsDocs[0]?.limits || {};
    const limit = resolveClinicLimit(limits, nextClinic);

    const dayStart = new Date(nextDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(nextDate);
    dayEnd.setHours(23, 59, 59, 999);

    const sameDayAppointments = await prodDb
      .collection('appointments')
      .find({
        'details.clinic': nextClinic,
        'details.date': { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
        id: { $ne: id },
      })
      .toArray();
    const currentBookings = sameDayAppointments.reduce(
      (acc, a) => acc + (a.details?.employees?.length || 0),
      0
    );
    const thisAppointmentHeadcount = existing.details.employees.length;

    if (currentBookings + thisAppointmentHeadcount > limit) {
      return NextResponse.json(
        {
          error: `Cannot move this appointment. The clinic limit for ${nextClinic} on ${nextDate} is ${limit} employees. Currently booked (excluding this appointment): ${currentBookings}, this appointment has: ${thisAppointmentHeadcount}.`,
        },
        { status: 422 }
      );
    }
  }

  const charge = await chargeForAction(userId, 'appointment.editDetails');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const updates: Record<string, unknown> = {};
  if (date !== undefined) updates['details.date'] = date;
  if (clinic !== undefined) updates['details.clinic'] = clinic;
  if (companyNameOnMedical !== undefined) updates['details.companyNameOnMedical'] = companyNameOnMedical;
  if (companyResponsibleForPayment !== undefined) updates['details.companyResponsibleForPayment'] = companyResponsibleForPayment;
  if (purchaseOrderNumber !== undefined) updates['details.purchaseOrderNumber'] = purchaseOrderNumber;

  const before = existing.details;
  const now = new Date();
  await appointments.updateOne(
    { id },
    {
      $set: updates,
      $push: { tracking: { type: 'UPDATED', date: now, doer: userId } } as never,
    }
  );

  await companionDb.collection('auditLog').insertOne({
    action: 'EDIT_APPOINTMENT_DETAILS',
    appointmentId: id,
    userId,
    before,
    updates,
    at: now,
  });

  return NextResponse.json({ ok: true });
}
