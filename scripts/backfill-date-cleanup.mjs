#!/usr/bin/env node

import fs from 'fs';
import { MongoClient } from 'mongodb';

/**
 * One-off backfill: applies the same date-cleanup rules as the daily cron
 * (src/app/api/cron/date-cleanup/route.ts / src/lib/sync/date-cleanup.ts) to every existing
 * appointment in production.appointments, so the ~391 known-bad dates (missing, null, empty
 * string, or malformed strings like "202608-08-18" caused by an HTML date picker bug) don't have
 * to wait for the daily job to pick each one up individually the next time it happens to run.
 *
 * DESTRUCTIVE: overwrites details.date on matching documents. Every change is logged to
 * cp_companion.auditLog (action APPOINTMENT_DATE_CLEANUP_FIXED / _SKIPPED / _ERROR) with the
 * before/after value. Never touches any other field. Idempotent: safe to re-run.
 *
 * Recovery rules (see ../src/lib/date-recovery.ts for the full, tested logic):
 *  1. Try to recover a real date from the malformed string via narrow, unambiguous pattern
 *     fixes (duplicated month digits injected into the year, or a missing leading "20").
 *  2. If that fails, fall back to the appointment's creation date (tracking[0]'s CREATED entry).
 *  3. If neither works (no creation timestamp either), skip and log — never guesses.
 */
const MIN_SANE_YEAR = 2015;
const MAX_SANE_YEAR = 2035;

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function isSaneYear(y) {
  return Number.isInteger(y) && y >= MIN_SANE_YEAR && y <= MAX_SANE_YEAR;
}

function isValidCalendarDate(year, month, day) {
  if (month < 1 || month > 12) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function recoverOverlongYear(yearPart, month) {
  if (yearPart.length <= 4) return null;
  const first4 = yearPart.slice(0, 4);
  const last4 = yearPart.slice(-4);
  const leftoverAfterFirst4 = yearPart.slice(4);
  const leftoverBeforeLast4 = yearPart.slice(0, yearPart.length - 4);

  if (isSaneYear(Number(first4)) && leftoverAfterFirst4 === month) return first4;
  if (isSaneYear(Number(last4)) && leftoverBeforeLast4 === month) return last4;

  const nRemove = yearPart.length - 4;
  if (nRemove === 1) {
    const saneRemovals = new Set();
    for (let i = 0; i < yearPart.length; i++) {
      const candidate = yearPart.slice(0, i) + yearPart.slice(i + 1);
      if (isSaneYear(Number(candidate))) saneRemovals.add(candidate);
    }
    if (saneRemovals.size === 1) return [...saneRemovals][0];
  }
  return null;
}

function recoverMissingLeadingDigits(yearPart) {
  if (yearPart.length !== 4) return null;
  if (!yearPart.startsWith('00')) return null;
  const candidate = `20${yearPart.slice(2)}`;
  return isSaneYear(Number(candidate)) ? candidate : null;
}

function tryRecoverDate(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+)-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, yearPart, month, day] = match;
  if (yearPart.length === 0) return null;

  let recoveredYear = null;
  if (yearPart.length === 4) {
    const y = Number(yearPart);
    recoveredYear = isSaneYear(y) ? yearPart : recoverMissingLeadingDigits(yearPart);
  } else {
    recoveredYear = recoverOverlongYear(yearPart, month);
  }
  if (!recoveredYear) return null;

  const year = Number(recoveredYear);
  const monthNum = Number(month);
  const dayNum = Number(day);
  if (!isValidCalendarDate(year, monthNum, dayNum)) return null;

  return `${recoveredYear}-${month}-${day}`;
}

function isValidAppointmentDate(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, y, m, d] = match;
  return isValidCalendarDate(Number(y), Number(m), Number(d));
}

function creationDateFallback(tracking) {
  const created = tracking?.find((t) => t.type === 'CREATED') ?? tracking?.[0];
  if (!created?.date) return null;
  const d = new Date(created.date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

log('Date cleanup backfill starting');

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2];
  }
}

const client = await new MongoClient(process.env.DATABASE_URL).connect();
const prodDb = client.db(process.env.SELECTED_DB || 'production');
const companionDb = client.db(process.env.COMPANION_DB || 'cp_companion');
const appointments = prodDb.collection('appointments');
const auditLog = companionDb.collection('auditLog');

log('Fetching candidate appointments with missing/malformed details.date');
const candidates = await appointments
  .find({
    $or: [
      { 'details.date': { $exists: false } },
      { 'details.date': { $not: { $type: 'string' } } },
      { 'details.date': { $not: /^\d{4}-\d{2}-\d{2}$/ } },
      { 'details.date': { $regex: /^00\d{2}-\d{2}-\d{2}$/ } },
    ],
  })
  .project({ id: 1, 'details.date': 1, tracking: 1 })
  .toArray();
log('Fetched candidates', { count: candidates.length });

const now = new Date();
let recovered = 0;
let fellBackToCreationDate = 0;
let skipped = 0;
let errors = 0;

for (const appt of candidates) {
  try {
    const currentDate = appt.details?.date;
    if (isValidAppointmentDate(currentDate)) {
      skipped++;
      continue;
    }

    let nextDate = null;
    let method = null;

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
      log('SKIPPED (no recovery, no creation date)', { id: appt.id, previousValue: currentDate });
      continue;
    }

    await appointments.updateOne({ _id: appt._id }, { $set: { 'details.date': nextDate } });

    await auditLog.insertOne({
      action: 'APPOINTMENT_DATE_CLEANUP_FIXED',
      appointmentId: appt.id,
      method,
      previousValue: currentDate ?? null,
      newValue: nextDate,
      at: now,
    });

    if (method === 'recovered') recovered++;
    else fellBackToCreationDate++;

    log('FIXED', { id: appt.id, method, previousValue: currentDate, newValue: nextDate });
  } catch (err) {
    errors++;
    await auditLog.insertOne({
      action: 'APPOINTMENT_DATE_CLEANUP_ERROR',
      appointmentId: appt.id,
      error: err instanceof Error ? err.message : String(err),
      at: now,
    });
    log('ERROR', { id: appt.id, error: err instanceof Error ? err.message : String(err) });
  }
}

log('Backfill complete', {
  totalCandidates: candidates.length,
  recovered,
  fellBackToCreationDate,
  skipped,
  errors,
});

await client.close();
