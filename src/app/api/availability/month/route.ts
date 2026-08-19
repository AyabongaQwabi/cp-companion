import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb } from '@/lib/mongodb';
import {
  getClinicLimits,
  getMonthBookings,
  resolveAvailabilityStatus,
  resolveClinicLimit,
} from '@/lib/availability';

/**
 * Powers the Availability Calendar — one aggregation covering every day in the requested month
 * (not an N+1 loop), so a client picks a good date before starting to build an appointment.
 * Free (availability.viewCalendar = 0 credits), so no charge branch here.
 */
export async function GET(req: NextRequest) {
  const clinic = req.nextUrl.searchParams.get('clinic');
  const year = parseInt(req.nextUrl.searchParams.get('year') || '', 10);
  const month = parseInt(req.nextUrl.searchParams.get('month') || '', 10);

  if (!clinic || !year || !month) {
    return NextResponse.json({ error: 'clinic, year, and month required' }, { status: 400 });
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

  return NextResponse.json({ clinic, year, month, limit, days });
}
