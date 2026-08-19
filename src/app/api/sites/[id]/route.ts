import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb } from '@/lib/mongodb';
import type { RosterSite } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getCompanionDb();
  const site = (await db
    .collection('sites')
    .findOne({ _id: new ObjectId(id) })) as unknown as (RosterSite & { _id: ObjectId }) | null;
  if (!site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  }
  return NextResponse.json(site);
}
