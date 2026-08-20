import type { Db } from 'mongodb';
import { calculateBookingPrice } from '../pricing';
import type { AppointmentDocument, AnomalyFlag } from '../types';

/**
 * Internal correctness check, not a client-facing feature: flags any production.appointments
 * document whose stored payment.amount doesn't match what calculateBookingPrice() recomputes
 * from that same document's employees/dover/xray selections. A mismatch means either a pricing
 * bug in one of the booking apps, or a legacy appointment predating a price change — surfaced to
 * the superadmin view only, never auto-corrected.
 *
 * Tolerance of 0.01 to absorb floating-point rounding, not a real discrepancy.
 */
const TOLERANCE = 0.01;

export async function syncAnomalyWatchdog(
  prodDb: Db,
  companionDb: Db,
  appointmentIds: string[]
): Promise<{ processed: number; errors: number }> {
  if (appointmentIds.length === 0) return { processed: 0, errors: 0 };

  const flags = companionDb.collection<AnomalyFlag>('anomalyFlags');
  const now = new Date();
  let processed = 0;
  let errors = 0;

  const appointments = await prodDb
    .collection<AppointmentDocument>('appointments')
    .find({ id: { $in: appointmentIds }, status: 'approved' })
    .toArray();

  // Every appointment in this batch gets its stale flag cleared up front (one bulk delete), then
  // only real mismatches get re-inserted (one bulk insert) — avoids a delete+insert round trip
  // pair per appointment, which is what made the first-run backlog (thousands of appointments)
  // too slow.
  await flags.deleteMany({ appointmentId: { $in: appointmentIds } });

  const newFlags: AnomalyFlag[] = [];

  for (const appt of appointments) {
    try {
      const recomputed = calculateBookingPrice(appt.details.employees);
      const stored = appt.payment?.amount ?? 0;
      const difference = Math.round((stored - recomputed) * 100) / 100;

      if (Math.abs(difference) > TOLERANCE) {
        newFlags.push({
          appointmentId: appt.id || '',
          companyId: appt.details?.company?.id || null,
          storedAmount: stored,
          recomputedAmount: recomputed,
          difference,
          flaggedAt: now,
        });
      }
      processed++;
    } catch {
      errors++;
    }
  }

  if (newFlags.length > 0) {
    await flags.insertMany(newFlags, { ordered: false });
  }

  return { processed, errors };
}
