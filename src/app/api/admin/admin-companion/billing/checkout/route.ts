import { NextRequest, NextResponse } from 'next/server';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { getAdminCompanionDb, getCompanionDb } from '@/lib/mongodb';
import { createCheckout, randomPaymentReference } from '@/lib/yoco';

const ADMIN_SUBSCRIPTION_PRICE_CENTS = 29900;
const ADMIN_SUBSCRIPTION_PRICE_ZAR = 299;
const ADMIN_SUBSCRIPTION_DAYS = 30;

export function OPTIONS() {
  return adminStatsCorsPreflight();
}

function safeBaseUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = checkAdminStatsSecret(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({}));
  const adminUserId = typeof body.adminUserId === 'string' ? body.adminUserId : '';
  const email = typeof body.email === 'string' ? body.email : '';
  const name = typeof body.name === 'string' ? body.name : '';
  const returnBaseUrl =
    safeBaseUrl(body.returnBaseUrl) ||
    safeBaseUrl(process.env.ADMIN_COMPANION_BASE_URL) ||
    req.nextUrl.origin;

  if (!adminUserId || !email || !returnBaseUrl) {
    return withAdminStatsCors(
      NextResponse.json({ error: 'adminUserId, email, and returnBaseUrl are required' }, { status: 400 })
    );
  }

  const reference = randomPaymentReference();
  const checkout = await createCheckout({
    amountCents: ADMIN_SUBSCRIPTION_PRICE_CENTS,
    successUrl: `${returnBaseUrl}/billing?checkout=success&reference=${reference}`,
    cancelUrl: `${returnBaseUrl}/billing?checkout=cancelled`,
    failureUrl: `${returnBaseUrl}/billing?checkout=failed`,
    metadata: {
      type: 'admin_subscription',
      reference,
      adminUserId,
      email,
    },
    idempotencyKey: `admin-subscription-${adminUserId}-${reference}`,
  });

  const now = new Date();
  const companionDb = await getCompanionDb();
  await companionDb.collection('pendingCheckouts').insertOne({
    reference,
    checkoutId: checkout.id,
    purpose: 'admin_subscription',
    adminUserId,
    email,
    name,
    priceZAR: ADMIN_SUBSCRIPTION_PRICE_ZAR,
    priceCents: ADMIN_SUBSCRIPTION_PRICE_CENTS,
    currency: 'ZAR',
    plan: 'standard',
    periodDays: ADMIN_SUBSCRIPTION_DAYS,
    createdAt: now,
  });

  const adminDb = await getAdminCompanionDb();
  await adminDb.collection('adminPaymentEvents').insertOne({
    adminUserId,
    email,
    name,
    reference,
    checkoutId: checkout.id,
    type: 'checkout.created',
    status: 'pending',
    amountZAR: ADMIN_SUBSCRIPTION_PRICE_ZAR,
    amountCents: ADMIN_SUBSCRIPTION_PRICE_CENTS,
    currency: 'ZAR',
    plan: 'standard',
    periodDays: ADMIN_SUBSCRIPTION_DAYS,
    createdAt: now,
  });

  return withAdminStatsCors(
    NextResponse.json({
      redirectUrl: checkout.redirectUrl,
      reference,
      checkoutId: checkout.id,
    })
  );
}
