import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/yoco';
import { calculateBonus, calculateTotalCredited } from '@/lib/credit-bonus';
import { getAdminCompanionDb, getCompanionDb } from '@/lib/mongodb';
import type { CreditTransaction, CreditWallet } from '@/lib/types';

/**
 * Only ever credits a wallet after verifying the Yoco webhook signature — never from the
 * client-side successUrl redirect, so a user can't fake a payment by hitting the return URL
 * directly (Part E's explicit instruction).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const webhookId = req.headers.get('webhook-id');
  const webhookTimestamp = req.headers.get('webhook-timestamp');
  const signatureHeader = req.headers.get('webhook-signature');

  if (!webhookId || !webhookTimestamp || !signatureHeader) {
    return NextResponse.json({ error: 'Missing webhook headers' }, { status: 400 });
  }

  const isValid = verifyWebhookSignature({
    webhookId,
    webhookTimestamp,
    signatureHeader,
    rawBody,
  });
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.type !== 'payment.succeeded') {
    // Not an event this handler needs to act on.
    return NextResponse.json({ ok: true });
  }

  // Our own reference (generated at checkout creation, threaded through metadata) — not Yoco's
  // payload.id, which is the charge id and does not match the checkout-creation response's
  // checkout id. Yoco echoes metadata back unchanged on the webhook event.
  const reference = event.payload?.metadata?.reference;
  const db = await getCompanionDb();
  const pendingCheckouts = db.collection('pendingCheckouts');

  const pending = reference ? await pendingCheckouts.findOne({ reference }) : null;
  if (!pending) {
    // Either already processed (idempotent no-op) or an event we don't have a record for.
    return NextResponse.json({ ok: true });
  }

  if (pending.purpose === 'admin_subscription') {
    const now = new Date();
    const periodDays = typeof pending.periodDays === 'number' ? pending.periodDays : 30;
    const adminDb = await getAdminCompanionDb();
    const subscriptions = adminDb.collection('adminSubscriptions');
    const existing = await subscriptions.findOne({ adminUserId: pending.adminUserId, plan: 'standard' });
    const baseDate =
      existing?.currentPeriodEndsAt && new Date(existing.currentPeriodEndsAt).getTime() > now.getTime()
        ? new Date(existing.currentPeriodEndsAt)
        : now;
    const currentPeriodEndsAt = new Date(baseDate);
    currentPeriodEndsAt.setDate(currentPeriodEndsAt.getDate() + periodDays);

    await subscriptions.updateOne(
      { adminUserId: pending.adminUserId, plan: 'standard' },
      {
        $set: {
          adminUserId: pending.adminUserId,
          email: pending.email,
          name: pending.name,
          plan: 'standard',
          status: 'active',
          priceCents: pending.priceCents ?? 29900,
          priceDisplay: 'R299',
          currency: 'ZAR',
          billingProvider: 'yoco',
          billingMode: 'manual_renewal',
          seats: 1,
          currentPeriodStartedAt: now,
          currentPeriodEndsAt,
          lastPaymentAt: now,
          lastPaymentReference: reference,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
          trialStartedAt: now,
          trialEndsAt: now,
        },
        $unset: { expiredAt: '' },
      },
      { upsert: true }
    );

    await adminDb.collection('adminPaymentEvents').insertOne({
      adminUserId: pending.adminUserId,
      email: pending.email,
      name: pending.name,
      reference,
      checkoutId: pending.checkoutId,
      chargeId: event.payload?.id,
      type: 'payment.succeeded',
      status: 'paid',
      amountZAR: pending.priceZAR,
      amountCents: pending.priceCents,
      currency: pending.currency ?? 'ZAR',
      plan: 'standard',
      periodDays,
      currentPeriodEndsAt,
      rawPayload: event.payload,
      createdAt: now,
    });

    await pendingCheckouts.deleteOne({ reference });
    return NextResponse.json({ ok: true, subscriptionRenewed: true });
  }

  const bonus = calculateBonus(pending.credits);
  const totalCredited = calculateTotalCredited(pending.credits);

  const wallets = db.collection<CreditWallet>('creditWallets');
  const existingWallet = await wallets.findOne({ userId: pending.userId });
  const newBalance = (existingWallet?.balance || 0) + totalCredited;

  await wallets.updateOne(
    { userId: pending.userId },
    { $set: { balance: newBalance, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );

  const transaction: Omit<CreditTransaction, '_id'> = {
    userId: pending.userId,
    type: 'topup',
    credits: totalCredited,
    balanceAfter: newBalance,
    createdAt: new Date(),
    yoco: {
      checkoutId: pending.checkoutId,
      chargeId: event.payload?.id,
      amountZAR: pending.priceZAR,
    },
  };
  await db.collection<CreditTransaction>('creditTransactions').insertOne(transaction);

  // Remove so a retried/duplicate webhook for the same checkout doesn't double-credit.
  await pendingCheckouts.deleteOne({ reference });

  return NextResponse.json({ ok: true, creditsAdded: totalCredited, bonus });
}
