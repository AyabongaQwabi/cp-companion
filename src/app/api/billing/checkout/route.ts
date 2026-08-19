import { NextRequest, NextResponse } from 'next/server';
import { createCheckout, randomPaymentReference } from '@/lib/yoco';
import { calculatePriceZAR, isValidBundle } from '@/lib/credit-bonus';
import { getCompanionDb } from '@/lib/mongodb';

export async function POST(req: NextRequest) {
  const { userId, credits } = await req.json();

  if (!userId || !isValidBundle(credits)) {
    return NextResponse.json(
      { error: 'userId required and credits must be a positive multiple of 100' },
      { status: 400 }
    );
  }

  const priceZAR = calculatePriceZAR(credits);
  const baseUrl = process.env.CP_COMPANION_BASE_URL || 'http://localhost:3000';
  // Our own reference — Yoco doesn't expose a "get checkout by id" endpoint or append anything
  // to the redirect URLs, so this is what ties the webhook (which echoes metadata back) to the
  // pending checkout recorded below. Also used as the idempotency key: retrying this exact
  // top-up request (e.g. a double-click) reuses the same reference rather than creating a
  // second parallel checkout.
  const reference = randomPaymentReference();

  const checkout = await createCheckout({
    amountCents: Math.round(priceZAR * 100),
    successUrl: `${baseUrl}/finances?checkout=success&reference=${reference}`,
    cancelUrl: `${baseUrl}/finances?checkout=cancelled`,
    failureUrl: `${baseUrl}/finances?checkout=failed`,
    metadata: { userId, credits: String(credits), reference },
    idempotencyKey: reference,
  });

  // Recorded so the webhook handler can look up which user/credits a completed checkout maps
  // to — the wallet is only ever credited from the verified webhook, never this response.
  const db = await getCompanionDb();
  await db.collection('pendingCheckouts').insertOne({
    reference,
    checkoutId: checkout.id,
    userId,
    credits,
    priceZAR,
    createdAt: new Date(),
  });

  return NextResponse.json({ redirectUrl: checkout.redirectUrl });
}
