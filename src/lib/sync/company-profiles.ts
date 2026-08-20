import type { Db } from 'mongodb';
import type { Company, CompanyProfile } from '../types';

/**
 * Employee-count bands for peer cohorts — deliberately coarse (5 bands) so a cohort has a
 * realistic chance of clearing the section-1 minimum-cohort-size guardrail. Never exposed to any
 * client; only used server-side to group companies for benchmarking.
 */
function employeeCountBand(count: number): string {
  if (count <= 10) return '1-10';
  if (count <= 50) return '11-50';
  if (count <= 200) return '51-200';
  if (count <= 500) return '201-500';
  return '500+';
}

interface AppointmentAggRow {
  _id: string; // company id
  totalSpend: number;
  bookingDates: string[];
  clinicCounts: { clinic: string; count: number }[];
  serviceCounts: { serviceId: string; count: number }[];
  employeeIdNumbers: string[];
  lastBookingDate: string | null;
}

/**
 * Incremental by design at the caller level: syncCompanyProfiles is always run against the full
 * set of companyIds touched since the last run (see sync/index.ts), not a full company scan every
 * hour. The per-company appointment aggregation below necessarily reads that company's full
 * appointment history each time it runs (booking cadence needs the whole history, not just what's
 * new) — but it only runs for companies that changed, not all 3,100+ companies every hour.
 */
export async function syncCompanyProfiles(
  prodDb: Db,
  companionDb: Db,
  companyIds: string[]
): Promise<{ processed: number; errors: number }> {
  if (companyIds.length === 0) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;
  const now = new Date();

  const companies = await prodDb
    .collection<Company>('companies')
    .find({ id: { $in: companyIds } })
    .toArray();

  const aggRows = await prodDb
    .collection('appointments')
    .aggregate<AppointmentAggRow>([
      { $match: { 'details.company.id': { $in: companyIds }, status: 'approved' } },
      { $unwind: '$details.employees' },
      { $unwind: '$details.employees.services' },
      {
        $group: {
          _id: '$details.company.id',
          totalSpend: { $sum: '$payment.amount' },
          bookingDates: { $addToSet: '$details.date' },
          employeeIdNumbers: { $addToSet: '$details.employees.idNumber' },
          serviceIds: { $push: '$details.employees.services.id' },
          clinics: { $push: '$details.clinic' },
        },
      },
      {
        $project: {
          totalSpend: 1,
          bookingDates: 1,
          employeeIdNumbers: 1,
          serviceCounts: {
            $map: {
              input: { $setUnion: ['$serviceIds', []] },
              as: 's',
              in: {
                serviceId: '$$s',
                count: { $size: { $filter: { input: '$serviceIds', cond: { $eq: ['$$this', '$$s'] } } } },
              },
            },
          },
          clinicCounts: {
            $map: {
              input: { $setUnion: ['$clinics', []] },
              as: 'c',
              in: {
                clinic: '$$c',
                count: { $size: { $filter: { input: '$clinics', cond: { $eq: ['$$this', '$$c'] } } } },
              },
            },
          },
        },
      },
    ])
    .toArray();

  const aggByCompany = new Map(aggRows.map((r) => [r._id, r]));
  const profiles = companionDb.collection<CompanyProfile>('companyProfiles');

  // Single round trip for every existing profile in this batch, instead of one findOne per
  // company — the original per-company findOne+updateOne loop took several minutes against the
  // real ~2,800-company first-run backlog; bulkWrite below replaces it with one round trip total.
  const existingProfiles = await profiles
    .find({ companyId: { $in: companies.map((c) => c.id) } })
    .toArray();
  const existingByCompany = new Map(existingProfiles.map((p) => [p.companyId, p]));

  const monthKey = now.toISOString().slice(0, 7);
  const operations = [];

  for (const company of companies) {
    try {
      const agg = aggByCompany.get(company.id);
      const sortedDates = (agg?.bookingDates || []).filter(Boolean).sort();
      const avgBookingIntervalDays = computeAvgIntervalDays(sortedDates);
      const dominantClinic = pickDominant(agg?.clinicCounts, 'clinic');
      const dominantServiceType = pickDominant(agg?.serviceCounts, 'serviceId');
      const currentEmployeeCount = agg?.employeeIdNumbers?.length ?? 0;
      const firstTracking = company.tracking?.[0]?.date;

      const existing = existingByCompany.get(company.id);
      const employeeCountTrend = existing?.employeeCountTrend ?? [];
      if (employeeCountTrend[employeeCountTrend.length - 1]?.date !== monthKey) {
        employeeCountTrend.push({ date: monthKey, count: currentEmployeeCount });
      } else {
        employeeCountTrend[employeeCountTrend.length - 1].count = currentEmployeeCount;
      }

      operations.push({
        updateOne: {
          filter: { companyId: company.id },
          update: {
            $set: {
              companyId: company.id,
              companyName: company.details?.name || '',
              totalHistoricalSpend: agg?.totalSpend ?? 0,
              employeeCountTrend,
              currentEmployeeCount,
              dominantClinic,
              dominantServiceType,
              avgBookingIntervalDays,
              peerCohortKey: `${employeeCountBand(currentEmployeeCount)}|${dominantServiceType ?? 'none'}`,
              firstSeenAt: firstTracking ? new Date(firstTracking) : now,
              lastActiveAt: sortedDates.length > 0 ? new Date(sortedDates[sortedDates.length - 1]) : null,
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
    await profiles.bulkWrite(operations, { ordered: false });
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

function pickDominant(
  counts: { [key: string]: unknown }[] | undefined,
  key: string
): string | null {
  if (!counts || counts.length === 0) return null;
  const sorted = [...counts].sort((a, b) => (b.count as number) - (a.count as number));
  return (sorted[0][key] as string) ?? null;
}
