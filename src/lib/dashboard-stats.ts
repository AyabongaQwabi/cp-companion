import type { Db } from 'mongodb';
import moment from 'moment';

/**
 * Replaces the legacy GET_STATS socket handler
 * (clinincplus-server-latest-stable-version/lib/data/get/index.js getStats/getAppointmentStats),
 * which loaded the *entire* appointments collection (all-time, no date bound) into Node and then
 * re-filtered that full in-memory array once per stat per period — the main cause of the admin
 * dashboard's 5-minute load, worsened by console.log-ing full arrays on every step.
 *
 * Computed live (not cached by the hourly sync job) because "Today"/"Yesterday" must reflect
 * same-day bookings — staleness up to an hour would be wrong here. It's still fast: a single
 * Mongo aggregation per period, matched against the existing details.date index, with Mongo doing
 * the counting instead of Node.
 */

const DATE_FORMAT = 'YYYY-MM-DD';

export interface PeriodStats {
  employees: { count: number; countDiferennce: number };
  messages: { count: number; countDiferennce: number };
  pending: { count: number; countDiferennce: number };
  upcoming: { count: number; countDiferennce: number };
  quotesSent: { count: number; countDiferennce: number };
  quotesPending: { count: number; countDiferennce: number };
  hendrina: { count: number; countDiferennce: number };
  churchill: { count: number; countDiferennce: number };
  topServices: { count: { id: string; count: number; title: string }[]; countDiferennce: number };
}

interface PeriodAggRow {
  _id: null;
  count: number;
  employeeCount: number;
  messageCount: number;
  pendingCount: number;
  approvedCount: number;
  quoteSentCount: number;
  quoteNotSentCount: number;
  hendrinaCount: number;
  churchillCount: number;
}

function buildDateMatch(type: 'all' | 'x-rays', start: string, end?: string) {
  const match: Record<string, unknown> = {
    'details.date': end ? { $gte: start, $lte: end } : start,
  };
  if (type === 'x-rays') {
    match['details.employees.services.id'] = 'x-ray';
  }
  return match;
}

async function aggregatePeriod(
  prodDb: Db,
  type: 'all' | 'x-rays',
  date: string
): Promise<PeriodAggRow> {
  const rows = await prodDb
    .collection('appointments')
    .aggregate<PeriodAggRow>([
      { $match: buildDateMatch(type, date) },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          employeeCount: { $sum: { $size: { $ifNull: ['$details.employees', []] } } },
          messageCount: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    { $ifNull: [{ $arrayElemAt: ['$messages.author.role', -1] }, null] },
                    'client',
                  ],
                },
                1,
                0,
              ],
            },
          },
          pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          approvedCount: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          quoteSentCount: { $sum: { $cond: [{ $eq: ['$payment.quoteSent', true] }, 1, 0] } },
          quoteNotSentCount: { $sum: { $cond: [{ $ne: ['$payment.quoteSent', true] }, 1, 0] } },
          hendrinaCount: {
            $sum: { $cond: [{ $eq: [{ $toLower: '$details.clinic' }, 'hendrina'] }, 1, 0] },
          },
          churchillCount: {
            $sum: { $cond: [{ $eq: [{ $toLower: '$details.clinic' }, 'churchill'] }, 1, 0] },
          },
        },
      },
    ])
    .toArray();

  return (
    rows[0] ?? {
      _id: null,
      count: 0,
      employeeCount: 0,
      messageCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      quoteSentCount: 0,
      quoteNotSentCount: 0,
      hendrinaCount: 0,
      churchillCount: 0,
    }
  );
}

async function topServicesForPeriod(
  prodDb: Db,
  type: 'all' | 'x-rays',
  date: string
): Promise<{ id: string; count: number; title: string }[]> {
  const rows = await prodDb
    .collection('appointments')
    .aggregate<{ _id: string; count: number }>([
      { $match: buildDateMatch(type, date) },
      { $unwind: '$details.employees' },
      { $unwind: '$details.employees.services' },
      { $group: { _id: '$details.employees.services.id', count: { $sum: 1 } } },
      { $sort: { count: 1 } },
      { $limit: 3 },
    ])
    .toArray();

  return rows.map((r) => ({
    id: r._id,
    count: r.count,
    title: r._id
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
  }));
}

