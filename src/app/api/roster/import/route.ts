import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { isValidSouthAfricanId } from '@/lib/sa-id';
import type { RosterEmployee } from '@/lib/types';

interface ImportRow {
  name: string;
  idNumber: string;
  occupation?: string;
}

interface ReviewedRow extends ImportRow {
  idValid: boolean | null; // null = not a 13-digit value, assumed passport, skipped
  duplicateOfExistingId: boolean;
}

/**
 * Free, read-only review step — parses client-uploaded CSV rows (already parsed to JSON via
 * papaparse client-side, keeping this endpoint JSON-only like every other route here) and flags
 * per-row validation issues without writing anything. Matches the two-step
 * search-then-commit pattern already established by /api/import-employees.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, rows } = body as { userId: string; rows: ImportRow[] };

  if (!userId || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'userId and rows required' }, { status: 400 });
  }

  const db = await getCompanionDb();
  const existing = await db
    .collection<RosterEmployee>('employees')
    .find({ userId }, { projection: { idNumber: 1 } })
    .toArray();
  const existingIdNumbers = new Set(existing.map((e) => e.idNumber));

  const reviewed: ReviewedRow[] = rows
    .filter((r) => r.name)
    .map((r) => {
      // No id/idNumber on this row — generate a unique one rather than dropping the row, so
      // it can still be reviewed and imported into cp_companion.employees.
      const idNumber = r.idNumber?.trim() || `GEN-${crypto.randomUUID()}`;
      return {
        name: r.name.trim(),
        idNumber,
        occupation: (r.occupation || '').trim(),
        idValid: r.idNumber?.trim() ? isValidSouthAfricanId(idNumber) : null,
        duplicateOfExistingId: existingIdNumbers.has(idNumber),
      };
    });

  return NextResponse.json({ rows: reviewed });
}
