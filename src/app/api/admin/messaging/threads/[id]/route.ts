import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type { AppointmentInternalNote, AppointmentThreadMeta } from '@/lib/types';

/**
 * Full detail for one appointment's message thread: the client-visible messages array (read from
 * production.appointments, same as GET /api/appointments/[id]/messages), plus admin-only overlays
 * (thread status, internal notes) read from cp_companion. `id` here is the appointment's business
 * id (AppointmentDocument.id), matching every other appointment-scoped route in this app.
 */
export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const { id } = await params;

  try {
    const prodDb = await getProductionDb();
    const companionDb = await getCompanionDb();

    const appointment = await prodDb.collection('appointments').findOne(
      { id },
      {
        projection: {
          id: 1,
          status: 1,
          'details.company': 1,
          'details.date': 1,
          usersWhoCanManage: 1,
          messages: 1,
        },
      }
    );

    if (!appointment) {
      return withAdminStatsCors(NextResponse.json({ error: 'Appointment not found' }, { status: 404 }));
    }

    const [meta, notes] = await Promise.all([
      companionDb.collection<AppointmentThreadMeta>('appointmentThreadMeta').findOne({ appointmentId: id }),
      companionDb
        .collection<AppointmentInternalNote>('appointmentInternalNotes')
        .find({ appointmentId: id })
        .sort({ createdAt: 1 })
        .toArray(),
    ]);

    return withAdminStatsCors(
      NextResponse.json({
        appointmentId: appointment.id,
        appointmentStatus: appointment.status,
        companyName: appointment.details?.company?.name || null,
        userName: appointment.usersWhoCanManage?.[0]?.name || null,
        date: appointment.details?.date || null,
        messages: appointment.messages || [],
        threadStatus: meta?.status || 'open',
        internalNotes: notes,
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
