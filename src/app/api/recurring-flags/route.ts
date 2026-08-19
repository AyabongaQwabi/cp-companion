import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import type { RecurringBookingFlag } from '@/lib/types';

/**
 * Repeat/recurring booking reminders — surfaces a prompt when a flagged employee (optionally
 * scoped to one service) is due again, per intervalMonths. NEVER auto-creates an appointment;
 * this collection only stores reminder metadata for the UI to surface.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const dueOnly = req.nextUrl.searchParams.get('dueOnly') === '1';
  const leadDays = parseInt(req.nextUrl.searchParams.get('leadDays') || '30', 10);

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const db = await getCompanionDb();
  const query: Record<string, unknown> = { userId };
  if (dueOnly) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + leadDays);
    query.nextDueDate = { $lte: threshold.toISOString().slice(0, 10) };
  }

  const flags = await db
    .collection<RecurringBookingFlag>('recurringBookingFlags')
    .find(query)
    .sort({ nextDueDate: 1 })
    .toArray();

  return NextResponse.json(flags);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, rosterEmployeeId, serviceId, intervalMonths, lastAppointmentDate } = body;

  if (!userId || !rosterEmployeeId || !intervalMonths || !lastAppointmentDate) {
    return NextResponse.json(
      { error: 'userId, rosterEmployeeId, intervalMonths, and lastAppointmentDate required' },
      { status: 400 }
    );
  }

  const charge = await chargeForAction(userId, 'recurring.setFlag');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const nextDue = new Date(lastAppointmentDate);
  nextDue.setMonth(nextDue.getMonth() + Number(intervalMonths));

  const db = await getCompanionDb();
  const now = new Date();
  const flag: Omit<RecurringBookingFlag, '_id'> = {
    userId,
    rosterEmployeeId,
    serviceId: serviceId || undefined,
    intervalMonths: Number(intervalMonths),
    lastAppointmentDate,
    nextDueDate: nextDue.toISOString().slice(0, 10),
    createdAt: now,
    updatedAt: now,
  };

  // One flag per employee+service pairing — re-setting it (e.g. after a fresh appointment)
  // updates the existing row rather than accumulating duplicates.
  const result = await db.collection('recurringBookingFlags').findOneAndUpdate(
    { userId, rosterEmployeeId, serviceId: flag.serviceId },
    { $set: flag },
    { upsert: true, returnDocument: 'after' }
  );

  return NextResponse.json(result, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('_id');
  if (!id) {
    return NextResponse.json({ error: '_id required' }, { status: 400 });
  }
  const db = await getCompanionDb();
  await db.collection('recurringBookingFlags').deleteOne({ _id: new ObjectId(id) });
  return NextResponse.json({ ok: true });
}
