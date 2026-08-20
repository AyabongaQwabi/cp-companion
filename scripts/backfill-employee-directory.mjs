#!/usr/bin/env node

import fs from 'fs';
import { MongoClient } from 'mongodb';

/**
 * One-off backfill: scans every appointment in production.appointments, extracts each employee
 * reference from details.employees, and upserts the platform-wide admin employee directory
 * (cp_companion.employeeDirectory) plus per-employee stats (cp_companion.employeeStats).
 *
 * Idempotent by design — re-running this script re-derives every field from scratch and upserts
 * by the same identity key, so running it twice produces the same result as running it once (no
 * duplicate rows, no double-counted appointments). Safe to re-run whenever needed; there is no
 * ongoing scheduled job wired up yet (see the admin task's summary for the recommendation).
 *
 * Identity resolution: an employee is matched primarily by idNumber (trimmed, exact string match
 * as stored on the appointment — not normalized further, since real appointments already store
 * this consistently per validateAppointmentShape). When idNumber is missing/empty on every
 * appointment an employee's name appears on, falls back to a lowercased/whitespace-collapsed name
 * key and flags the resulting directory row matchConfidence: 'unverified' — two different real
 * people who happen to share a name would incorrectly merge into one row in that fallback path;
 * this is a known, visible limitation (surfaced in the UI), not a silent data-quality bug.
 */
function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

log('Employee directory backfill starting');

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2];
  }
}

const client = await new MongoClient(process.env.DATABASE_URL).connect();
const prodDb = client.db(process.env.SELECTED_DB || 'production');
const companionDb = client.db(process.env.COMPANION_DB || 'cp_companion');