function toPeriodStats(current: PeriodAggRow, previous: PeriodAggRow, topServices: {
  count: { id: string; count: number; title: string }[];
}): PeriodStats {
  return {
    employees: { count: current.employeeCount, countDiferennce: current.count - previous.count },
    messages: {
      count: current.messageCount,
      countDiferennce: current.messageCount - previous.messageCount,
    },
    pending: {
      count: current.pendingCount,
      countDiferennce: current.pendingCount - previous.pendingCount,
    },
    upcoming: {
      count: current.approvedCount,
      countDiferennce: current.approvedCount - previous.approvedCount,
    },
    quotesSent: {
      count: current.quoteSentCount,
      countDiferennce: current.quoteSentCount - previous.quoteSentCount,
    },
    quotesPending: {
      count: current.quoteNotSentCount,
      countDiferennce: current.quoteNotSentCount - previous.quoteNotSentCount,
    },
    hendrina: {
      count: current.hendrinaCount,
      countDiferennce: current.hendrinaCount - previous.hendrinaCount,
    },
    churchill: {
      count: current.churchillCount,
      countDiferennce: current.churchillCount - previous.churchillCount,
    },
    topServices: { count: topServices.count, countDiferennce: 0 },
  };
}

async function getPeriodStats(
  prodDb: Db,
  type: 'all' | 'x-rays',
  date: string,
  previousDate: string
): Promise<PeriodStats> {
  const [current, previous, topServices] = await Promise.all([
    aggregatePeriod(prodDb, type, date),
    aggregatePeriod(prodDb, type, previousDate),
    topServicesForPeriod(prodDb, type, date),
  ]);
  return toPeriodStats(current, previous, { count: topServices });
}

async function getRangeStats(
  prodDb: Db,
  type: 'all' | 'x-rays',
  start: string,
  end: string,
  prevStart: string,
  prevEnd: string
): Promise<PeriodStats> {
  const matchRange = (s: string, e: string) => {
    const match = buildDateMatch(type, s, e);
    return match;
  };

  const aggregateRange = async (s: string, e: string) => {
    const rows = await prodDb
      .collection('appointments')
      .aggregate<PeriodAggRow>([
        { $match: matchRange(s, e) },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            employeeCount: { $sum: { $size: { $ifNull: ['$details.employees', []] } } },
            messageCount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      { $ifNull: [{ $arrayElemAt: ['$messages.author.role', -1] }, null] },
                      'client',
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            approvedCount: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
            quoteSentCount: { $sum: { $cond: [{ $eq: ['$payment.quoteSent', true] }, 1, 0] } },
            quoteNotSentCount: { $sum: { $cond: [{ $ne: ['$payment.quoteSent', true] }, 1, 0] } },
            hendrinaCount: {
              $sum: { $cond: [{ $eq: [{ $toLower: '$details.clinic' }, 'hendrina'] }, 1, 0] },
            },
            churchillCount: {
              $sum: { $cond: [{ $eq: [{ $toLower: '$details.clinic' }, 'churchill'] }, 1, 0] },
            },
          },
        },
      ])
      .toArray();
    return (
      rows[0] ?? {
        _id: null,
        count: 0,
        employeeCount: 0,
        messageCount: 0,
        pendingCount: 0,
        approvedCount: 0,
        quoteSentCount: 0,
        quoteNotSentCount: 0,
        hendrinaCount: 0,
        churchillCount: 0,
      }
    );
  };

  const topServicesForRange = async (s: string, e: string) => {
    const rows = await prodDb
      .collection('appointments')
      .aggregate<{ _id: string; count: number }>([
        { $match: matchRange(s, e) },
        { $unwind: '$details.employees' },
        { $unwind: '$details.employees.services' },
        { $group: { _id: '$details.employees.services.id', count: { $sum: 1 } } },
        { $sort: { count: 1 } },
        { $limit: 3 },
      ])
      .toArray();
    return rows.map((r) => ({
      id: r._id,
      count: r.count,
      title: r._id
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
    }));
  };

  const [current, previous, topServices] = await Promise.all([
    aggregateRange(start, end),
    aggregateRange(prevStart, prevEnd),
    topServicesForRange(start, end),
  ]);

  return toPeriodStats(current, previous, { count: topServices });
}

async function getLatestAppointments(prodDb: Db, type: 'all' | 'x-rays') {
  const match: Record<string, unknown> = { 'details.date': { $exists: true } };
  if (type === 'x-rays') {
    match['details.employees.services.id'] = 'x-ray';
  }
  return prodDb
    .collection('appointments')
    .find(match)
    .sort({ 'details.date': -1 })
    .limit(15)
    .toArray();
}

