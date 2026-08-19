import { NextRequest, NextResponse } from 'next/server';
import { ObjectId, type Document } from 'mongodb';
import { getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import type { EmployeeGroup } from '@/lib/types';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  const db = await getCompanionDb();
  const groups = await db
    .collection<EmployeeGroup>('employeeGroups')
    .find({ userId })
    .sort({ name: 1 })
    .toArray();
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, name } = body;
  if (!userId || !name?.trim()) {
    return NextResponse.json({ error: 'userId and name required' }, { status: 400 });
  }

  const db = await getCompanionDb();
  const collection = db.collection<EmployeeGroup>('employeeGroups');

  const existing = await collection.findOne({
    userId,
    name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  });
  if (existing) {
    return NextResponse.json(existing);
  }

  const charge = await chargeForAction(userId, 'group.create');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const group: Omit<EmployeeGroup, '_id'> = {
    userId,
    name: name.trim(),
    defaultServiceIds: [],
    createdAt: new Date(),
  };
  const result = await collection.insertOne(group);
  return NextResponse.json({ ...group, _id: result.insertedId }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { _id, userId, ...updates } = body;
  if (!_id) {
    return NextResponse.json({ error: '_id required' }, { status: 400 });
  }

  if (userId) {
    const actionKey = 'defaultServiceIds' in updates ? 'group.setDefaultServices' : 'group.rename';
    const charge = await chargeForAction(userId, actionKey);
    if (!charge.ok) {
      return NextResponse.json(charge, { status: 402 });
    }
  }

  const db = await getCompanionDb();
  await db
    .collection('employeeGroups')
    .updateOne({ _id: new ObjectId(_id) }, { $set: updates });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('_id');
  const userId = req.nextUrl.searchParams.get('userId');
  if (!id || !userId) {
    return NextResponse.json({ error: '_id and userId required' }, { status: 400 });
  }
  const charge = await chargeForAction(userId, 'group.delete');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }
  const db = await getCompanionDb();
  await db.collection('employeeGroups').deleteOne({ _id: new ObjectId(id), userId });
  // Pull this group id out of every employee that had it, so deleting a group doesn't leave
  // dangling groupIds pointing at nothing.
  await db
    .collection('employees')
    .updateMany({ groupIds: id }, { $pull: { groupIds: id } as Document });
  return NextResponse.json({ ok: true });
}
