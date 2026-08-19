import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import type { RosterEmployee } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getCompanionDb();
  const employees = await db
    .collection<RosterEmployee>('employees')
    .find({ 'defaultSites.id': id, status: { $nin: ['inactive', 'terminated'] } })
    .sort({ name: 1 })
    .toArray();
  return NextResponse.json(employees);
}
