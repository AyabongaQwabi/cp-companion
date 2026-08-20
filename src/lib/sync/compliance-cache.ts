import type { Db } from 'mongodb';
import { computeRosterCompliance } from '../compliance';
import type { RosterEmployee, ServiceValidityPeriod, ComplianceStatusCache } from '../types';

/**
 * Materializes computeRosterCompliance's output into cp_companion.complianceStatusCache so
 * dashboards/modals read a precomputed row instead of recomputing live on every page load. Runs
 * across every active roster employee each sync — cheap relative to the appointment aggregations
 * in company-profiles/booking-patterns since it reuses the existing batched-per-user query.
 *
 * Inert (0 processed) until cp_companion.serviceValidityPeriods has real rows, same as
 * computeRosterCompliance itself and the compliance-alerts cron.
 */
export async function syncComplianceCache(
  prodDb: Db,
  companionDb: Db
): Promise<{ processed: number; errors: number }> {
  const validityPeriods = await companionDb
    .collection<ServiceValidityPeriod>('serviceValidityPeriods')
    .find()
    .toArray();

  if (validityPeriods.length === 0) return { processed: 0, errors: 0 };

  const allEmployees = await companionDb
    .collection<RosterEmployee>('employees')
    .find({ status: { $ne: 'terminated' } })
    .toArray();

  const byUser = new Map<string, RosterEmployee[]>();
  for (const emp of allEmployees) {
    const list = byUser.get(emp.userId) || [];
    list.push(emp);
    byUser.set(emp.userId, list);
  }

  const cache = companionDb.collection<ComplianceStatusCache>('complianceStatusCache');
  const now = new Date();
  let processed = 0;
  let errors = 0;
  const operations = [];

  for (const [userId, rosterEmployees] of byUser) {
    try {
      const entries = await computeRosterCompliance(prodDb, rosterEmployees, validityPeriods, 30);
      for (const entry of entries) {
        operations.push({
          updateOne: {
            filter: { rosterEmployeeId: entry.rosterEmployeeId, serviceId: entry.serviceId },
            update: {
              $set: {
                rosterEmployeeId: entry.rosterEmployeeId,
                userId,
                serviceId: entry.serviceId,
                status: entry.status,
                expiryDate: entry.expiryDate,
                isDraft: entry.isDraft,
                lastSyncedAt: now,
              },
            },
            upsert: true,
          },
        });
        processed++;
      }
    } catch {
      errors++;
    }
  }

  if (operations.length > 0) {
    await cache.bulkWrite(operations, { ordered: false });
  }

  return { processed, errors };
}