function normalizeNameKey(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function decodeIdOrNull(idNumber) {
  const trimmed = (idNumber || '').trim();
  if (!/^\d{13}$/.test(trimmed)) {
    return { idNumberValid: null, dateOfBirth: null, age: null, gender: null };
  }

  const digits = trimmed.split('').map(Number);
  const checkDigit = digits[12];
  let oddSum = 0;
  for (let i = 0; i < 12; i += 2) oddSum += digits[i];
  let evenConcat = '';
  for (let i = 1; i < 12; i += 2) evenConcat += digits[i];
  const evenDoubled = String(Number(evenConcat) * 2);
  const evenSum = evenDoubled.split('').reduce((acc, d) => acc + Number(d), 0);
  const computedCheckDigit = (10 - ((oddSum + evenSum) % 10)) % 10;
  const isValid = computedCheckDigit === checkDigit;

  if (!isValid) {
    return { idNumberValid: false, dateOfBirth: null, age: null, gender: null };
  }

  const yy = Number(trimmed.slice(0, 2));
  const mm = Number(trimmed.slice(2, 4));
  const dd = Number(trimmed.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return { idNumberValid: false, dateOfBirth: null, age: null, gender: null };
  }

  const currentYear = new Date().getFullYear();
  const currentCentury = Math.floor(currentYear / 100) * 100;
  let fullYear = currentCentury + yy;
  if (fullYear > currentYear) fullYear -= 100;

  const dob = new Date(Date.UTC(fullYear, mm - 1, dd));
  if (dob.getUTCFullYear() !== fullYear || dob.getUTCMonth() !== mm - 1 || dob.getUTCDate() !== dd) {
    return { idNumberValid: false, dateOfBirth: null, age: null, gender: null };
  }

  const genderSeq = Number(trimmed.slice(6, 10));
  const gender = genderSeq >= 5000 ? 'male' : 'female';

  const now = new Date();
  let age = now.getUTCFullYear() - fullYear;
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > mm - 1 || (now.getUTCMonth() === mm - 1 && now.getUTCDate() >= dd);
  if (!hasHadBirthdayThisYear) age -= 1;

  const pad = (n) => String(n).padStart(2, '0');
  return { idNumberValid: true, dateOfBirth: `${fullYear}-${pad(mm)}-${pad(dd)}`, age, gender };
}

log('Fetching all appointments (id, details.date, details.company, details.clinic, details.employees, payment, status)');
const appointments = await prodDb
  .collection('appointments')
  .find({})
  .project({
    id: 1,
    'details.date': 1,
    'details.company': 1,
    'details.employees': 1,
    payment: 1,
    status: 1,
  })
  .toArray();
log('Fetched appointments', { count: appointments.length });

// identityKey -> accumulated employee record
const employeesByKey = new Map();

let employeeRefsSeen = 0;
let skippedNoName = 0;

for (const appointment of appointments) {
  const employees = appointment.details?.employees || [];
  for (const employee of employees) {
    employeeRefsSeen++;
    const idNumber = (employee.idNumber || '').trim();
    const name = employee.name || '';
    const nameKey = normalizeNameKey(name);

    if (!idNumber && !nameKey) {
      skippedNoName++;
      continue; // no usable identity at all — nothing to key this record on
    }

    const hasIdNumber = idNumber.length > 0;
    const identityKey = hasIdNumber ? `id:${idNumber}` : `name:${nameKey}`;

    if (!employeesByKey.has(identityKey)) {
      employeesByKey.set(identityKey, {
        idNumber: hasIdNumber ? idNumber : null,
        nameKey,
        displayName: name,
        matchedBy: hasIdNumber ? 'idNumber' : 'nameOnly',
        matchConfidence: hasIdNumber ? 'verified' : 'unverified',
        occupations: new Set(),
        dates: [],
        appointmentIds: new Set(),
        // per-appointment facts needed for stats, keyed by appointmentId to dedupe if the same
        // employee identity appears twice on one appointment (shouldn't happen, but don't
        // double count if it does)
        appointmentFacts: new Map(),
      });
    }

    const record = employeesByKey.get(identityKey);
    // A later appointment's name casing wins for display — appointments are not guaranteed to
    // arrive in date order from Mongo's default cursor order, so this is corrected below after
    // sorting by date, not trusted as-is here.
    record.displayNameCandidates = record.displayNameCandidates || [];
    record.displayNameCandidates.push({ date: appointment.details?.date || '', name });

    if (employee.occupation) record.occupations.add(employee.occupation);
    if (appointment.details?.date) record.dates.push(appointment.details.date);
    if (appointment.id) {
      record.appointmentIds.add(appointment.id);
      if (!record.appointmentFacts.has(appointment.id)) {
        record.appointmentFacts.set(appointment.id, {
          date: appointment.details?.date || null,
          status: appointment.status,
          amount: appointment.payment?.amount || 0,
          companyId: appointment.details?.company?.id || null,
          companyName: appointment.details?.company?.name || null,
        });
      }
    }
  }
}

log('Aggregated distinct employee identities', {
  employeeRefsSeen,
  distinctIdentities: employeesByKey.size,
  skippedNoName,
});

const directoryCollection = companionDb.collection('employeeDirectory');
const statsCollection = companionDb.collection('employeeStats');

let processed = 0;
let errors = 0;
const now = new Date();

for (const [identityKey, record] of employeesByKey) {
  try {
    const sortedDates = record.dates.filter(Boolean).sort();
    const firstSeenAt = sortedDates[0] || null;
    const lastSeenAt = sortedDates[sortedDates.length - 1] || null;

    // Display name: most recent appointment's casing, falling back to whatever we saw first.
    const sortedNameCandidates = (record.displayNameCandidates || [])
      .filter((c) => c.name)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const displayName =
      sortedNameCandidates[sortedNameCandidates.length - 1]?.name || record.displayName || record.nameKey;

    const decoded = decodeIdOrNull(record.idNumber);

    const directoryDoc = {
      idNumber: record.idNumber,
      nameKey: record.nameKey,
      displayName,
      matchedBy: record.matchedBy,
      matchConfidence: record.matchConfidence,
      idNumberValid: decoded.idNumberValid,
      dateOfBirth: decoded.dateOfBirth,
      age: decoded.age,
      gender: decoded.gender,
      occupations: Array.from(record.occupations),
      firstSeenAt,
      lastSeenAt,
      appointmentIds: Array.from(record.appointmentIds),
      lastSyncedAt: now,
    };

    const filter = record.idNumber ? { idNumber: record.idNumber } : { idNumber: null, nameKey: record.nameKey };
    const upsertResult = await directoryCollection.findOneAndUpdate(
      filter,
      { $set: directoryDoc },
      { upsert: true, returnDocument: 'after' }
    );
    const directoryId = upsertResult?._id ?? (await directoryCollection.findOne(filter))?._id;

    // Stats: paid = approved only, per the platform-wide payment rule.
    const facts = Array.from(record.appointmentFacts.values());
    const paid = facts.filter((f) => f.status === 'approved');
    const unpaid = facts.filter((f) => f.status !== 'approved');
    const totalRevenue = paid.reduce((acc, f) => acc + (f.amount || 0), 0);

    const monthlyMap = new Map(); // "YYYY-MM" -> { appointments, revenue } (paid only)
    for (const f of paid) {
      if (!f.date) continue;
      const month = f.date.slice(0, 7);
      if (!monthlyMap.has(month)) monthlyMap.set(month, { appointments: 0, revenue: 0 });
      const bucket = monthlyMap.get(month);
      bucket.appointments += 1;
      bucket.revenue += f.amount || 0;
    }
    const monthlyTrend = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, v]) => ({ month, appointments: v.appointments, revenue: v.revenue }));

    const companyMap = new Map(); // companyId -> { companyName, appointmentCount }
    for (const f of facts) {
      if (!f.companyId) continue;
      if (!companyMap.has(f.companyId)) {
        companyMap.set(f.companyId, { companyName: f.companyName, appointmentCount: 0 });
      }
      companyMap.get(f.companyId).appointmentCount += 1;
    }
    const topCompanies = Array.from(companyMap.entries())
      .map(([companyId, v]) => ({ companyId, companyName: v.companyName, appointmentCount: v.appointmentCount }))
      .sort((a, b) => b.appointmentCount - a.appointmentCount)
      .slice(0, 5);

    const statsDoc = {
      employeeDirectoryId: String(directoryId),
      totalAppointments: facts.length,
      paidAppointments: paid.length,
      unpaidAppointments: unpaid.length,
      totalRevenue,
      monthlyTrend,
      topCompanies,
      lastSyncedAt: now,
    };

    await statsCollection.updateOne(
      { employeeDirectoryId: String(directoryId) },
      { $set: statsDoc },
      { upsert: true }
    );

    processed++;
    if (processed % 200 === 0) {
      log('Progress', { processed, total: employeesByKey.size });
    }
  } catch (err) {
    errors++;
    log('ERROR processing identity', { identityKey, error: err instanceof Error ? err.message : String(err) });
  }
}

log('Backfill complete', { processed, errors, distinctIdentities: employeesByKey.size });

await client.close();
