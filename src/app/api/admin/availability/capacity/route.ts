import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { getClinicLimits, getMonthBookings, resolveAvailabilityStatus, resolveClinicLimit } from '@/lib/availability';

/**
 * Admin equivalent of GET /api/availability/month (cp-companion's own clinic-wide capacity
 * calendar) — reuses the exact same shared aggregation (getClinicLimits/getMonthBookings/
 * resolveAvailabilityStatus/resolveClinicLimit from src/lib/availability.ts), not a
 * reimplementation, so the two calendars can never silently drift apart on what "open" /
 * "filling" / "full" means. Distinct from the sibling /api/admin/availability route, which
 * enumerates individual employees' booked dates rather than a clinic-wide headcount total.
 *
 * No day-level route needed here for the admin's day/week views — a single month fetch already
 * returns one entry per day, so a "day" or "week" view is just this same data windowed down on
 * the client, not a separate query.
 *
 * Not cached (unlike /api/availability/month's 2-minute cache) — this is an internal admin tool
 * read far less often than the client-facing calendar, so the extra freshness isn't worth the
 * added cp_companion.availabilityCache coupling.
 */
export async function OPTIONS() {
  return adminStatsCorsPreflight();
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
    const limits = await getClinicLimits(prodDb);
    const limit = resolveClinicLimit(limits, clinic);
    const byDate = await getMonthBookings(prodDb, clinic, year, month);

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

    return withAdminStatsCors(NextResponse.json({ clinic, year, month, limit, days }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
