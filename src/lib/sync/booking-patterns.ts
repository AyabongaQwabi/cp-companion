import type { Db } from 'mongodb';
import type { BookingPattern } from '../types';

interface BookingRow {
  _id: string; // company id
  bookingDates: string[];
  employeesPerBooking: number[];
  serviceIds: string[];
}

/**
 * Booking-cadence mining per company — same incremental-by-caller contract as
 * syncCompanyProfiles: only runs for companies touched since the last sync run, but reads each
 * one's full appointment history (seasonality/cadence need the whole history, not just deltas).
 */
export async function syncBookingPatterns(
  prodDb: Db,
  companionDb: Db,
  companyIds: string[]
): Promise<{ processed: number; errors: number }> {
  if (companyIds.length === 0) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;
  const now = new Date();

  const rows = await prodDb
    .collection('appointments')
    .aggregate<BookingRow>([
      { $match: { 'details.company.id': { $in: companyIds }, status: 'approved' } },
      {
        $project: {
          companyId: '$details.company.id',
          date: '$details.date',
          employeeCount: { $size: { $ifNull: ['$details.employees', []] } },
          serviceIds: {
            $reduce: {
              input: '$details.employees',
              initialValue: [],
              in: { $concatArrays: ['$$value', { $map: { input: '$$this.services', as: 's', in: '$$s.id' } }] },
            },
          },
        },
      },
      {
        $group: {
          _id: '$companyId',
          bookingDates: { $push: '$date' },
          employeesPerBooking: { $push: '$employeeCount' },
          serviceIds: { $push: '$serviceIds' },
        },
      },
    ])
    .toArray();

  const patterns = companionDb.collection<BookingPattern>('bookingPatterns');
  const operations = [];

  for (const row of rows) {
    try {
      const sortedDates = (row.bookingDates || []).filter(Boolean).sort();
      const avgDaysBetweenBookings = computeAvgIntervalDays(sortedDates);
      const seasonalMonthCounts: Record<string, number> = {};
      for (const d of sortedDates) {
        const month = d.slice(5, 7);
        seasonalMonthCounts[month] = (seasonalMonthCounts[month] || 0) + 1;
      }

      const flatServiceIds = row.serviceIds.flat();
      const serviceMix: Record<string, number> = {};
      for (const id of flatServiceIds) {
        serviceMix[id] = (serviceMix[id] || 0) + 1;
      }

      const avgEmployeesPerBooking =
        row.employeesPerBooking.length > 0
          ? Math.round(
              (row.employeesPerBooking.reduce((a, b) => a + b, 0) / row.employeesPerBooking.length) * 10
            ) / 10
          : null;

      operations.push({
        updateOne: {
          filter: { companyId: row._id },
          update: {
            $set: {
              companyId: row._id,
              avgDaysBetweenBookings,
              seasonalMonthCounts,
              avgEmployeesPerBooking,
              serviceMix,
              lastSyncedAt: now,
            },
          },
          upsert: true,
        },
      });
      processed++;
    } catch {
      errors++;
    }
  }

  if (operations.length > 0) {
    await patterns.bulkWrite(operations, { ordered: false });
  }

  return { processed, errors };
}

function computeAvgIntervalDays(sortedDates: string[]): number | null {
  if (sortedDates.length < 2) return null;
  const times = sortedDates.map((d) => new Date(d).getTime());
  let totalGap = 0;
  for (let i = 1; i < times.length; i++) {
    totalGap += times[i] - times[i - 1];
  }
  return Math.round(totalGap / (times.length - 1) / 86400000);
}
