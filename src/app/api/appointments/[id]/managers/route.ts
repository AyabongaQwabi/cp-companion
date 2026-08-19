import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';

/**
 * Search production.users (read-only, by name/email) for the "add a user to this appointment's
 * usersWhoCanManage" tool. Free — this is a lookup, not a write. Scoped to the requesting user
 * being on the appointment's own usersWhoCanManage, same as every other endpoint on this
 * sub-resource.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.nextUrl.searchParams.get('userId');
  const search = req.nextUrl.searchParams.get('search')?.trim();

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const appointment = await prodDb.collection('appointments').findOne({ id, 'usersWhoCanManage.id': userId });
  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  if (!search) {
    return NextResponse.json({ users: [] });
  }

  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = { $regex: escaped, $options: 'i' };
  const matches = await prodDb
    .collection('users')
    .find({
      $or: [
        { 'details.name': regex },
        { 'details.surname': regex },
        { 'details.email': regex },
      ],
    })
    .limit(20)
    .toArray();

  const users = matches.map((u) => ({
    id: u.id,
    name: `${u.details?.name || ''} ${u.details?.surname || ''}`.trim(),
    email: u.details?.email || '',
  }));

  return NextResponse.json({ users });
}

interface ManagerBody {
  userId: string;
  targetUserId: string;
  targetUserName: string;
}

/**
 * Adds a user to this specific appointment's usersWhoCanManage array — a real write to an
 * existing production field (documented on the appointment shape), never a new field. Priced
 * (appointment.addManager) and audit-logged like every other write here.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body: ManagerBody = await req.json();
  const { userId, targetUserId, targetUserName } = body;

  if (!userId || !targetUserId || !targetUserName) {
    return NextResponse.json({ error: 'userId, targetUserId, and targetUserName required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();
  const appointments = prodDb.collection('appointments');

  const appointment = await appointments.findOne({ id, 'usersWhoCanManage.id': userId });
  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  const alreadyManages = (appointment.usersWhoCanManage || []).some(
    (u: { id: string }) => u.id === targetUserId
  );
  if (alreadyManages) {
    return NextResponse.json({ error: 'User already manages this appointment' }, { status: 409 });
  }

  const charge = await chargeForAction(userId, 'appointment.addManager');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const addedAt = new Date();
  await appointments.updateOne(
    { id },
    {
      $push: {
        usersWhoCanManage: { id: targetUserId, name: targetUserName },
        tracking: { type: 'UPDATED', date: addedAt, doer: userId },
      } as never,
    }
  );

  await companionDb.collection('auditLog').insertOne({
    action: 'ADD_APPOINTMENT_MANAGER',
    appointmentId: id,
    userId,
    addedUser: { id: targetUserId, name: targetUserName },
    at: addedAt,
  });

  return NextResponse.json({ ok: true });
}

/**
 * Removes a user from usersWhoCanManage. Not priced separately in the prompt's spec — treated as
 * free/unbilled housekeeping symmetric with removing oneself, same as the real app's own
 * removeUser flow (cp-redesign-admin edit/index.js:296-310), which is also unbilled. Still
 * audit-logged and fail-closed like every write here.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.nextUrl.searchParams.get('userId');
  const targetUserId = req.nextUrl.searchParams.get('targetUserId');

  if (!userId || !targetUserId) {
    return NextResponse.json({ error: 'userId and targetUserId required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();
  const appointments = prodDb.collection('appointments');

  const appointment = await appointments.findOne({ id, 'usersWhoCanManage.id': userId });
  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  const removedAt = new Date();
  await appointments.updateOne(
    { id },
    { $pull: { usersWhoCanManage: { id: targetUserId } } as never }
  );
  await appointments.updateOne(
    { id },
    { $push: { tracking: { type: 'UPDATED', date: removedAt, doer: userId } } as never }
  );

  await companionDb.collection('auditLog').insertOne({
    action: 'REMOVE_APPOINTMENT_MANAGER',
    appointmentId: id,
    userId,
    removedUserId: targetUserId,
    at: removedAt,
  });

  return NextResponse.json({ ok: true });
}
