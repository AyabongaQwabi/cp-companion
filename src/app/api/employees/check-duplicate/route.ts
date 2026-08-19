import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb } from '@/lib/mongodb';
import type { RosterEmployee } from '@/lib/types';

/**
 * Duplicate-entry warning for manual employee add/edit — checks a typed ID/passport number
 * against the existing roster (any status: active, inactive, or terminated) so a typo-triggered
 * second record for the same person gets flagged before it's created. Warn-not-block, same as
 * SA ID validation — the caller decides whether to proceed.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const idNumber = req.nextUrl.searchParams.get('idNumber')?.trim();
  const excludeId = req.nextUrl.searchParams.get('excludeId');

  if (!userId || !idNumber) {
    return NextResponse.json({ error: 'userId and idNumber required' }, { status: 400 });
  }

  const db = await getCompanionDb();
  const query: Record<string, unknown> = { userId, idNumber };
  if (excludeId) {
    query._id = { $ne: new ObjectId(excludeId) };
  }

  const existing = await db.collection<RosterEmployee>('employees').findOne(query);

  return NextResponse.json({
    exists: !!existing,
    existingEmployee: existing ? { name: existing.name, status: existing.status } : undefined,
  });
}
