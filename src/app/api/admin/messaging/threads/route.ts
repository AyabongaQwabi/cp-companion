import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type { AppointmentThreadMeta } from '@/lib/types';

/**
 * Lists appointments that have at least one message, for the admin Messaging page's
 * search/browse list. Reads production.appointments directly (messages live embedded on the
 * appointment document, no separate collection — see AppointmentMessage in src/lib/types.ts and
 * the appointments/[id]/messages route's docblock), joined with cp_companion.appointmentThreadMeta
 * for the admin-set status (absent row = 'open', never assumed to be anything else).
 *
 * Search matches company name or a user name/id appearing in usersWhoCanManage — "search by
 * company or by user" per the task, implemented as one combined text-ish filter rather than two
 * separate fields since both are just "find the relevant appointment(s)."
 */
export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const search = (req.nextUrl.searchParams.get('search') || '').trim();
  const statusFilter = req.nextUrl.searchParams.get('status'); // 'open' | 'needs_follow_up' | 'resolved' | null (any)
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get('page') || '0', 10) || 0);

  try {
    const prodDb = await getProductionDb();
    const companionDb = await getCompanionDb();

    const match: Record<string, unknown> = { 'messages.0': { $exists: true } };
    if (search) {
      match.$or = [
        { 'details.company.name': { $regex: search, $options: 'i' } },
        { 'usersWhoCanManage.name': { $regex: search, $options: 'i' } },
      ];
    }

    const appointments = await prodDb
      .collection('appointments')
      .find(match)
      .project({
        id: 1,
        status: 1,
        'details.company': 1,
        'details.date': 1,
        usersWhoCanManage: 1,
        messages: 1,
      })
      .sort({ 'details.date': -1 })
      .toArray();

    const appointmentIds = appointments.map((a) => a.id).filter(Boolean);
    const threadMetas = appointmentIds.length
      ? await companionDb
          .collection<AppointmentThreadMeta>('appointmentThreadMeta')
          .find({ appointmentId: { $in: appointmentIds } })
          .toArray()
      : [];
    const metaByAppointmentId = new Map(threadMetas.map((m) => [m.appointmentId, m]));

    let rows = appointments.map((appointment) => {
      const messages = appointment.messages || [];
      const lastMessage = messages[messages.length - 1] || null;
      const meta = metaByAppointmentId.get(appointment.id);
      return {
        appointmentId: appointment.id,
        appointmentStatus: appointment.status,
        companyName: appointment.details?.company?.name || null,
        userName: appointment.usersWhoCanManage?.[0]?.name || null,
        date: appointment.details?.date || null,
        messageCount: messages.length,
        lastMessage,
        threadStatus: meta?.status || 'open',
      };
    });

    if (statusFilter) {
      rows = rows.filter((r) => r.threadStatus === statusFilter);
    }

    rows = rows.sort((a, b) => {
      const aTime = new Date(a.lastMessage?.createdAt || a.date || 0).getTime();
      const bTime = new Date(b.lastMessage?.createdAt || b.date || 0).getTime();
      return bTime - aTime;
    });

    const totalCount = rows.length;
    const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    return withAdminStatsCors(
      NextResponse.json({
        threads: pageRows,
        page,
        pageCount: Math.ceil(totalCount / PAGE_SIZE),
        totalCount,
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
