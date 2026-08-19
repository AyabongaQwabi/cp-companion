import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import type { Occupation } from '@/lib/types';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  const db = await getCompanionDb();
  const occupations = await db
    .collection<Occupation>('occupations')
    .find({ userId })
    .sort({ title: 1 })
    .toArray();
  return NextResponse.json(occupations);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, title } = body;
  if (!userId || !title?.trim()) {
    return NextResponse.json({ error: 'userId and title required' }, { status: 400 });
  }

  const db = await getCompanionDb();
  const collection = db.collection<Occupation>('occupations');

  // Reuse an existing occupation with the same title (case-insensitive) rather than creating a
  // duplicate — the whole point of this list is that it doesn't grow near-duplicates over time.
  const existing = await collection.findOne({
    userId,
    title: { $regex: `^${title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  });
  if (existing) {
    return NextResponse.json(existing);
  }

  const charge = await chargeForAction(userId, 'occupation.create');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const occupation: Omit<Occupation, '_id'> = {
    userId,
    title: title.trim(),
    createdAt: new Date(),
  };
  const result = await collection.insertOne(occupation);
  return NextResponse.json({ ...occupation, _id: result.insertedId }, { status: 201 });
}
