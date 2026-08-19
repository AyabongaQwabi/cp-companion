import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateWallet } from '@/lib/credits';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  const wallet = await getOrCreateWallet(userId);
  return NextResponse.json({ balance: wallet.balance });
}
