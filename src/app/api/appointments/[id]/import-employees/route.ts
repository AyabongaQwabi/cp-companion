import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import type { RosterEmployee } from '@/lib/types';

interface ImportCandidate {
  name: string;
  idNumber: string;
  occupation: string;
}

/**
 * Same mechanism as the existing "import from past appointments" tool
 * (/api/import-employees), entry-pointed from a single appointment instead of scanning the
 * company's whole history. Pulls details.employees[] from this one appointment, dedupes against
 * the company's existing roster by idNumber, and only returns employees who don't already exist
 * in cp_companion.employees — mirrors the exact dedupe logic in /api/import-employees's GET.
 * Read-only, free (import.search).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();

  const appointment = await prodDb
    .collection('appointments')
    .findOne({ id, 'usersWhoCanManage.id': userId });
  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  const existingRoster = await companionDb
    .collection<RosterEmployee>('employees')
    .find({ userId })
    .toArray();
  const existingIdNumbers = new Set(
    existingRoster.map((e) => e.idNumber?.trim()).filter(Boolean)
  );

  const employees = appointment.details?.employees || [];
  const seen = new Set<string>();
  const candidates: ImportCandidate[] = [];
  let generatedIdCount = 0;

  for (const emp of employees) {
    let idNumber = (emp?.idNumber || '').trim();
    const name = (emp?.name || '').trim();
    if (!name) continue;

    if (!idNumber) {
      // No id/idNumber on record — generate a unique one so this employee can still be
      // imported into cp_companion.employees instead of being silently dropped.
      idNumber = `GEN-${crypto.randomUUID()}`;
      generatedIdCount += 1;
    }
    // Already on the roster — don't re-show/re-offer.
    if (existingIdNumbers.has(idNumber)) continue;
    if (seen.has(idNumber)) continue;
    seen.add(idNumber);

    candidates.push({ name, idNumber, occupation: emp.occupation || '' });
  }

  candidates.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    appointmentId: id,
    candidates,
    generatedIds: generatedIdCount,
  });
}
