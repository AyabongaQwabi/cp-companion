import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import type { RosterEmployee } from '@/lib/types';

interface CommitBody {
  userId: string;
  rows: { name: string; idNumber: string; occupation?: string }[];
}

/**
 * Structurally identical to /api/import-employees/commit — sequential per-row charge, partial
 * success on insufficient credits. Distinct actionKey (roster.importCsvEmployee) per confirmed
 * pricing decision, even though it's the same 3-credit cost as import.commitEmployee.
 */
export async function POST(req: NextRequest) {
  const body: CommitBody = await req.json();
  const { userId, rows } = body;

  if (!userId || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'userId and rows required' }, { status: 400 });
  }

  const db = await getCompanionDb();

  let affordableCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const charge = await chargeForAction(userId, 'roster.importCsvEmployee');
    if (!charge.ok) break;
    affordableCount = i + 1;
  }

  if (affordableCount === 0) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
  }

  const now = new Date();
  const docs: Omit<RosterEmployee, '_id'>[] = rows.slice(0, affordableCount).map((r) => ({
    userId,
    name: r.name,
    idNumber: r.idNumber,
    occupation: r.occupation || '',
    defaultServices: [],
    defaultSites: [],
    groupIds: [],
    companyIds: [],
    extraJobSpecFiles: [],
    notes: 'Imported from CSV',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }));

  const result = await db.collection('employees').insertMany(docs);
  const status = affordableCount < rows.length ? 402 : 201;
  return NextResponse.json(
    {
      inserted: result.insertedCount,
      ...(affordableCount < rows.length
        ? { error: 'Insufficient credits for the full batch — imported what was affordable' }
        : {}),
    },
    { status }
  );
}
