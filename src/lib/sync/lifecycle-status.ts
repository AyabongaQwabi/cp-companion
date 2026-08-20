import type { Db } from 'mongodb';

/**
 * Daily lifecycle-enrichment pass over production.appointments. Additive-only: every write here
 * is a $set of new top-level fields (lifecycleStatus, lifecycleStatusReason, lifecycleStatusSetAt,
 * pipelineComplete, pipelineCompletedAt) — it never touches status, isComplete, isVoided, payment,
 * or any other existing field. See AppointmentDocument in ../types.ts for the field shapes.
 *
 * The rule set (confirmed with Aya, mirrors PHASE_1C_PAYMENT_MODEL_RESOLVED.md's "status is the
 * only authoritative payment signal" rule — proofOfPayment is optional supporting evidence, not
 * proof of anything on its own):
 *
 * Only appointments whose details.date (the appointment/service date, not tracking[0]'s creation
 * date) is more than STALE_MONTHS old are considered at all.
 *
 *  - status === 'pending', no payment.proofOfPayment attached
 *      -> lifecycleStatus = 'expired' (never resolved either way, no longer operationally relevant)
 *  - status === 'pending', has payment.proofOfPayment attached
 *      -> lifecycleStatus = 'approved' (payment evidence exists; this should have been actioned)
 *  - status === 'approved', AND details.date has already passed (the service actually happened,
 *    as opposed to a far-future prebooking that merely happens to be >3 months old already)
 *      -> lifecycleStatus = 'completed', pipelineComplete = true, pipelineCompletedAt = now
 *
 * Every write is idempotent: re-running only changes documents whose derived lifecycleStatus
 * differs from what's already stored, and never regresses a document (e.g. a document already
 * marked 'completed' is left alone even if some other rule would also match it).
 */
const STALE_MONTHS = 3;

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

function hasProofOfPayment(proofOfPayment: unknown): boolean {
  if (Array.isArray(proofOfPayment)) return proofOfPayment.length > 0;
  return typeof proofOfPayment === 'string' && proofOfPayment.trim().length > 0;
}

interface AppointmentRow {
  _id: unknown;
  id?: string;
  status: 'pending' | 'approved' | 'declined';
  details?: { date?: string };
  payment?: { proofOfPayment?: unknown };
  lifecycleStatus?: string;
}

export async function syncLifecycleStatus(prodDb: Db): Promise<{ processed: number; errors: number }> {
  const cutoff = monthsAgo(STALE_MONTHS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const appointments = prodDb.collection('appointments');

  const candidates = await appointments
    .find<AppointmentRow>({
      'details.date': { $lt: cutoffIso },
      status: { $in: ['pending', 'approved'] },
    })
    .project({ id: 1, status: 1, 'details.date': 1, 'payment.proofOfPayment': 1, lifecycleStatus: 1 })
    .toArray();

  let processed = 0;
  let errors = 0;

  for (const appt of candidates) {
    try {
      const appointmentDate = appt.details?.date;
      if (!appointmentDate) continue;

      let nextLifecycleStatus: 'expired' | 'approved' | 'completed' | null = null;
      let reason = '';

      if (appt.status === 'pending') {
        if (hasProofOfPayment(appt.payment?.proofOfPayment)) {
          nextLifecycleStatus = 'approved';
          reason = 'pending appointment older than 3 months with proof of payment attached';
        } else {
          nextLifecycleStatus = 'expired';
          reason = 'pending appointment older than 3 months with no proof of payment; no longer relevant';
        }
      } else if (appt.status === 'approved') {
        // Only "completed" if the appointment date has actually passed — a far-future prebooking
        // that happens to already be >3 months old (booked long in advance) has not happened yet.
        if (appointmentDate < today) {
          nextLifecycleStatus = 'completed';
          reason = 'approved appointment older than 3 months whose service date has passed';
        }
      }

      if (!nextLifecycleStatus || nextLifecycleStatus === appt.lifecycleStatus) continue;

      const setFields: Record<string, unknown> = {
        lifecycleStatus: nextLifecycleStatus,
        lifecycleStatusReason: reason,
        lifecycleStatusSetAt: now,
      };
      if (nextLifecycleStatus === 'completed') {
        setFields.pipelineComplete = true;
        setFields.pipelineCompletedAt = now;
      }

      await appointments.updateOne({ _id: appt._id }, { $set: setFields });
      processed++;
    } catch {
      errors++;
    }
  }

  return { processed, errors };
}
