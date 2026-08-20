import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { computeComplianceChampion } from '@/lib/compliance-champion';
import type { CompanyCompliancePreferences } from '@/lib/types';

/**
 * Owner-facing: badge status plus the public-verification-link opt-in state (never generates or
 * shows the token to anyone but the company's own logged-in user). Free — the pricing table
 * marks this action as free-by-design, and it's a compact rollup, not a new heavy computation.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = await params;
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const companionDb = await getCompanionDb();
  const [champion, prefs] = await Promise.all([
    computeComplianceChampion(companionDb, companyId),
    companionDb.collection<CompanyCompliancePreferences>('companyCompliancePreferences').findOne({ companyId }),
  ]);

  return NextResponse.json({
    champion,
    publicPageEnabled: prefs?.publicPageEnabled ?? false,
    publicToken: prefs?.publicPageEnabled ? prefs?.publicToken ?? null : null,
  });
}

function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 24; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Toggles the public verification page on/off for this company. Turning it on for the first time
 * generates a new random token (never reused, never derived from companyId); turning it off keeps
 * the token stored but publicPageEnabled: false makes the public route 404 regardless — so
 * re-enabling later doesn't silently resurrect a URL someone may have shared while it was off,
 * were the toggle to reuse the same token in a future confusion. It intentionally does reuse the
 * same token, though — the whole point of an opt-in link is a stable URL a company can hand to an
 * auditor once and rely on continuing to work whenever they re-enable it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = await params;
  const { userId, enabled } = await req.json();
  if (!userId || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'userId and boolean enabled required' }, { status: 400 });
  }

  const companionDb = await getCompanionDb();
  const collection = companionDb.collection<CompanyCompliancePreferences>('companyCompliancePreferences');
  const existing = await collection.findOne({ companyId });

  const token = existing?.publicToken ?? (enabled ? generateToken() : null);

  await collection.updateOne(
    { companyId },
    {
      $set: {
        companyId,
        publicPageEnabled: enabled,
        publicToken: token,
        ...(enabled && !existing?.enabledAt ? { enabledAt: new Date(), enabledByUserId: userId } : {}),
      },
    },
    { upsert: true }
  );

  return NextResponse.json({ publicPageEnabled: enabled, publicToken: enabled ? token : null });
}
