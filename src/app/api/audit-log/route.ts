import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';

interface AuditEntry {
  source: 'appointment' | 'company' | 'companion';
  type: string;
  date: Date;
  doer: string;
  entityId?: string;
}

/**
 * Unified chronological log merging production.appointments.tracking (confirmed real, actively
 * appended — see appointments/route.ts and [id]/route.ts), production.companies.tracking
 * (confirmed real, but Companion's own company routes deliberately never append to it beyond
 * creation — see companies/route.ts comments; still surfaced here as a read source since the
 * field itself is real), and cp_companion.auditLog (the substitute source for everything
 * production.users would have logged, since users.tracking is confirmed dead — only ever set
 * once at signup, never appended to by any app in this workspace; see lib/types.ts comment on
 * ClinicPlusUserDocument). Scoped strictly to this user's own account/companies/appointments —
 * never another company's activity.
 *
 * Charges profile.viewAuditLog (50 credits) once per reveal — enforced by the frontend only
 * calling this on the hidden->shown transition, not on every render; this route itself doesn't
 * (and can't) distinguish "first reveal this page visit" from "reopened after closing", so the
 * once-per-page-visit boundary is a client-side responsibility (see settings/profile page state).
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const charge = req.nextUrl.searchParams.get('charge') === 'true';
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  if (charge) {
    const result = await chargeForAction(userId, 'profile.viewAuditLog');
    if (!result.ok) {
      return NextResponse.json(result, { status: 402 });
    }
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();

  const [appointments, companies, auditLog] = await Promise.all([
    prodDb
      .collection('appointments')
      .find({ 'usersWhoCanManage.id': userId })
      .project({ id: 1, tracking: 1 })
      .toArray(),
    prodDb
      .collection('companies')
      .find({ 'usersWhoCanManage.id': userId })
      .project({ id: 1, tracking: 1 })
      .toArray(),
    companionDb
      .collection('auditLog')
      .find({ userId })
      .sort({ at: -1 })
      .limit(500)
      .toArray(),
  ]);

  const entries: AuditEntry[] = [];

  for (const appt of appointments) {
    for (const t of appt.tracking || []) {
      entries.push({ source: 'appointment', type: t.type, date: new Date(t.date), doer: t.doer, entityId: appt.id });
    }
  }
  for (const company of companies) {
    for (const t of company.tracking || []) {
      entries.push({ source: 'company', type: t.type, date: new Date(t.date), doer: t.doer, entityId: company.id });
    }
  }
  for (const entry of auditLog) {
    entries.push({
      source: 'companion',
      type: entry.action,
      date: new Date(entry.at),
      doer: entry.userId,
      entityId: entry.appointmentId || entry.companyId || undefined,
    });
  }

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());

  return NextResponse.json({ entries: entries.slice(0, 500) });
}
