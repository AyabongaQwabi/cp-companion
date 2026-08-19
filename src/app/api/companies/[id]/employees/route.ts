import { NextRequest, NextResponse } from 'next/server';
import { ObjectId, type Document } from 'mongodb';
import { getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import type { RosterEmployee } from '@/lib/types';

/**
 * [id] here is a company's production business id (Company.id), not a Mongo _id — matches how
 * companyIds is stored on RosterEmployee. Companion-DB-only: adding an employee to a company via
 * this route never touches production.companies or production.appointments.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getCompanionDb();
  const employees = await db
    .collection<RosterEmployee>('employees')
    .find({ companyIds: id, status: { $nin: ['inactive', 'terminated'] } })
    .sort({ name: 1 })
    .toArray();
  return NextResponse.json(employees);
}

interface MembershipBody {
  userId: string;
  employeeIds: string[];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body: MembershipBody = await req.json();
  if (!body.userId || !Array.isArray(body.employeeIds) || body.employeeIds.length === 0) {
    return NextResponse.json({ error: 'userId and employeeIds required' }, { status: 400 });
  }

  // Priced per employee added, same as employee-groups — charge once per employee in the batch.
  for (let i = 0; i < body.employeeIds.length; i++) {
    const charge = await chargeForAction(body.userId, 'company.addRemoveEmployee');
    if (!charge.ok) {
      const db = await getCompanionDb();
      const affordable = body.employeeIds.slice(0, i).map((eid) => new ObjectId(eid));
      if (affordable.length > 0) {
        await db
          .collection('employees')
          .updateMany({ _id: { $in: affordable } }, { $addToSet: { companyIds: id } });
      }
      return NextResponse.json(
        { error: 'Insufficient credits for the full batch', creditCost: charge.creditCost, added: affordable.length },
        { status: 402 }
      );
    }
  }

  const db = await getCompanionDb();
  const objectIds = body.employeeIds.map((eid) => new ObjectId(eid));
  await db
    .collection('employees')
    .updateMany({ _id: { $in: objectIds } }, { $addToSet: { companyIds: id } });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const employeeId = req.nextUrl.searchParams.get('employeeId');
  const userId = req.nextUrl.searchParams.get('userId');
  if (!employeeId || !userId) {
    return NextResponse.json({ error: 'employeeId and userId required' }, { status: 400 });
  }

  const charge = await chargeForAction(userId, 'company.addRemoveEmployee');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const db = await getCompanionDb();
  await db
    .collection('employees')
    .updateOne({ _id: new ObjectId(employeeId) }, { $pull: { companyIds: id } as Document });

  return NextResponse.json({ ok: true });
}
