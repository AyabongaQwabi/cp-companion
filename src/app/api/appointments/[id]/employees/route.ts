import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { calculateBookingPrice } from '@/lib/pricing';
import { chargeForAction } from '@/lib/credits';
import type { AppointmentEmployee } from '@/lib/types';

/**
 * Removes one employee from an existing appointment's details.employees, recomputing
 * payment.amount immediately after (same formula as creation — calculateBookingPrice). This is
 * the only way to change an employee's presence besides adding via the roster (POST below) — no
 * in-place edit of an employee already on the appointment exists anywhere in this app by design.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.nextUrl.searchParams.get('userId');
  const employeeId = req.nextUrl.searchParams.get('employeeId');

  if (!userId || !employeeId) {
    return NextResponse.json({ error: 'userId and employeeId required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();
  const appointments = prodDb.collection('appointments');

  const appointment = await appointments.findOne({ id, 'usersWhoCanManage.id': userId });
  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  const employees: AppointmentEmployee[] = appointment.details?.employees || [];
  const removed = employees.find((e) => e.id === employeeId);
  if (!removed) {
    return NextResponse.json({ error: 'Employee not found on this appointment' }, { status: 404 });
  }

  const charge = await chargeForAction(userId, 'appointment.removeEmployee');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const remainingEmployees = employees.filter((e) => e.id !== employeeId);
  const newAmount = calculateBookingPrice(remainingEmployees);
  const removedAt = new Date();

  await appointments.updateOne(
    { id },
    {
      $set: { 'details.employees': remainingEmployees, 'payment.amount': newAmount },
      $push: { tracking: { type: 'UPDATED', date: removedAt, doer: userId } } as never,
    }
  );

  await companionDb.collection('auditLog').insertOne({
    action: 'REMOVE_APPOINTMENT_EMPLOYEE',
    appointmentId: id,
    userId,
    removedEmployee: removed,
    newAmount,
    at: removedAt,
  });

  return NextResponse.json({ ok: true, amount: newAmount });
}

interface AddEmployeeBody {
  userId: string;
  employee: AppointmentEmployee;
}

/**
 * Adds one new employee to an existing appointment, pre-filled from the roster via the same
 * search/select modal as the create flow (never free-typed inline). Recomputes payment.amount
 * with the same formula as creation. Priced separately from both "add employee to roster" (5) and
 * flat appointment creation — this is a distinct production write on an already-created
 * appointment (appointment.addEmployee).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body: AddEmployeeBody = await req.json();
  const { userId, employee } = body;

  if (!userId || !employee?.id || !employee?.name) {
    return NextResponse.json({ error: 'userId and a valid employee required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();
  const appointments = prodDb.collection('appointments');

  const appointment = await appointments.findOne({ id, 'usersWhoCanManage.id': userId });
  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  const employees: AppointmentEmployee[] = appointment.details?.employees || [];
  if (employees.some((e) => e.id === employee.id)) {
    return NextResponse.json({ error: 'Employee already on this appointment' }, { status: 409 });
  }

  const charge = await chargeForAction(userId, 'appointment.addEmployee');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const nextEmployees = [...employees, employee];
  const newAmount = calculateBookingPrice(nextEmployees);
  const addedAt = new Date();

  await appointments.updateOne(
    { id },
    {
      $set: { 'details.employees': nextEmployees, 'payment.amount': newAmount },
      $push: { tracking: { type: 'UPDATED', date: addedAt, doer: userId } } as never,
    }
  );

  await companionDb.collection('auditLog').insertOne({
    action: 'ADD_APPOINTMENT_EMPLOYEE',
    appointmentId: id,
    userId,
    addedEmployee: employee,
    newAmount,
    at: addedAt,
  });

  return NextResponse.json({ ok: true, amount: newAmount });
}
