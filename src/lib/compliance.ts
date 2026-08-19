import type { Db } from 'mongodb';
import { getCompanionDb } from './mongodb';
import serviceValidityPeriodsConfig from '../../config/service-validity-periods.json';
import type { RosterEmployee, ServiceValidityPeriod } from './types';

interface ServiceValidityPeriodSeed {
  serviceId: string;
  validityMonths: number;
  isDraft: boolean;
}

// Seed data for cp_companion.serviceValidityPeriods — single source of truth for draft/confirmed
// validity periods, kept as a plain JSON file (config/service-validity-periods.json) rather than a
// direct DB write, matching the same pattern as config/action-pricing.json: a price/validity
// change is a data edit reviewed in git, not a one-off script run against the database. Seeded on
// every login (see seedMissingServiceValidityPeriods below), insert-only per serviceId — a
// superadmin's edit or "Confirm" click already in the DB is never clobbered by the seed.
const SERVICE_VALIDITY_PERIODS_SEED: ServiceValidityPeriodSeed[] = serviceValidityPeriodsConfig;

/**
 * Adds any serviceId from the config that isn't in the DB yet. Never touches an existing row —
 * a superadmin's confirm/edit through the settings page always wins over the seed file.
 */
export async function seedMissingServiceValidityPeriods() {
  const db = await getCompanionDb();
  const collection = db.collection<ServiceValidityPeriod>('serviceValidityPeriods');
  for (const row of SERVICE_VALIDITY_PERIODS_SEED) {
    await collection.updateOne(
      { serviceId: row.serviceId },
      {
        $setOnInsert: {
          serviceId: row.serviceId,
          validityMonths: row.validityMonths,
          isDraft: row.isDraft,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }
}

/**
 * Compliance tracking is inert until Aya supplies real validityMonths per service — with zero
 * rows in cp_companion.serviceValidityPeriods, computeRosterCompliance always returns [] for
 * every employee. Never invent a default validity period for an unconfigured service.
 *
 * Per explicit decision: an approved appointment that was later administratively deleted still
 * counts toward compliance history (a later admin deletion shouldn't retroactively make someone
 * look non-compliant), so this queries production.appointments UNION production.deleted_appointments
 * — unlike the availability aggregation in availability.ts, where that union is a no-op.
 */

/**
 * Legacy service ids that appear in older appointment documents but were later renamed in
 * MEDICAL_SERVICES. Confirmed against real data: 3 of 8 appointments in staging still carry
 * 'medical-examination' (the old id for 'full-exit-medical'). Without this normalization, historic
 * appointments using a legacy id silently never match a tracked serviceId, even once that service
 * is configured for compliance tracking — this is what caused an employee with a real, matching
 * appointment to be invisibly absent from the compliance dashboard.
 *
 * 'x-ray' is deliberately NOT mapped here — it's billed separately (doverPrice/xraysPrice) and is
 * a point-in-time test, not a periodic medical certification, consistent with the rule that
 * point-in-time services don't get validity periods at all.
 */
const LEGACY_SERVICE_ID_MAP: Record<string, string> = {
  'medical-examination': 'full-exit-medical',
};

function normalizeServiceId(serviceId: string): string {
  return LEGACY_SERVICE_ID_MAP[serviceId] ?? serviceId;
}

export type ComplianceStatus = 'expired' | 'expiring-soon' | 'valid';

export interface ComplianceEntry {
  rosterEmployeeId: string;
  employeeName: string;
  idNumber: string;
  serviceId: string;
  mostRecentAppointmentId: string;
  mostRecentDate: string;
  expiryDate: string; // YYYY-MM-DD
  status: ComplianceStatus;
  daysUntilExpiry: number;
  // True when the validityMonths behind this entry is an unconfirmed draft value (seeded from
  // reasoned-but-not-clinically-confirmed evidence) rather than a superadmin-confirmed number —
  // every surface rendering this entry must visibly flag it until a superadmin clears the draft.
  isDraft: boolean;
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function resolveStatus(expiryDate: string, leadDays: number): { status: ComplianceStatus; daysUntilExpiry: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  const daysUntilExpiry = Math.round((expiry.getTime() - today.getTime()) / 86400000);

  if (daysUntilExpiry < 0) return { status: 'expired', daysUntilExpiry };
  if (daysUntilExpiry <= leadDays) return { status: 'expiring-soon', daysUntilExpiry };
  return { status: 'valid', daysUntilExpiry };
}

/**
 * Batched: one aggregation across production.appointments + one across
 * production.deleted_appointments, filtered by the full set of roster idNumbers at once — not a
 * per-employee round trip.
 */
export async function computeRosterCompliance(
  prodDb: Db,
  rosterEmployees: RosterEmployee[],
  validityPeriods: ServiceValidityPeriod[],
  leadDays: number = 30
): Promise<ComplianceEntry[]> {
  if (validityPeriods.length === 0 || rosterEmployees.length === 0) return [];

  const validityByService = new Map(validityPeriods.map((v) => [v.serviceId, v.validityMonths]));
  const draftByService = new Map(validityPeriods.map((v) => [v.serviceId, !!v.isDraft]));
  const trackedServiceIds = Array.from(validityByService.keys());
  const idNumbers = rosterEmployees.map((e) => e.idNumber).filter(Boolean);
  const byIdNumber = new Map(rosterEmployees.map((e) => [e.idNumber, e]));

  // Match on both current tracked ids AND any legacy id that normalizes to one of them, so
  // historic appointments using a renamed service id are still found.
  const legacyIdsForTracked = Object.entries(LEGACY_SERVICE_ID_MAP)
    .filter(([, current]) => trackedServiceIds.includes(current))
    .map(([legacy]) => legacy);
  const matchableServiceIds = [...trackedServiceIds, ...legacyIdsForTracked];

  const matchStage = {
    status: 'approved',
    'details.employees.idNumber': { $in: idNumbers },
    'details.employees.services.id': { $in: matchableServiceIds },
  };

  const pipeline = [
    { $match: matchStage },
    { $unwind: '$details.employees' },
    { $match: { 'details.employees.idNumber': { $in: idNumbers } } },
    { $unwind: '$details.employees.services' },
    { $match: { 'details.employees.services.id': { $in: matchableServiceIds } } },
    {
      $project: {
        appointmentId: '$id',
        date: '$details.date',
        idNumber: '$details.employees.idNumber',
        serviceId: '$details.employees.services.id',
      },
    },
  ];

  const [live, deleted] = await Promise.all([
    prodDb.collection('appointments').aggregate<{ appointmentId: string; date: string; idNumber: string; serviceId: string }>(pipeline).toArray(),
    prodDb.collection('deleted_appointments').aggregate<{ appointmentId: string; date: string; idNumber: string; serviceId: string }>(pipeline).toArray(),
  ]);

  // Normalize legacy service ids to their current form before grouping — otherwise an old
  // appointment stored under 'medical-examination' would never be recognized as the same service
  // as one stored under the current 'full-exit-medical' id.
  const rows = [...live, ...deleted]
    .filter((row) => !!row.date) // details.date can be null on some historic appointments — skip, not crash
    .map((row) => ({ ...row, serviceId: normalizeServiceId(row.serviceId) }));

  // Most recent row per (idNumber, serviceId).
  const mostRecent = new Map<string, { appointmentId: string; date: string; idNumber: string; serviceId: string }>();
  for (const row of rows) {
    const key = `${row.idNumber}::${row.serviceId}`;
    const existing = mostRecent.get(key);
    if (!existing || row.date > existing.date) {
      mostRecent.set(key, row);
    }
  }

  const entries: ComplianceEntry[] = [];
  for (const row of mostRecent.values()) {
    const employee = byIdNumber.get(row.idNumber);
    if (!employee || !employee._id) continue;
    const validityMonths = validityByService.get(row.serviceId);
    if (!validityMonths) continue;

    const expiryDate = addMonths(row.date.slice(0, 10), validityMonths);
    const { status, daysUntilExpiry } = resolveStatus(expiryDate, leadDays);

    entries.push({
      rosterEmployeeId: employee._id,
      employeeName: employee.name,
      idNumber: employee.idNumber,
      serviceId: row.serviceId,
      mostRecentAppointmentId: row.appointmentId,
      mostRecentDate: row.date,
      expiryDate,
      status,
      daysUntilExpiry,
      isDraft: draftByService.get(row.serviceId) ?? false,
    });
  }

  return entries;
}
