import type { Db } from 'mongodb';
import moment from 'moment';
import type { ClinicMonthAnalytics, FinanceAnalyticsCache } from '../types';

/**
 * Replaces the legacy GET_FINANCE_ANALYTICS socket handler
 * (clinincplus-server-latest-stable-version/lib/data/get/index.js getMonthlySaleAnalytics), which
 * loaded every appointment/company/user document for the month into Node and reduced them in JS —
 * the main cause of the admin Analytics page's 5-minute load. Here the per-day sums are computed
 * in a single Mongo aggregation (indexed on details.date), so the whole job is one query per
 * metric per clinic scope instead of loading full documents client-side.
 *
 * Only syncs the current and previous month for both 'all' and 'x-rays' scopes — the Analytics
 * page lets an admin pick older months/years, but those are historical and don't need to sit in
 * an hourly-refreshed cache; a cache-miss falls back to computing (and storing) that month
 * on-demand in the API route itself.
 */
const EMPTY_CLINIC_ANALYTICS = (): ClinicMonthAnalytics => ({
  appointments: {},
  employeesCateredTo: {},
  amountsMade: {},
  servicesPerformed: {},
});

interface DayAggRow {
  _id: string; // details.date
  appointments: number;
  employeesCateredTo: number;
  amountsMade: number;
  servicesPerformed: number;
}

function buildMatchStage(monthKey: string, type: 'all' | 'x-rays', clinic?: string) {
  const start = moment(monthKey, 'YYYY-MM').startOf('month').format('YYYY-MM-DD');
  const end = moment(monthKey, 'YYYY-MM').endOf('month').format('YYYY-MM-DD');
  const match: Record<string, unknown> = {
    'details.date': { $gte: start, $lte: end },
  };
  if (type === 'x-rays') {
    match['details.employees.services.id'] = 'x-ray';
  }
  if (clinic) {
    match['details.clinic'] = clinic;
  }
  return match;
}

async function aggregateClinicMonth(
  prodDb: Db,
  monthKey: string,
  type: 'all' | 'x-rays',
  clinic?: string
): Promise<ClinicMonthAnalytics> {
  const rows = await prodDb
    .collection('appointments')
    .aggregate<DayAggRow>([
      { $match: buildMatchStage(monthKey, type, clinic) },
      {
        $group: {
          _id: '$details.date',
          appointments: { $sum: 1 },
          employeesCateredTo: { $sum: { $size: { $ifNull: ['$details.employees', []] } } },
          amountsMade: { $sum: { $ifNull: ['$payment.amount', 0] } },
          servicesPerformed: {
            $sum: {
              $sum: {
                $map: {
                  input: { $ifNull: ['$details.employees', []] },
                  as: 'e',
                  in: { $size: { $ifNull: ['$$e.services', []] } },
                },
              },
            },
          },
        },
      },
    ])
    .toArray();

  const result = EMPTY_CLINIC_ANALYTICS();
  for (const row of rows) {
    result.appointments[row._id] = row.appointments;
    result.employeesCateredTo[row._id] = row.employeesCateredTo;
    result.amountsMade[row._id] = row.amountsMade;
    result.servicesPerformed[row._id] = row.servicesPerformed;
  }
  return result;
}

async function aggregateJoinsByDay(
  prodDb: Db,
  collectionName: string,
  monthKey: string,
  extraMatch?: Record<string, unknown>
): Promise<Record<string, number>> {
  const start = moment(monthKey, 'YYYY-MM').startOf('month').toDate();
  const end = moment(monthKey, 'YYYY-MM').endOf('month').toDate();

  const rows = await prodDb
    .collection(collectionName)
    .aggregate<{ _id: string; count: number }>([
      {
        $match: {
          'tracking.0.date': { $gte: start, $lte: end },
          ...extraMatch,
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: { $arrayElemAt: ['$tracking.date', 0] } },
          },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row._id] = row.count;
  }
  return result;
}

export async function syncFinanceAnalytics(
  prodDb: Db,
  companionDb: Db
): Promise<{ processed: number; errors: number }> {
  const monthKeys = [moment().format('YYYY-MM'), moment().subtract(1, 'month').format('YYYY-MM')];
  const types: Array<'all' | 'x-rays'> = ['all', 'x-rays'];
  const cache = companionDb.collection<FinanceAnalyticsCache>('financeAnalyticsCache');
  const now = new Date();

  let processed = 0;
  let errors = 0;

  for (const monthKey of monthKeys) {
    for (const type of types) {
      try {
        const [hendrina, churchill, allClinics, companiesJoined, usersJoined] = await Promise.all([
          aggregateClinicMonth(prodDb, monthKey, type, 'Hendrina'),
          aggregateClinicMonth(prodDb, monthKey, type, 'Churchill'),
          aggregateClinicMonth(prodDb, monthKey, type),
          aggregateJoinsByDay(prodDb, 'companies', monthKey),
          aggregateJoinsByDay(prodDb, 'users', monthKey, { role: 'client' }),
        ]);

        await cache.updateOne(
          { monthKey, type },
          {
            $set: {
              monthKey,
              type,
              hendrina,
              churchill,
              allClinics,
              companiesJoined,
              usersJoined,
              lastSyncedAt: now,
            },
          },
          { upsert: true }
        );
        processed++;
      } catch {
        errors++;
      }
    }
  }

  return { processed, errors };
}

/**
 * On-demand fallback for a month outside the hourly cache window (see module comment) — same
 * aggregation logic, just invoked directly from the API route and written through to the cache so
 * a repeat request for the same historical month is instant.
 */
export async function computeAndCacheFinanceAnalytics(
  prodDb: Db,
  companionDb: Db,
  monthKey: string,
  type: 'all' | 'x-rays'
): Promise<FinanceAnalyticsCache> {
  const [hendrina, churchill, allClinics, companiesJoined, usersJoined] = await Promise.all([
    aggregateClinicMonth(prodDb, monthKey, type, 'Hendrina'),
    aggregateClinicMonth(prodDb, monthKey, type, 'Churchill'),
    aggregateClinicMonth(prodDb, monthKey, type),
    aggregateJoinsByDay(prodDb, 'companies', monthKey),
    aggregateJoinsByDay(prodDb, 'users', monthKey, { role: 'client' }),
  ]);

  const lastSyncedAt = new Date();
  const doc: FinanceAnalyticsCache = {
    monthKey,
    type,
    hendrina,
    churchill,
    allClinics,
    companiesJoined,
    usersJoined,
    lastSyncedAt,
  };

  await companionDb
    .collection<FinanceAnalyticsCache>('financeAnalyticsCache')
    .updateOne({ monthKey, type }, { $set: doc }, { upsert: true });

  return doc;
}
