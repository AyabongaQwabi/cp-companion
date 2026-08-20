import type { Db } from 'mongodb';
import { tryRecoverDate, isValidAppointmentDate } from '../date-recovery';

/**
 * Daily data-cleaning pass over production.appointments.details.date. Unlike the lifecycle-status
 * job, this one DOES overwrite an existing field — details.date — by design (per explicit
 * instruction), so every change is logged to cp_companion.auditLog with the before/after value
 * for traceability. It never touches any other field on the appointment.
 *
 * For each appointment whose details.date is missing, not a string, an empty/blank string, or a
 * malformed string:
 *  1. Try to recover a real date via tryRecoverDate() (see ../date-recovery.ts) — narrow,
 *     unambiguous pattern fixes only (e.g. a duplicated month digit-pair in the year, or a
 *     missing leading "20"), confirmed against real production data. Never guesses.
 *  2. If recovery fails, the date is irrecoverable: fall back to the appointment's creation date
 *     (tracking[0].date, the first CREATED tracking entry — see ../types.ts's AppointmentDocument
 *     doc comment), formatted as "YYYY-MM-DD". If even that's unavailable, the appointment is
 *     skipped and flagged rather than guessed at.
 *
 * Idempotent: re-running only touches documents whose details.date is still invalid; a document
 * fixed by a prior run is left alone.
 */

interface AppointmentRow {
  _id: unknown;
  id?: string;
  details?: { date?: unknown };
  tracking?: { type: string; date: Date }[];
}

function creationDateFallback(tracking: AppointmentRow['tracking']): string | null {
  const created = tracking?.find((t) => t.type === 'CREATED') ?? tracking?.[0];
  if (!created?.date) return null;
  const d = new Date(created.date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function syncDateCleanup(
  prodDb: Db,
  companionDb: Db
): Promise<{ processed: number; errors: number; skipped: number }> {
  const appointments = prodDb.collection('appointments');

  // Mongo can only match shape, not calendar validity — a value like "0025-07-11" is
  // shape-valid ("\d{4}-\d{2}-\d{2}") but not a real year, so it needs its own explicit branch
  // (confirmed against production: this exact "00YY-MM-DD" pattern is the only calendar-invalid-
  // but-shape-valid corruption seen in the data). isValidAppointmentDate() below does the real
  // calendar check and skips anything genuinely fine that slipped through this broad net.
  const candidates = await appointments
    .find<AppointmentRow>({
      $or: [
        { 'details.date': { $exists: false } },
        { 'details.date': { $not: { $type: 'string' } } },
        { 'details.date': { $not: /^\d{4}-\d{2}-\d{2}$/ } },
        { 'details.date': { $regex: /^00\d{2}-\d{2}-\d{2}$/ } },
      ],
    })
    .project({ id: 1, 'details.date': 1, tracking: 1 })
    .toArray();

  const auditLog = companionDb.collection('auditLog');
  const now = new Date();
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (const appt of candidates) {
    try {
      const currentDate = appt.details?.date;
      if (isValidAppointmentDate(currentDate)) continue; // shape-valid net can over-match; skip real dates it swept in

      let nextDate: string | null = null;
      let method: 'recovered' | 'creation-fallback' | null = null;

      if (typeof currentDate === 'string' && currentDate.trim().length > 0) {
        nextDate = tryRecoverDate(currentDate);
        if (nextDate) method = 'recovered';
      }

      if (!nextDate) {
        nextDate = creationDateFallback(appt.tracking);
        if (nextDate) method = 'creation-fallback';
      }

      if (!nextDate || !method) {
        await auditLog.insertOne({
          action: 'APPOINTMENT_DATE_CLEANUP_SKIPPED',
          appointmentId: appt.id,
          reason: 'no recoverable date and no usable creation timestamp',
          previousValue: currentDate ?? null,
          at: now,
        });
        skipped++;
        continue;
      }

      await appointments.updateOne(
        { _id: appt._id },
        { $set: { 'details.date': nextDate } }
      );

      await auditLog.insertOne({
        action: 'APPOINTMENT_DATE_CLEANUP_FIXED',
        appointmentId: appt.id,
        method,
        previousValue: currentDate ?? null,
        newValue: nextDate,
        at: now,
      });

      processed++;
    } catch (err) {
      errors++;
      await auditLog.insertOne({
        action: 'APPOINTMENT_DATE_CLEANUP_ERROR',
        appointmentId: appt.id,
        error: err instanceof Error ? err.message : String(err),
        at: now,
      });
    }
  }

  return { processed, errors, skipped };
}
