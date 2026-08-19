import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';

interface DeleteAllBody {
  userId: string;
  confirmationText: string;
}

/**
 * Soft-delete via the roster's status field (Part D), same as the single-employee DELETE in
 * /api/employees — reversible, unlike the appointments/companies bulk deletes, entirely inside
 * cp_companion.employees so this is the lowest actual risk of the three bulk actions even
 * though it's priced the same (250, per confirmed decision — Aya said "delete" but archive-and-
 * hide was confirmed as the right interpretation over a true hard delete).
 */
export async function POST(req: NextRequest) {
  const body: DeleteAllBody = await req.json();
  const { userId, confirmationText } = body;

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  if (confirmationText !== 'DELETE ALL') {
    return NextResponse.json({ error: 'Type DELETE ALL to confirm' }, { status: 400 });
  }

  const companionDb = await getCompanionDb();
  const employees = companionDb.collection('employees');

  const toArchive = await employees.find({ userId, status: { $nin: ['inactive', 'terminated'] } }).toArray();
  if (toArchive.length === 0) {
    return NextResponse.json({ ok: true, archivedCount: 0 });
  }

  const charge = await chargeForAction(userId, 'settings.deleteAllEmployees');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const now = new Date();
  const ids = toArchive.map((e) => e._id);
  await employees.updateMany({ _id: { $in: ids } }, { $set: { status: 'inactive', updatedAt: now } });

  await companionDb.collection('auditLog').insertOne({
    action: 'DELETE_ALL_EMPLOYEES',
    userId,
    archivedCount: toArchive.length,
    archivedEmployeeIds: ids.map((id) => id.toString()),
    at: now,
  });

  return NextResponse.json({ ok: true, archivedCount: toArchive.length });
}
