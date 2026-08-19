import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import type { RosterEmployee } from '@/lib/types';

interface HistoricalEmployeeCandidate {
  name: string;
  idNumber: string;
  occupation: string;
}

interface AppointmentGroup {
  appointmentId: string;
  date: string;
  clinic: string;
  companyName: string;
  employees: HistoricalEmployeeCandidate[];
}

/**
 * Read-only over production.appointments + production.deleted_appointments, scoped to the
 * logged-in user via usersWhoCanManage.id — not details.company.id. A ClinicPlus user isn't
 * tied to one company (usersWhoCanManage/usersWhoCanEdit on an appointment can span several
 * companies over time), so history import looks at every appointment this user has managed,
 * regardless of which company it was for. Returns candidates for the user to review and select
 * before anything is written to cp_companion.employees; this route never writes to production.*.
 *
 * Grouped by appointment (most recent first) and paginated by appointment — not by flattened
 * employee — so the modal can render one collapsible section per appointment. An optional search
 * term narrows to appointments containing a matching employee; omitting it returns the full
 * history, paginated per the site-wide standard page sizes.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const search = req.nextUrl.searchParams.get('search')?.trim() || '';
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(
    250,
    Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '20', 10))
  );

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();

  const query = { 'usersWhoCanManage.id': userId };

  const [liveAppointments, deletedAppointments, existingRoster] = await Promise.all([
    prodDb.collection('appointments').find(query).toArray(),
    prodDb.collection('deleted_appointments').find(query).toArray(),
    // Match the roster's default selection surface: inactive and terminated employees can be
    // imported again from appointment history when they return to the active roster.
    companionDb
      .collection<RosterEmployee>('employees')
      .find({ userId, status: { $nin: ['inactive', 'terminated'] } })
      .toArray(),
  ]);

  const existingIdNumbers = new Set(
    existingRoster
      .map((e) => (e.idNumber == null ? '' : String(e.idNumber).trim()))
      .filter(Boolean)
  );

  let generatedIdCount = 0;
  let groups: AppointmentGroup[] = [];

  for (const appt of [...liveAppointments, ...deletedAppointments]) {
    const employees = appt?.details?.employees || [];
    const seenInThisAppt = new Set<string>();
    const candidates: HistoricalEmployeeCandidate[] = [];

    for (const emp of employees) {
      let idNumber = emp?.idNumber == null ? '' : String(emp.idNumber).trim();
      const name = (emp?.name || '').trim();
      if (!name) continue;

      if (!idNumber) {
        // No id/idNumber on record — generate a unique one so this employee can still be
        // imported into cp_companion.employees instead of being silently dropped.
        idNumber = `GEN-${crypto.randomUUID()}`;
        generatedIdCount += 1;
      }
      // Already on the roster — not a candidate to import again.
      if (existingIdNumbers.has(idNumber)) continue;
      // De-dupe within the same appointment only (a person can't sensibly appear twice in one
      // appointment's employee list, but the same person legitimately reappears across
      // different appointments — that's shown as separate groups, not merged).
      if (seenInThisAppt.has(idNumber)) continue;
      seenInThisAppt.add(idNumber);

      candidates.push({ name, idNumber, occupation: emp.occupation || '' });
    }

    if (candidates.length === 0) continue;

    candidates.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({
      appointmentId: appt.id || String(appt._id),
      date: appt.details?.date || '',
      clinic: appt.details?.clinic || '',
      companyName: appt.details?.company?.name || '',
      employees: candidates,
    });
  }

  if (search) {
    const term = search.toLowerCase();
    groups = groups
      .map((g) => ({
        ...g,
        employees: g.employees.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            c.idNumber.toLowerCase().includes(term) ||
            c.occupation.toLowerCase().includes(term)
        ),
      }))
      .filter((g) => g.employees.length > 0);
  }

  // Most recent appointment first — falls back to insertion order (already roughly
  // chronological from the collection scan) when a date string is missing or unparseable.
  groups.sort((a, b) => {
    const bd = Date.parse(b.date);
    const ad = Date.parse(a.date);
    if (Number.isNaN(bd) || Number.isNaN(ad)) return 0;
    return bd - ad;
  });

  const total = groups.length;
  const pageGroups = groups.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({ groups: pageGroups, total, page, pageSize, generatedIds: generatedIdCount });
}
