import { NextResponse } from 'next/server';
import { chargeForAction } from '@/lib/credits';
import { getCompanionDb } from '@/lib/mongodb';
import { sendFeatureRequestEmail } from '@/lib/mailjet';
import type { FeatureRequest } from '@/lib/types';
import featureRequestConfig from '../../../../config/feature-request.json';

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(req: Request) {
  const body = await req.json();
  const userId = clean(body.userId);
  const userName = clean(body.userName);
  const userEmail = clean(body.userEmail);
  const title = clean(body.title);
  const description = clean(body.description);
  const impact = clean(body.impact);

  if (!userId || !userName || !userEmail || !title || !description) {
    return NextResponse.json(
      { error: 'userId, userName, userEmail, title and description are required' },
      { status: 400 }
    );
  }

  const charge = await chargeForAction(userId, 'featureRequest.submit');
  if (!charge.ok) {
    return NextResponse.json(
      { error: charge.error || 'Insufficient credits', creditCost: charge.creditCost },
      { status: 402 }
    );
  }

  const featureRequest: FeatureRequest = {
    userId,
    userName,
    userEmail,
    title,
    description,
    impact: impact || undefined,
    status: featureRequestConfig.database.initialStatus as FeatureRequest['status'],
    createdAt: new Date(),
  };

  const db = await getCompanionDb();
  const result = await db
    .collection<FeatureRequest>(featureRequestConfig.database.collection)
    .insertOne(featureRequest);

  await sendFeatureRequestEmail({
    userName,
    userEmail,
    title,
    description,
    impact: impact || undefined,
  });

  return NextResponse.json({ ok: true, id: result.insertedId.toString() }, { status: 201 });
}
