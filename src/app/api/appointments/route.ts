import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { getAppointmentId } from '@/lib/appointment-id';
import { isDateBlocked, blockedDateReason } from '@/lib/booking-rules';
import { getClinicLimits, getSameDayBookings, resolveClinicLimit } from '@/lib/availability';
import { calculateBookingPrice } from '@/lib/pricing';
import { validateAppointmentShape } from '@/lib/appointment-shape';
import { sendNewAppointmentEmail, sendNewAppointmentEmailInternal } from '@/lib/mailjet';
import { chargeForAction } from '@/lib/credits';
import type { AppointmentDocument, AppointmentEmployee } from '@/lib/types';

interface CreateAppointmentBody {
  companyId: string;
  companyName: string;
  clinic: string;
  date: string;
  purchaseOrderNumber?: string | null;
  companyNameOnMedical?: string;
  companyResponsibleForPayment?: string;
  employees: AppointmentEmployee[];
  ndaPdf: string;
  userId: string;
  userName: string;
  rosterEmployeeIds: string[];
}

/**
 * List appointments the given user manages (usersWhoCanManage.id), for the Appointments page
 * (distinct from Insights' aggregates and from /book's creation flow). Read-only, free — see
 * config/action-pricing.json ("appointment.view", 0 credits). Paginated per the site-wide
 * standard page sizes; filterable by status, date range, and clinic. Live appointments only
 * (production.appointments) — deleted_appointments intentionally excluded, since a deleted
 * appointment is no longer something to "manage".
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const status = req.nextUrl.searchParams.get('status');
  const clinic = req.nextUrl.searchParams.get('clinic');
  const dateFrom = req.nextUrl.searchParams.get('dateFrom');
  const dateTo = req.nextUrl.searchParams.get('dateTo');
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(
    250,
    Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '20', 10))
  );

  const prodDb = await getProductionDb();

  // A user's manageable appointments come from two places that don't always agree:
  // usersWhoCanManage.id on the appointment (source of truth for access control) and
  // user.appointmentsManaging (appended at creation time — see POST below). Union both by
  // appointment id so an appointment present in either place still shows up here.
  const user = await prodDb.collection('users').findOne({ id: userId });
  const managingIds = ((user?.appointmentsManaging || []) as unknown[])
    .map((entry) => (typeof entry === 'string' ? entry : (entry as { id?: string })?.id))
    .filter((id): id is string => Boolean(id));

  const filters: Record<string, unknown> = {};
  if (status) filters.status = status;
  if (clinic) filters['details.clinic'] = clinic;
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, string> = {};
    if (dateFrom) dateFilter.$gte = dateFrom;
    if (dateTo) dateFilter.$lte = dateTo;
    filters['details.date'] = dateFilter;
  }

  const query: Record<string, unknown> =
    managingIds.length > 0
      ? {
          $or: [
            { ...filters, 'usersWhoCanManage.id': userId },
            { ...filters, id: { $in: managingIds } },
          ],
        }
      : { ...filters, 'usersWhoCanManage.id': userId };

  const [appointments, total] = await Promise.all([
    prodDb
      .collection('appointments')
      .find(query)
      .sort({ 'details.date': -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    prodDb.collection('appointments').countDocuments(query),
  ]);

  return NextResponse.json({ appointments, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const body: CreateAppointmentBody = await req.json();
  const {
    companyId,
    companyName,
    clinic,
    date,
    purchaseOrderNumber,
    companyNameOnMedical,
    companyResponsibleForPayment,
    employees,
    ndaPdf,
    userId,
    userName,
    rosterEmployeeIds,
  } = body;

  if (!companyId || !companyName || !clinic || !date || !employees?.length || !ndaPdf || !userId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Business rule: no bookings on Sat/Sun/public holidays (mirrors isDateBlocked in cp-redesign).
  if (isDateBlocked(date)) {
    return NextResponse.json({ error: blockedDateReason(date) }, { status: 422 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();

  // Business rule: per-clinic per-date headcount limit, sourced from production.systemSettings
  // (settings.limits[clinic] || 100), same as GET_SYSTEM_SETTINGS / GET_APPOINTMENTS_FOR_DATE_COUNT.
  const limits = await getClinicLimits(prodDb);
  const limit = resolveClinicLimit(limits, clinic);
  const { currentBookings } = await getSameDayBookings(prodDb, clinic, date);

  if (currentBookings + employees.length > limit) {
    return NextResponse.json(
      {
        error: `Cannot create appointment. The clinic limit for ${clinic} on ${date} is ${limit} employees. Currently booked: ${currentBookings}, attempting to add: ${employees.length}.`,
      },
      { status: 422 }
    );
  }

  const price = calculateBookingPrice(employees);

  const appointmentToInsert: AppointmentDocument = {
    details: {
      company: { id: companyId, name: companyName },
      date,
      purchaseOrderNumber: purchaseOrderNumber || null,
      companyNameOnMedical: companyNameOnMedical || undefined,
      companyResponsibleForPayment: companyResponsibleForPayment || undefined,
      clinic,
      ndaAccepted: true,
      ndaPdf,
      employees,
    },
    usersWhoCanEdit: [],
    usersWhoCanManage: [{ id: userId, name: userName }],
    payment: { proofOfPayment: '', amount: price },
    isVoided: false,
    isComplete: false,
    tracking: [],
    messages: [],
    status: 'pending',
  };

  const shapeErrors = validateAppointmentShape(appointmentToInsert);
  if (shapeErrors.length > 0) {
    await companionDb.collection('auditLog').insertOne({
      action: 'CREATE_APPOINTMENT_REJECTED',
      companyId,
      userId,
      errors: shapeErrors,
      attemptedDocument: appointmentToInsert,
      at: new Date(),
    });
    return NextResponse.json(
      { error: 'Appointment failed validation and was not created', details: shapeErrors },
      { status: 422 }
    );
  }

  // Part E/F.1 — charge here, after every free validity check has passed but before any write,
  // so a failed charge never leaves a partial appointment behind. Fail closed: if the wallet
  // can't cover it, nothing is written to production.*.
  const charge = await chargeForAction(userId, 'appointment.create');
  if (!charge.ok) {
    return NextResponse.json(
      { error: 'Insufficient credits to create this appointment', creditCost: charge.creditCost },
      { status: 402 }
    );
  }

  // From here on, mirror saveNewAppointment in
  // clinicplus-server-latest-stable-version/lib/data/save/index.js: server assigns id + tracking,
  // inserts into production.appointments, and appends to the user's appointmentsManaging array.
  const appointmentId = await getAppointmentId(companyName, clinic);
  const finalAppointment = {
    ...appointmentToInsert,
    id: appointmentId,
    tracking: [{ type: 'CREATED', date: new Date(), doer: userId }],
  };

  const usersCollection = prodDb.collection('users');
  const user = await usersCollection.findOne({ id: userId });
  if (!user) {
    return NextResponse.json({ error: 'User not found in production.users' }, { status: 404 });
  }

  await prodDb.collection('appointments').insertOne(finalAppointment);
  await usersCollection.updateOne(
    { _id: user._id },
    {
      $set: {
        appointmentsManaging: [
          ...(user.appointmentsManaging || []),
          { id: appointmentId, company: companyName },
        ],
      },
    }
  );

  await companionDb.collection('auditLog').insertOne({
    action: 'CREATE_APPOINTMENT',
    appointmentId,
    companyId,
    userId,
    amount: price,
    at: new Date(),
  });
  await companionDb.collection('appointmentLog').insertOne({
    appointmentId,
    companyId,
    rosterEmployeeIds: rosterEmployeeIds || [],
    createdAt: new Date(),
  });

  // Part F.2 — bust the cached Insights for this user so their newly-created appointment shows
  // up immediately next time they open Insights, rather than waiting out the TTL.
  await companionDb.collection('insightsCache').deleteOne({ userId });

  try {
    await sendNewAppointmentEmail(user as unknown as { details: { name: string; surname: string; email: string } }, {
      id: appointmentId,
    });
    await sendNewAppointmentEmailInternal({ id: appointmentId });
  } catch (err) {
    // Email failure should not roll back an already-created, already-valid appointment.
    console.error('Failed to send appointment creation emails', err);
  }

  return NextResponse.json({ id: appointmentId, amount: price }, { status: 201 });
}
