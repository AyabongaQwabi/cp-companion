import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { MEDICAL_SERVICES } from '@/lib/clinicplus-constants';
import type { EmployeeDirectoryEntry, EmployeeStats } from '@/lib/types';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

interface PastServiceEntry {
  appointmentId: string;
  date: string | null;
  companyName: string | null;
  status: string;
  serviceId: string;
  serviceTitle: string;
  price: number;
}

interface PastJobSpecEntry {
  appointmentId: string;
  date: string | null;
  companyName: string | null;
  url: string;
  isExtra: boolean; // true for extraJobSpecFiles entries, false for the primary jobSpecFile
}

/**
 * Single employee's directory entry + stats + service/job-spec history, keyed by the
 * employeeDirectory _id returned from the list route (GET /api/admin/employees) — not by
 * idNumber, since a name-only-matched row has no idNumber at all.
 *
 * Past services and job spec files are not stored on the directory/stats docs (the backfill only
 * keeps appointmentIds + aggregate counts, not per-appointment line-item detail) — computed here
 * on demand by re-reading this employee's own appointmentIds from production.appointments. This
 * is a read-only query against production, same as every other admin route; a handful of
 * appointment lookups by id is cheap regardless of how large the platform's appointment
 * collection grows, since it's bounded by this one employee's own appointment count, not a
 * collection scan. Matches back to the specific employee within each appointment's
 * details.employees array the same way the directory backfill does: by idNumber when present,
 * otherwise by normalized name — an appointment could have several employees, so this is not
 * simply "the appointment's" service/file, it's specifically this employee's.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid employee id' }, { status: 400 }));
  }

  try {
    const companionDb = await getCompanionDb();
    const entry = await companionDb
      .collection<EmployeeDirectoryEntry>('employeeDirectory')
      .findOne({ _id: new ObjectId(id) as never });

    if (!entry) {
      return withAdminStatsCors(NextResponse.json({ error: 'Employee not found' }, { status: 404 }));
    }

    const stats = await companionDb
      .collection<EmployeeStats>('employeeStats')
      .findOne({ employeeDirectoryId: id });

    const pastServices: PastServiceEntry[] = [];
    const pastJobSpecFiles: PastJobSpecEntry[] = [];

    if (entry.appointmentIds?.length) {
      const prodDb = await getProductionDb();
      const appointments = await prodDb
        .collection('appointments')
        .find({ id: { $in: entry.appointmentIds } })
        .project({
          id: 1,
          status: 1,
          'details.date': 1,
          'details.company.name': 1,
          'details.employees': 1,
        })
        .toArray();

      for (const appointment of appointments) {
        const employees = appointment.details?.employees || [];
        const matched = employees.find((e: { idNumber?: string; name?: string }) => {
          if (entry.idNumber) return (e.idNumber || '').trim() === entry.idNumber;
          const nameKey = (e.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
          return nameKey === entry.nameKey;
        });
        if (!matched) continue;

        const date = appointment.details?.date || null;
        const companyName = appointment.details?.company?.name || null;

        for (const service of matched.services || []) {
          const catalogEntry = MEDICAL_SERVICES[service.id];
          pastServices.push({
            appointmentId: appointment.id,
            date,
            companyName,
            status: appointment.status,
            serviceId: service.id,
            serviceTitle: catalogEntry?.title || service.id,
            price: service.price,
          });
        }

        if (matched.jobSpecFile) {
          pastJobSpecFiles.push({
            appointmentId: appointment.id,
            date,
            companyName,
            url: matched.jobSpecFile,
            isExtra: false,
          });
        }
        for (const extraUrl of matched.extraJobSpecFiles || []) {
          pastJobSpecFiles.push({ appointmentId: appointment.id, date, companyName, url: extraUrl, isExtra: true });
        }
      }

      pastServices.sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
      pastJobSpecFiles.sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
    }

    return withAdminStatsCors(
      NextResponse.json({
        ...entry,
        _id: String(entry._id),
        stats: stats || null,
        pastServices,
        pastJobSpecFiles,
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
