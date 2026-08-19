import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import type { RosterSite } from '@/lib/types';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  const db = await getCompanionDb();
  const sites = await db
    .collection<RosterSite>('sites')
    .find({ userId })
    .sort({ name: 1 })
    .toArray();
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, name, hasAccessCard } = body;

  if (!userId || !name?.trim()) {
    return NextResponse.json({ error: 'userId and name required' }, { status: 400 });
  }

  const db = await getCompanionDb();
  const collection = db.collection<RosterSite>('sites');

  // Reuse an existing site with the same name (case-insensitive) rather than creating a
  // duplicate — same pattern as occupations/employeeGroups.
  const existing = await collection.findOne({
    userId,
    name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  });
  if (existing) {
    return NextResponse.json(existing);
  }

  const charge = await chargeForAction(userId, 'site.add');
  if (!charge.ok) {
    return NextResponse.json(
      { error: charge.error || 'Insufficient credits', creditCost: charge.creditCost },
      { status: 402 }
    );
  }

  const site: Omit<RosterSite, '_id'> = {
    userId,
    name: name.trim(),
    hasAccessCard: !!hasAccessCard,
    createdAt: new Date(),
  };

  const result = await collection.insertOne(site);
  return NextResponse.json({ ...site, _id: result.insertedId }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('_id');
  const userId = req.nextUrl.searchParams.get('userId');
  if (!id || !userId) {
    return NextResponse.json({ error: '_id and userId required' }, { status: 400 });
  }
  const charge = await chargeForAction(userId, 'site.remove');
  if (!charge.ok) {
    return NextResponse.json(
      { error: charge.error || 'Insufficient credits', creditCost: charge.creditCost },
      { status: 402 }
    );
  }
  const db = await getCompanionDb();
  await db.collection('sites').deleteOne({ _id: new ObjectId(id), userId });
  return NextResponse.json({ ok: true });
}
