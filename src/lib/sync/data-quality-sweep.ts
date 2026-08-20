import type { Db } from 'mongodb';
import { isValidSouthAfricanId } from '../sa-id';
import type { RosterEmployee, DataQualityFlag } from '../types';

/**
 * Platform-wide version of the same two checks the employee Insights modal runs for one employee
 * at a time (src/app/api/employees/[id]/insights/route.ts) — run here as a batch over every
 * active roster employee across every company, surfaced only on the superadmin view, never
 * client-facing.
 */
export async function syncDataQualitySweep(
  prodDb: Db,
  companionDb: Db
): Promise<{ processed: number; errors: number }> {
  const flags = companionDb.collection<DataQualityFlag>('dataQualitySweep');
  await flags.deleteMany({}); // full re-derive each run — cheap relative to the appointment aggs

  const allEmployees = await companionDb
    .collection<RosterEmployee>('employees')
    .find({ status: { $ne: 'terminated' } })
    .toArray();

  const idNumbers = Array.from(new Set(allEmployees.map((e) => e.idNumber).filter(Boolean)));
  const now = new Date();
  let processed = 0;
  let errors = 0;

  if (idNumbers.length > 0) {
    const nameRows = await prodDb
      .collection('appointments')
      .aggregate<{ _id: string; names: string[] }>([
        { $match: { 'details.employees.idNumber': { $in: idNumbers } } },
        { $unwind: '$details.employees' },
        { $match: { 'details.employees.idNumber': { $in: idNumbers } } },
        {
          $group: {
            _id: '$details.employees.idNumber',
            names: { $addToSet: '$details.employees.name' },
          },
        },
      ])
      .toArray();

    const namesByIdNumber = new Map(nameRows.map((r) => [r._id, r.names.filter(Boolean)]));
    const newFlags: DataQualityFlag[] = [];

    for (const emp of allEmployees) {
      try {
        const names = namesByIdNumber.get(emp.idNumber) || [];
        const companyId = emp.companyIds?.[0] || '';
        if (names.length > 1) {
          newFlags.push({
            companyId,
            rosterEmployeeId: String(emp._id ?? ''),
            flagType: 'name-variant',
            detail: `${names.length} name variants across appointment history: ${names.join(', ')}`,
            lastSyncedAt: now,
          });
          processed++;
        }

        if (isValidSouthAfricanId(emp.idNumber) === false) {
          newFlags.push({
            companyId,
            rosterEmployeeId: String(emp._id ?? ''),
            flagType: 'id-checksum',
            detail: `ID number ${emp.idNumber} fails the SA ID check-digit validation`,
            lastSyncedAt: now,
          });
          processed++;
        }
      } catch {
        errors++;
      }
    }

    if (newFlags.length > 0) {
      await flags.insertMany(newFlags);
    }
  }

  return { processed, errors };
}
