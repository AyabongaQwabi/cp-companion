import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import type { RosterEmployee } from '@/lib/types';

interface CommitBody {
  userId: string;
  candidates: { name: string; idNumber: string; occupation: string }[];
}

export async function POST(req: NextRequest) {
  const body: CommitBody = await req.json();
  const { userId, candidates } = body;

  if (!userId || !Array.isArray(candidates) || candidates.length === 0) {
    return NextResponse.json({ error: 'userId and candidates required' }, { status: 400 });
  }

  const db = await getCompanionDb();

  // Priced per employee imported (F.1: "3 / employee"). Charge sequentially and only commit
  // the employees actually paid for if the wallet runs out mid-batch.
  let affordableCount = 0;
  for (let i = 0; i < candidates.length; i++) {
    const charge = await chargeForAction(userId, 'import.commitEmployee');
    if (!charge.ok) {
      break;
    }
    affordableCount = i + 1;
  }

  if (affordableCount === 0) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
  }

  const now = new Date();
  const docs: Omit<RosterEmployee, '_id'>[] = candidates.slice(0, affordableCount).map((c) => ({
    userId,
    name: c.name,
    idNumber: c.idNumber?.trim() || `GEN-${crypto.randomUUID()}`,
    occupation: c.occupation,
    defaultServices: [],
    defaultSites: [],
    groupIds: [],
    companyIds: [],
    extraJobSpecFiles: [],
    notes: 'Imported from past appointment history',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }));

  const result = await db.collection('employees').insertMany(docs);
  const status = affordableCount < candidates.length ? 402 : 201;
  return NextResponse.json(
    {
      inserted: result.insertedCount,
      ...(affordableCount < candidates.length
        ? { error: 'Insufficient credits for the full batch — imported what was affordable' }
        : {}),
    },
    { status }
  );
}
