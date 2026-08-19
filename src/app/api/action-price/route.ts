import { NextRequest, NextResponse } from 'next/server';
import { getActionPrice } from '@/lib/credits';

export async function GET(req: NextRequest) {
  const actionKey = req.nextUrl.searchParams.get('actionKey');
  if (!actionKey) {
    return NextResponse.json({ error: 'actionKey required' }, { status: 400 });
  }
  const price = await getActionPrice(actionKey);
  return NextResponse.json({ creditCost: price?.creditCost ?? 1, label: price?.label ?? actionKey });
}
