import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type { AppointmentThreadMeta, ThreadStatus } from '@/lib/types';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

const VALID_STATUSES: ThreadStatus[] = ['open', 'needs_follow_up', 'resolved'];

interface UpdateStatusBody {
  adminId: string;
  status: ThreadStatus;
}

/**
 * Sets an appointment thread's admin-facing triage status — stored in
 * cp_companion.appointmentThreadMeta, one row per appointmentId, upserted (a thread starts with no
 * row, implicitly 'open', until an admin explicitly changes it). Never written to
 * production.appointments — this status is purely an admin-portal concern, unrelated to the
 * appointment's own pending/approved/declined status field.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const { id } = await params;
  const body: UpdateStatusBody = await req.json();
  const { adminId, status } = body;

  if (!adminId || !VALID_STATUSES.includes(status)) {
    return withAdminStatsCors(
      NextResponse.json(
        { error: `adminId and a valid status (${VALID_STATUSES.join(', ')}) are required` },
        { status: 400 }
      )
    );
  }

  try {
    const companionDb = await getCompanionDb();
    const now = new Date();

    await companionDb.collection<AppointmentThreadMeta>('appointmentThreadMeta').updateOne(
      { appointmentId: id },
      { $set: { appointmentId: id, status, updatedAt: now, updatedByAdminId: adminId } },
      { upsert: true }
    );

    return withAdminStatsCors(NextResponse.json({ ok: true, status, updatedAt: now }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
