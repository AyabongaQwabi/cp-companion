import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type { AppointmentInternalNote } from '@/lib/types';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

interface AddNoteBody {
  adminId: string;
  adminName: string;
  note: string;
}

/**
 * Adds an admin-only internal note to an appointment's thread — stored in
 * cp_companion.appointmentInternalNotes, a completely separate collection from
 * production.appointments.messages, so there is no code path that could leak a note into the
 * client-visible thread. Append-only (no PATCH/DELETE): notes are a record of what staff observed
 * at the time, not something that should be silently edited after the fact.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const { id } = await params;
  const body: AddNoteBody = await req.json();
  const { adminId, adminName, note } = body;

  if (!adminId || !adminName || !note?.trim()) {
    return withAdminStatsCors(
      NextResponse.json({ error: 'adminId, adminName, and a non-empty note are required' }, { status: 400 })
    );
  }

  try {
    const companionDb = await getCompanionDb();
    const doc: AppointmentInternalNote = {
      appointmentId: id,
      note: note.trim(),
      authorAdminId: adminId,
      authorAdminName: adminName,
      createdAt: new Date(),
    };

    const result = await companionDb.collection<AppointmentInternalNote>('appointmentInternalNotes').insertOne(doc);

    return withAdminStatsCors(NextResponse.json({ ok: true, note: { ...doc, _id: String(result.insertedId) } }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