async function getLatestMessages(prodDb: Db, type: 'all' | 'x-rays') {
  const match: Record<string, unknown> = {
    'details.date': { $exists: true },
    'messages.0': { $exists: true },
  };
  if (type === 'x-rays') {
    match['details.employees.services.id'] = 'x-ray';
  }
  const appointments = await prodDb
    .collection('appointments')
    .find(match)
    .project({ id: 1, 'details.company.name': 1, messages: 1 })
    .sort({ 'messages.createdAt': -1 })
    .limit(50)
    .toArray();

  const messages = appointments
    .map((appointment) => {
      const clientMessages = (appointment.messages || []).filter(
        (m: { author?: { role?: string } }) => m?.author?.role === 'client'
      );
      const last = clientMessages[clientMessages.length - 1];
      if (!last) return null;
      return {
        ...last,
        company: appointment.details?.company?.name,
        appointment: appointment.id,
      };
    })
    .filter(Boolean) as Array<{ createdAt: string; company: string; appointment: string }>;

  return messages
    .sort((a, b) => (moment(a.createdAt).isBefore(moment(b.createdAt)) ? 1 : -1))
    .slice(0, 5);
}

export interface RevenueTrendPoint {
  date: string; // YYYY-MM-DD
  amount: number;
  appointments: number;
}

export interface QuoteBacklogBuckets {
  '0-3d': number;
  '4-7d': number;
  '8d+': number;
}

export interface ClinicComparison {
  clinic: string;
  appointments: number;
  amount: number;
  employeesCateredTo: number;
}

export interface TopCompany {
  name: string;
  appointments: number;
  amount: number;
}

export interface StatusBreakdown {
  pending: number;
  approved: number;
  declined: number;
}

