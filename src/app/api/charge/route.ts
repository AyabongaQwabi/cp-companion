import { NextRequest, NextResponse } from 'next/server';
import { chargeForAction } from '@/lib/credits';

export async function POST(req: NextRequest) {
  const { userId, actionKey } = await req.json();
  if (!userId || !actionKey) {
    return NextResponse.json({ error: 'userId and actionKey required' }, { status: 400 });
  }

  const result = await chargeForAction(userId, actionKey);
  if (!result.ok) {
    return NextResponse.json(result, { status: 402 });
  }
  return NextResponse.json(result);
}
