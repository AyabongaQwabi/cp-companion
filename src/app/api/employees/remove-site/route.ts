import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import type { RosterEmployee } from '@/lib/types';

interface RemoveSiteBody {
  userId: string;
  employeeId: string;
  siteId: string;
}

export async function POST(req: NextRequest) {
  const body: RemoveSiteBody = await req.json();
  const { userId, employeeId, siteId } = body;

  if (!userId || !employeeId || !siteId) {
    return NextResponse.json({ error: 'userId, employeeId and siteId required' }, { status: 400 });
  }

  const charge = await chargeForAction(userId, 'site.removeEmployee');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const db = await getCompanionDb();
  const collection = db.collection('employees');
  const employee = (await collection.findOne({
    _id: new ObjectId(employeeId),
  })) as unknown as (RosterEmployee & { _id: ObjectId }) | null;

  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }

  const nextSites = (employee.defaultSites || []).filter((s) => s.id !== siteId);
  await collection.updateOne(
    { _id: employee._id },
    { $set: { defaultSites: nextSites, updatedAt: new Date() } }
  );

  return NextResponse.json({ ok: true });
}
