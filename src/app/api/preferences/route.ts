import { NextRequest, NextResponse } from 'next/server';
import { chargeForAction } from '@/lib/credits';
import { getCompanionDb } from '@/lib/mongodb';
import type { UserPreferences } from '@/lib/types';

/**
 * Per-user settings — currently just autoConfirmSpend. No row exists for most users; GET
 * defaults to { autoConfirmSpend: true } (confirm-before-spending is skipped) rather than treating
 * a missing row as an error, so every existing user gets the new default without a migration.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const db = await getCompanionDb();
  const prefs = await db.collection<UserPreferences>('userPreferences').findOne({ userId });

  return NextResponse.json({ autoConfirmSpend: prefs?.autoConfirmSpend ?? true });
}

export async function PATCH(req: NextRequest) {
  const { userId, autoConfirmSpend } = await req.json();
  if (!userId || typeof autoConfirmSpend !== 'boolean') {
    return NextResponse.json(
      { error: 'userId and boolean autoConfirmSpend required' },
      { status: 400 }
    );
  }

  const charge = await chargeForAction(userId, 'settings.updatePreferences');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const db = await getCompanionDb();
  await db.collection<UserPreferences>('userPreferences').updateOne(
    { userId },
    { $set: { userId, autoConfirmSpend, updatedAt: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true, autoConfirmSpend });
}
