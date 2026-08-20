import { NextRequest, NextResponse } from 'next/server';
import type { Db } from 'mongodb';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { MEDICAL_SERVICES } from '@/lib/clinicplus-constants';
import { computeBenchmarks, type Benchmarks } from '@/lib/benchmarking';

interface AppointmentDoc {
  status: string;
  payment?: { amount?: number };
  details?: {
    date?: string;
    company?: { id?: string; name?: string };
    employees?: { services?: { id: string; price: number }[] }[];
  };
}

export interface InsightsData {
  totalAppointments: number;
  monthlyVolume: { month: string; count: number }[];
  lifecycle: { approved: number; pending: number; declined: number; abandoned: number };
  financials: { collected: number; pending: number; declined: number };
  serviceBreakdown: { id: string; title: string; count: number; revenue: number }[];
  companyBreakdown: {
    id: string;
    name: string;
    collected: number;
    pending: number;
    declined: number;
    appointments: number;
  }[];
  // One entry per company in companyBreakdown that clears the section-1 minimum-cohort-size
  // guardrail (MIN_COHORT_SIZE in src/lib/benchmarking.ts) — a company below that threshold is
  // simply absent here, never included with a smaller/fallback cohort. Never contains another
  // company's name, id, or raw figures — only cohort aggregates and this company's own position.
  benchmarks: { companyId: string; companyName: string; benchmarks: Benchmarks }[];
}

// Part F.2 — cache computed Insights per user; invalidated either by TTL or explicitly when a
// new appointment is created for that user (see /api/appointments' cache-bust call). Opening
// this page now costs the user real credits (F.1), so a paid page-open shouldn't also be slow.
const CACHE_TTL_MS = 5 * 60 * 1000;

async function computeInsights(userId: string, companionDb: Db): Promise<InsightsData> {
  const db = await getProductionDb();
  const query = { 'usersWhoCanManage.id': userId };

  const [live, deleted] = await Promise.all([
    db.collection('appointments').find(query).toArray(),
    db.collection('deleted_appointments').find(query).toArray(),
  ]);

  const liveTyped = live as unknown as AppointmentDoc[];
  const deletedTyped = deleted as unknown as AppointmentDoc[];
  const all = [...liveTyped, ...deletedTyped];

  let revenueCollected = 0;
  let revenuePending = 0;
  let revenueDeclined = 0;
  let approvedCount = 0;
  let pendingCount = 0;
  let declinedCount = 0;
  let abandonedCount = 0;
  const monthly: Record<string, number> = {};
  const serviceCounts: Record<string, { count: number; revenue: number }> = {};
  const byCompany: Record<
    string,
    { name: string; collected: number; pending: number; declined: number; appointments: number }
  > = {};

  const bucketCompany = (appt: AppointmentDoc) => {
    const id = appt.details?.company?.id;
    const name = appt.details?.company?.name || 'Unknown company';
    if (!id) return null;
    if (!byCompany[id]) {
      byCompany[id] = { name, collected: 0, pending: 0, declined: 0, appointments: 0 };
    }
    byCompany[id].appointments += 1;
    return byCompany[id];
  };

  for (const appt of liveTyped) {
    const amount = appt.payment?.amount || 0;
    const companyBucket = bucketCompany(appt);
    if (appt.status === 'approved') {
      revenueCollected += amount;
      approvedCount += 1;
      if (companyBucket) companyBucket.collected += amount;
    } else if (appt.status === 'pending') {
      revenuePending += amount;
      pendingCount += 1;
      if (companyBucket) companyBucket.pending += amount;
    } else if (appt.status === 'declined') {
      revenueDeclined += amount;
      declinedCount += 1;
      if (companyBucket) companyBucket.declined += amount;
    }

    const date = appt.details?.date;
    if (date) {
      const month = date.slice(0, 7);
      monthly[month] = (monthly[month] || 0) + 1;
    }

    for (const emp of appt.details?.employees || []) {
      for (const svc of emp.services || []) {
        if (!serviceCounts[svc.id]) serviceCounts[svc.id] = { count: 0, revenue: 0 };
        serviceCounts[svc.id].count += 1;
        serviceCounts[svc.id].revenue += svc.price || 0;
      }
    }
  }

  for (const appt of deletedTyped) {
    if (appt.status === 'pending') {
      abandonedCount += 1;
    } else if (appt.status === 'approved') {
      // Deletion here is soft/administrative, not a refund — still counted as collected revenue,
      // flagged per the methodology note in PHASE_1C_PAYMENT_MODEL_RESOLVED.md.
      const amount = appt.payment?.amount || 0;
      revenueCollected += amount;
      approvedCount += 1;
      const companyBucket = bucketCompany(appt);
      if (companyBucket) companyBucket.collected += amount;
    }
  }

  const serviceBreakdown = Object.entries(serviceCounts)
    .map(([id, v]) => ({
      id,
      title: MEDICAL_SERVICES[id]?.title || id,
      count: v.count,
      revenue: v.revenue,
    }))
    .sort((a, b) => b.count - a.count);

  const companyBreakdown = Object.entries(byCompany)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.appointments - a.appointments);

  const benchmarkResults = await Promise.all(
    companyBreakdown.map(async (c) => ({
      companyId: c.id,
      companyName: c.name,
      benchmarks: await computeBenchmarks(companionDb, c.id),
    }))
  );
  const benchmarks = benchmarkResults.filter(
    (r): r is { companyId: string; companyName: string; benchmarks: Benchmarks } => r.benchmarks !== null
  );

  return {
    totalAppointments: all.length,
    monthlyVolume: Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count })),
    lifecycle: {
      approved: approvedCount,
      pending: pendingCount,
      declined: declinedCount,
      abandoned: abandonedCount,
    },
    financials: {
      collected: revenueCollected,
      pending: revenuePending,
      declined: revenueDeclined,
    },
    serviceBreakdown,
    companyBreakdown,
    benchmarks,
  };
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const companionDb = await getCompanionDb();
  const cacheCollection = companionDb.collection('insightsCache');

  const cached = await cacheCollection.findOne({ userId });
  if (cached && Date.now() - new Date(cached.computedAt).getTime() < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const data = await computeInsights(userId, companionDb);
  await cacheCollection.updateOne(
    { userId },
    { $set: { userId, data, computedAt: new Date() } },
    { upsert: true }
  );

  return NextResponse.json(data);
}
