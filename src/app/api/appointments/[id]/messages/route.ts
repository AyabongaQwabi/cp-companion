import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import type { AppointmentMessage } from '@/lib/types';

/**
 * Reads the message thread on one appointment. The real apps carry messages as a plain array on
 * the appointment document (details.messages... actually top-level `messages`, confirmed against
 * cp-redesign-admin/src/views/appointments/appointment/index.js:110-129 and the server's
 * updateAppointment handler in clinicplus-server-latest-stable-version/lib/data/update/index.js)
 * — not a separate collection, not Socket.IO-only. cp-companion is a stateless Next.js app with
 * no existing Socket.IO client, so this reads/writes the same underlying storage over plain REST
 * instead of joining the real-time channel; the page polls/refetches rather than subscribing.
 * This is a deliberate divergence from the real apps' transport, flagged for Aya per the prompt's
 * instruction rather than assumed silently.
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
    .findOne({ id, 'usersWhoCanManage.id': userId }, { projection: { messages: 1 } });

  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  return NextResponse.json({ messages: appointment.messages || [] });
}

interface SendMessageBody {
  userId: string;
  userName: string;
  userRole: string;
  message: string;
}

/**
 * Sends a new message on this appointment. Free by default per the prompt's DRAFT pricing
 * (appointment.sendMessage, 0 credits) — flagged alongside the 1-credit alternative for Aya's
 * confirm pass, same as every other draft price here. Appends to the same `messages` array field
 * the real apps use, in the same { message, author: { id, name, role }, createdAt } shape — a
 * $push, not a whole-document $set, so this never overwrites any other field a concurrent editor
 * touched (unlike the real app's UPDATE_APPOINTMENT, which re-sends the whole document).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body: SendMessageBody = await req.json();
  const { userId, userName, userRole, message } = body;

  if (!userId || !userName || !message?.trim()) {
    return NextResponse.json({ error: 'userId, userName, and a non-empty message required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();
  const appointments = prodDb.collection('appointments');

  const appointment = await appointments.findOne({ id, 'usersWhoCanManage.id': userId });
  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  const charge = await chargeForAction(userId, 'appointment.sendMessage');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const newMessage: AppointmentMessage = {
    message: message.trim(),
    author: { id: userId, name: userName, role: userRole || 'client' },
    createdAt,
  };

  await appointments.updateOne({ id }, { $push: { messages: newMessage } as never });

  await companionDb.collection('auditLog').insertOne({
    action: 'SEND_APPOINTMENT_MESSAGE',
    appointmentId: id,
    userId,
    message: newMessage,
    at: new Date(),
  });

  return NextResponse.json({ ok: true, message: newMessage });
}