async function getRevenueTrend(
  prodDb: Db,
  type: 'all' | 'x-rays',
  days: number
): Promise<RevenueTrendPoint[]> {
  const start = moment().subtract(days - 1, 'days').format(DATE_FORMAT);
  const end = moment().format(DATE_FORMAT);
  const match = buildDateMatch(type, start, end);

  const rows = await prodDb
    .collection('appointments')
    .aggregate<{ _id: string; amount: number; appointments: number }>([
      { $match: match },
      {
        $group: {
          _id: '$details.date',
          amount: { $sum: { $ifNull: ['$payment.amount', 0] } },
          appointments: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const byDate = new Map(rows.map((r) => [r._id, r]));
  const points: RevenueTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const date = moment(start, DATE_FORMAT).add(i, 'days').format(DATE_FORMAT);
    const row = byDate.get(date);
    points.push({ date, amount: row?.amount ?? 0, appointments: row?.appointments ?? 0 });
  }
  return points;
}

async function getQuoteBacklogAging(
  prodDb: Db,
  type: 'all' | 'x-rays'
): Promise<QuoteBacklogBuckets> {
  const match: Record<string, unknown> = {
    'payment.quoteSent': { $ne: true },
    status: { $ne: 'declined' },
  };
  if (type === 'x-rays') {
    match['details.employees.services.id'] = 'x-ray';
  }

  const rows = await prodDb
    .collection('appointments')
    .find(match)
    .project({ 'details.date': 1 })
    .toArray();

  const buckets: QuoteBacklogBuckets = { '0-3d': 0, '4-7d': 0, '8d+': 0 };
  const now = moment();
  for (const row of rows) {
    const date = (row as { details?: { date?: string } }).details?.date;
    if (!date) continue;
    const daysAgo = now.diff(moment(date, DATE_FORMAT), 'days');
    if (daysAgo <= 3) buckets['0-3d']++;
    else if (daysAgo <= 7) buckets['4-7d']++;
    else buckets['8d+']++;
  }
  return buckets;
}

async function getClinicComparison(
  prodDb: Db,
  type: 'all' | 'x-rays',
  start: string,
  end: string
): Promise<ClinicComparison[]> {
  const match = buildDateMatch(type, start, end);
  const rows = await prodDb
    .collection('appointments')
    .aggregate<{ _id: string; appointments: number; amount: number; employeesCateredTo: number }>([
      { $match: match },
      {
        $group: {
          _id: '$details.clinic',
          appointments: { $sum: 1 },
          amount: { $sum: { $ifNull: ['$payment.amount', 0] } },
          employeesCateredTo: { $sum: { $size: { $ifNull: ['$details.employees', []] } } },
        },
      },
    ])
    .toArray();

  return rows
    .filter((r) => r._id)
    .map((r) => ({
      clinic: r._id,
      appointments: r.appointments,
      amount: r.amount,
      employeesCateredTo: r.employeesCateredTo,
    }));
}

async function getTopCompanies(
  prodDb: Db,
  type: 'all' | 'x-rays',
  start: string,
  end: string,
  limit: number
): Promise<TopCompany[]> {
  const match = buildDateMatch(type, start, end);
  const rows = await prodDb
    .collection('appointments')
    .aggregate<{ _id: string; appointments: number; amount: number }>([
      { $match: match },
      {
        $group: {
          _id: '$details.company.name',
          appointments: { $sum: 1 },
          amount: { $sum: { $ifNull: ['$payment.amount', 0] } },
        },
      },
      { $sort: { appointments: -1 } },
      { $limit: limit },
    ])
    .toArray();

  return rows.filter((r) => r._id).map((r) => ({ name: r._id, appointments: r.appointments, amount: r.amount }));
}

async function getStatusBreakdown(
  prodDb: Db,
  type: 'all' | 'x-rays',
  start: string,
  end: string
): Promise<StatusBreakdown> {
  const match = buildDateMatch(type, start, end);
  const rows = await prodDb
    .collection('appointments')
    .aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ])
    .toArray();

  const breakdown: StatusBreakdown = { pending: 0, approved: 0, declined: 0 };
  for (const row of rows) {
    if (row._id === 'pending' || row._id === 'approved' || row._id === 'declined') {
      breakdown[row._id] = row.count;
    }
  }
  return breakdown;
}

export async function getDashboardStats(prodDb: Db, type: 'all' | 'x-rays') {
  const today = moment().format(DATE_FORMAT);
  const yesterday = moment().subtract(1, 'days').format(DATE_FORMAT);
  const twoDaysAgo = moment().subtract(2, 'days').format(DATE_FORMAT);
  const thisMonthStart = moment().startOf('month').format(DATE_FORMAT);
  const thisMonthEnd = moment().endOf('month').format(DATE_FORMAT);
  const lastMonthStart = moment().subtract(1, 'month').startOf('month').format(DATE_FORMAT);
  const lastMonthEnd = moment().subtract(1, 'month').endOf('month').format(DATE_FORMAT);
  const twoMonthsAgoStart = moment().subtract(2, 'month').startOf('month').format(DATE_FORMAT);
  const twoMonthsAgoEnd = moment().subtract(2, 'month').endOf('month').format(DATE_FORMAT);

  const [
    todayStats,
    yesterdayStats,
    thisMonthStats,
    lastMonthStats,
    latestAppointments,
    latestMessages,
    revenueTrend,
    quoteBacklog,
    clinicComparison,
    topCompanies,
    statusBreakdown,
  ] = await Promise.all([
    getPeriodStats(prodDb, type, today, yesterday),
    getPeriodStats(prodDb, type, yesterday, twoDaysAgo),
    getRangeStats(prodDb, type, thisMonthStart, thisMonthEnd, lastMonthStart, lastMonthEnd),
    getRangeStats(prodDb, type, lastMonthStart, lastMonthEnd, twoMonthsAgoStart, twoMonthsAgoEnd),
    getLatestAppointments(prodDb, type),
    getLatestMessages(prodDb, type),
    getRevenueTrend(prodDb, type, 30),
    getQuoteBacklogAging(prodDb, type),
    getClinicComparison(prodDb, type, thisMonthStart, thisMonthEnd),
    getTopCompanies(prodDb, type, thisMonthStart, thisMonthEnd, 5),
    getStatusBreakdown(prodDb, type, thisMonthStart, thisMonthEnd),
  ]);

  const toTitledList = (stats: PeriodStats) => {
    const titleCase = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
    return Object.entries(stats).map(([key, value]) => ({
      title: key === 'topServices' ? 'Top Services' : titleCase(key),
      count: value,
    }));
  };

  return {
    stats: {
      today: toTitledList(todayStats),
      yesterday: toTitledList(yesterdayStats),
      thisMonth: toTitledList(thisMonthStats),
      lastMonth: toTitledList(lastMonthStats),
    },
    latestAppointments,
    latestMessages,
    insights: {
      revenueTrend,
      quoteBacklog,
      clinicComparison,
      topCompanies,
      statusBreakdown,
    },
  };
}
