import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb } from '@/lib/mongodb';
import { getClinicLimits, getSameDayBookings, resolveClinicLimit } from '@/lib/availability';
import { chargeForAction } from '@/lib/credits';

/**
 * Read-only equivalent of GET_SYSTEM_SETTINGS + GET_APPOINTMENTS_FOR_DATE_COUNT from
 * clinicplus-server-latest-stable-version, used by cp-redesign's RemainingSlots.js to show
 * live booking-capacity feedback before submit. Exposed here as its own endpoint (rather than
 * only checked at submit time in /api/appointments) so the UI can show remaining capacity for
 * any clinic/date the user is considering — not just the one they're about to submit.
 *
 * Pricing (F.1: "check clinic/date availability" = 10 credits) only applies when charge=1 is
 * passed — the standalone CheckAvailability tool sends it; BookingStatus's automatic live
 * display while building an appointment does not, since charging on every clinic/date change
 * while browsing would be aggressive and would discourage the exact checking behavior that
 * protects users from the 50-credit appointment-creation charge.
 */
export async function GET(req: NextRequest) {
  const clinic = req.nextUrl.searchParams.get('clinic');
  const date = req.nextUrl.searchParams.get('date');
  const shouldCharge = req.nextUrl.searchParams.get('charge') === '1';
  const userId = req.nextUrl.searchParams.get('userId');

  if (!clinic || !date) {
    return NextResponse.json({ error: 'clinic and date required' }, { status: 400 });
  }

  if (shouldCharge) {
    if (!userId) {
      return NextResponse.json({ error: 'userId required when charge=1' }, { status: 400 });
    }
    const charge = await chargeForAction(userId, 'booking.checkAvailability');
    if (!charge.ok) {
      return NextResponse.json(charge, { status: 402 });
    }
  }

  const db = await getProductionDb();

  const limits = await getClinicLimits(db);
  const limit = resolveClinicLimit(limits, clinic);
  const { currentBookings, appointmentCount } = await getSameDayBookings(db, clinic, date);

  return NextResponse.json({
    clinic,
    date,
    limit,
    currentBookings,
    appointmentCount,
    remaining: Math.max(0, limit - currentBookings),
  });
}
