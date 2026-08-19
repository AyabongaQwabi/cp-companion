import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import {
  getClinicLimits,
  getMonthBookings,
  resolveAvailabilityStatus,
  resolveClinicLimit,
} from '@/lib/availability';

/**
 * Powers the Availability Calendar — one aggregation covering every day in the requested month
 * (not an N+1 loop), so a client picks a good date before starting to build an appointment.
 * Priced (availability.viewCalendar, see config/action-pricing.json) — the charge happens
 * client-side via useChargedAction before this route is called, not here.
 *
 * Result is cached in cp_companion.availabilityCache per clinic+year+month for CACHE_TTL_MS,
 * same pattern as /api/insights's insightsCache — avoids re-running the aggregation on every
 * back/forward month click (or every user separately loading the same month) while staying fresh
 * enough that a booking made a few minutes ago shows up on the next real load. Explicitly busted
 * on appointment creation (see /api/appointments POST) so a booking never silently stays stale
 * for the full TTL for the clinic+month it landed in.
 */
const CACHE_TTL_MS = 2 * 60 * 1000;

function cacheKey(clinic: string, year: number, month: number) {
  return `${clinic}:${year}-${String(month).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  const clinic = req.nextUrl.searchParams.get('clinic');
  const year = parseInt(req.nextUrl.searchParams.get('year') || '', 10);
  const month = parseInt(req.nextUrl.searchParams.get('month') || '', 10);

  if (!clinic || !year || !month) {
    return NextResponse.json({ error: 'clinic, year, and month required' }, { status: 400 });
  }

  const companionDb = await getCompanionDb();
  const cacheCollection = companionDb.collection('availabilityCache');
  const key = cacheKey(clinic, year, month);

  const cached = await cacheCollection.findOne({ key });
  if (cached && Date.now() - new Date(cached.computedAt).getTime() < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const db = await getProductionDb();
  const limits = await getClinicLimits(db);
  const limit = resolveClinicLimit(limits, clinic);
  const byDate = await getMonthBookings(db, clinic, year, month);

  const days = Object.fromEntries(
    Object.entries(byDate).map(([date, { currentBookings, appointmentCount }]) => [
      date,
      {
        currentBookings,
        appointmentCount,
        remaining: Math.max(0, limit - currentBookings),
        status: resolveAvailabilityStatus(currentBookings, limit),
      },
    ])
  );

  const data = { clinic, year, month, limit, days };
  await cacheCollection.updateOne(
    { key },
    { $set: { key, data, computedAt: new Date() } },
    { upsert: true }
  );

  return NextResponse.json(data);
}
