import type { Db } from 'mongodb';
import { resolveClinicLimit } from './booking-rules';

/**
 * Shared availability aggregation, consolidating the same-day headcount logic that used to be
 * duplicated in /api/booking-status and /api/appointments (POST). Confirmed against the real
 * server handler (getAppointmentsForDateCount in
 * clinicplus-server-latest-stable-version/lib/data/get/index.js) that the canonical "count" is a
 * sum of details.employees.length across matching appointments — an employee count, not an
 * appointment-document count.
 *
 * production.appointments and production.deleted_appointments are mutually exclusive, not
 * overlapping (a delete moves the doc from one to the other in the same operation — see
 * /api/appointments/[id]/delete). So a same-day/month query against appointments alone never
 * needs to also exclude deleted_appointments: a deleted appointment is already absent from
 * appointments. Do not add a second query against deleted_appointments here.
 */

export async function getClinicLimits(prodDb: Db): Promise<Record<string, number>> {
  const settingsDocs = await prodDb.collection('systemSettings').find().toArray();
  return settingsDocs[0]?.limits || {};
}

export interface DayBookings {
  currentBookings: number;
  appointmentCount: number;
}

export async function getSameDayBookings(prodDb: Db, clinic: string, date: string): Promise<DayBookings> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const sameDayAppointments = await prodDb
    .collection('appointments')
    .find({
      'details.clinic': clinic,
      'details.date': { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
    })
    .toArray();

  const currentBookings = sameDayAppointments.reduce(
    (acc, a) => acc + (a.details?.employees?.length || 0),
    0
  );

  return { currentBookings, appointmentCount: sameDayAppointments.length };
}

/**
 * One aggregation covering every day in the given month, keyed by YYYY-MM-DD — not an N+1 loop
 * over getSameDayBookings per day. `month` is 1-indexed (1 = January) to match calendar-UI
 * conventions, converted to the 0-indexed Date constructor internally.
 */
export async function getMonthBookings(
  prodDb: Db,
  clinic: string,
  year: number,
  month: number
): Promise<Record<string, DayBookings>> {
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const results = await prodDb
    .collection('appointments')
    .aggregate<{ _id: string; currentBookings: number; appointmentCount: number }>([
      {
        $match: {
          'details.clinic': clinic,
          'details.date': { $gte: monthStart.toISOString(), $lte: monthEnd.toISOString() },
        },
      },
      {
        $group: {
          _id: { $substrCP: ['$details.date', 0, 10] },
          currentBookings: { $sum: { $size: { $ifNull: ['$details.employees', []] } } },
          appointmentCount: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const byDate: Record<string, DayBookings> = {};
  for (const row of results) {
    byDate[row._id] = { currentBookings: row.currentBookings, appointmentCount: row.appointmentCount };
  }
  return byDate;
}

export type AvailabilityStatus = 'open' | 'filling' | 'full';

export function resolveAvailabilityStatus(currentBookings: number, limit: number): AvailabilityStatus {
  if (limit <= 0) return 'full';
  const ratio = currentBookings / limit;
  if (ratio >= 1) return 'full';
  if (ratio >= 0.7) return 'filling';
  return 'open';
}

export { resolveClinicLimit };
