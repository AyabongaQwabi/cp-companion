import type { Db } from 'mongodb';
import { MEDICAL_SERVICES } from './clinicplus-constants';
import type { RosterEmployee, ComplianceStatusCache, ServiceValidityPeriod } from './types';

export interface ComplianceChampionResult {
  isChampion: boolean;
  compliantCount: number;
  totalTrackedCount: number; // roster employees who have at least one tracked-service entry
  trackedServiceCount: number; // how many of the 17 catalog services are tracked at all
  totalServiceCount: number;
  asOfDate: string; // YYYY-MM-DD
}

/**
 * "100% current on tracked medical types" — never "fully compliant". Reads
 * cp_companion.complianceStatusCache (Section 0's hourly-precomputed status), not a live
 * recomputation, same reasoning as the rest of the compliance dashboard's move to the cache.
 * A company with zero tracked-service entries for any of its roster (e.g. serviceValidityPeriods
 * is empty, or none of its employees have a tracked-service appointment yet) is never a champion —
 * there is nothing to be "100% current" on, so it defaults to isChampion: false, not true-by-vacuity.
 */
export async function computeComplianceChampion(
  companionDb: Db,
  companyId: string
): Promise<ComplianceChampionResult> {
  const validityPeriods = await companionDb
    .collection<ServiceValidityPeriod>('serviceValidityPeriods')
    .find()
    .toArray();

  const rosterEmployees = await companionDb
    .collection<RosterEmployee>('employees')
    .find({ companyIds: companyId, status: { $ne: 'terminated' } })
    .toArray();

  const rosterEmployeeIds = rosterEmployees.map((e) => String(e._id));

  const cacheEntries =
    rosterEmployeeIds.length > 0
      ? await companionDb
          .collection<ComplianceStatusCache>('complianceStatusCache')
          .find({ rosterEmployeeId: { $in: rosterEmployeeIds } })
          .toArray()
      : [];

  const employeesWithEntries = new Set(cacheEntries.map((e) => e.rosterEmployeeId));
  const employeesAllValid = new Set(
    Array.from(employeesWithEntries).filter((id) =>
      cacheEntries.filter((e) => e.rosterEmployeeId === id).every((e) => e.status === 'valid')
    )
  );

  const totalTrackedCount = employeesWithEntries.size;
  const compliantCount = employeesAllValid.size;

  return {
    isChampion: totalTrackedCount > 0 && compliantCount === totalTrackedCount,
    compliantCount,
    totalTrackedCount,
    trackedServiceCount: validityPeriods.length,
    totalServiceCount: Object.keys(MEDICAL_SERVICES).length,
    asOfDate: new Date().toISOString().slice(0, 10),
  };
}
