import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import type { CreditTransaction } from '@/lib/types';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const type = req.nextUrl.searchParams.get('type');
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(
    250,
    Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '20', 10))
  );

  const query: Record<string, unknown> = { userId };
  if (type === 'topup' || type === 'debit') {
    query.type = type;
  }

  const db = await getCompanionDb();
  const collection = db.collection<CreditTransaction>('creditTransactions');
  const [transactions, total] = await Promise.all([
    collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection.countDocuments(query),
  ]);

  return NextResponse.json({ transactions, total, page, pageSize });
}
