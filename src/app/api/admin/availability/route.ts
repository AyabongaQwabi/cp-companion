import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';

/**
 * Admin per-employee availability view for a clinic + month: for each employee who has at least
 * one appointment at this clinic in the given month, lists the specific dates they're already
 * booked. There is no employee schedule/roster/shift concept anywhere in this codebase (employees
 * only ever exist as line items on an appointment, per production.appointments.details.employees
 * — see AppointmentEmployee in src/lib/types.ts) — so "availability" here means "which days is
 * this employee already committed to," not a true open/blocked shift calendar. Every day in the
 * month NOT listed for an employee is implicitly open for them.
 *
 * Deliberately distinct from src/lib/availability.ts's getMonthBookings, which aggregates
 * clinic-wide headcount capacity per day (a single number, not broken out per employee) — this
 * route enumerates individual employees instead of summing them, which getMonthBookings's
 * $group pipeline structurally cannot produce without being rewritten. Reads
 * production.appointments directly (live, not cached) since a full month of one clinic's
 * appointments, projected to just the employee fields, is small.
 */
export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

interface EmployeeAvailabilityRow {
  idNumber: string | null;
  nameKey: string;
  displayName: string;
  occupation: string | null;
  bookedDates: { date: string; appointmentId: string; companyName: string | null; status: string }[];
}

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const clinic = req.nextUrl.searchParams.get('clinic');
  const year = parseInt(req.nextUrl.searchParams.get('year') || '', 10);
  const month = parseInt(req.nextUrl.searchParams.get('month') || '', 10); // 1-indexed

  if (!clinic || !year || !month) {
    return withAdminStatsCors(
      NextResponse.json({ error: 'clinic, year, and month required' }, { status: 400 })
    );
  }

  try {
    const prodDb = await getProductionDb();
    // Plain YYYY-MM-DD string comparison against details.date, matching the convention already
    // proven correct in src/lib/dashboard-stats.ts's buildDateMatch (not availability.ts's
    // getMonthBookings, which compares against full ISO timestamp bounds — that only matches if
    // details.date happens to be stored with a time component, which is not guaranteed here).
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const appointments = await prodDb
      .collection('appointments')
      .find({
        'details.clinic': clinic,
        'details.date': { $gte: startStr, $lte: endStr },
      })
      .project({
        id: 1,
        status: 1,
        'details.date': 1,
        'details.company.name': 1,
        'details.employees.idNumber': 1,
        'details.employees.name': 1,
        'details.employees.occupation': 1,
      })
      .toArray();

    const byIdentity = new Map<string, EmployeeAvailabilityRow>();

    for (const appointment of appointments) {
      const date = (appointment.details?.date || '').slice(0, 10);
      if (!date || date < startStr || date > endStr) continue; // guard against timestamp suffix variants

      const employees = appointment.details?.employees || [];
      for (const employee of employees) {
        const idNumber = (employee.idNumber || '').trim() || null;
        const name = employee.name || '';
        const nameKey = name.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!idNumber && !nameKey) continue;

        const identityKey = idNumber ? `id:${idNumber}` : `name:${nameKey}`;
        if (!byIdentity.has(identityKey)) {
          byIdentity.set(identityKey, {
            idNumber,
            nameKey,
            displayName: name,
            occupation: employee.occupation || null,
            bookedDates: [],
          });
        }

        byIdentity.get(identityKey)!.bookedDates.push({
          date,
          appointmentId: appointment.id,
          companyName: appointment.details?.company?.name || null,
          status: appointment.status,
        });
      }
    }

    const employeesForMonth = Array.from(byIdentity.values())
      .map((row) => ({ ...row, bookedDates: row.bookedDates.sort((a, b) => (a.date < b.date ? -1 : 1)) }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return withAdminStatsCors(
      NextResponse.json({
        clinic,
        year,
        month,
        daysInMonth,
        employees: employeesForMonth,
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
