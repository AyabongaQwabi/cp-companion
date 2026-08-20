import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type { AppointmentMessage } from '@/lib/types';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

interface AdminReplyBody {
  adminId: string;
  adminName: string;
  message: string;
}

/**
 * Admin reply on an appointment's message thread. Appends to the same production.appointments
 * .messages array the client-facing apps and cp-companion's own
 * /api/appointments/[id]/messages route write to (same { message, author: {id,name,role},
 * createdAt } shape, same $push — not a whole-document $set, so this never clobbers a field a
 * concurrent editor touched), with author.role: 'admin' so the thread visibly distinguishes staff
 * replies from client messages. Free of charge — this is an internal admin action, not a
 * Companion end-user credit-metered action, so unlike /api/appointments/[id]/messages this route
 * does not call chargeForAction.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const { id } = await params;
  const body: AdminReplyBody = await req.json();
  const { adminId, adminName, message } = body;

  if (!adminId || !adminName || !message?.trim()) {
    return withAdminStatsCors(
      NextResponse.json({ error: 'adminId, adminName, and a non-empty message are required' }, { status: 400 })
    );
  }

  try {
    const prodDb = await getProductionDb();
    const companionDb = await getCompanionDb();
    const appointments = prodDb.collection('appointments');

    const appointment = await appointments.findOne({ id });
    if (!appointment) {
      return withAdminStatsCors(NextResponse.json({ error: 'Appointment not found' }, { status: 404 }));
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const newMessage: AppointmentMessage = {
      message: message.trim(),
      author: { id: adminId, name: adminName, role: 'admin' },
      createdAt,
    };

    await appointments.updateOne({ id }, { $push: { messages: newMessage } as never });

    await companionDb.collection('auditLog').insertOne({
      action: 'ADMIN_REPLY_APPOINTMENT_MESSAGE',
      appointmentId: id,
      adminId,
      message: newMessage,
      at: now,
    });

    return withAdminStatsCors(NextResponse.json({ ok: true, message: newMessage }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
