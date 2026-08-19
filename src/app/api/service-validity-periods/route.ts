import { NextRequest, NextResponse } from 'next/server';
import { chargeForAction } from '@/lib/credits';
import { getCompanionDb } from '@/lib/mongodb';
import { isSuperadmin } from '@/lib/roles';
import type { ServiceValidityPeriod } from '@/lib/types';

/**
 * CRUD for cp_companion.serviceValidityPeriods — a GLOBAL, cross-company config collection (how
 * long each medical service stays valid before an employee needs to redo it). Superadmin-only:
 * this is the raw config surface, not the derived output — regular company users only ever see
 * expiry status (compliance dashboard, roster badges), never these numbers or an edit control.
 * Every handler checks role === 'superadmin' server-side and fails closed (403) otherwise; never
 * trust a client-sent role claim.
 *
 * The DB is seeded from config/service-validity-periods.json on every login
 * (seedMissingServiceValidityPeriods, insert-only per serviceId) — that JSON file is the reviewed
 * source of truth for baseline values, not a one-off script or direct DB write. This route is for
 * a superadmin's live edits/confirms on top of that baseline (e.g. clearing the draft flag once
 * Aya confirms a number) — those DB-side changes are never clobbered by the seed.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId || !(await isSuperadmin(userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = await getCompanionDb();
  const rows = await db
    .collection<ServiceValidityPeriod>('serviceValidityPeriods')
    .find()
    .sort({ serviceId: 1 })
    .toArray();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, serviceId, validityMonths, isDraft } = body;

  if (!userId || !(await isSuperadmin(userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!serviceId || !validityMonths || validityMonths <= 0) {
    return NextResponse.json({ error: 'serviceId and a positive validityMonths required' }, { status: 400 });
  }

  const charge = await chargeForAction(userId, 'serviceValidity.upsert');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const db = await getCompanionDb();
  const now = new Date();
  const result = await db.collection<ServiceValidityPeriod>('serviceValidityPeriods').findOneAndUpdate(
    { serviceId },
    { $set: { serviceId, validityMonths: Number(validityMonths), isDraft: !!isDraft, updatedAt: now } },
    { upsert: true, returnDocument: 'after' }
  );

  return NextResponse.json(result, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const serviceId = req.nextUrl.searchParams.get('serviceId');

  if (!userId || !(await isSuperadmin(userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!serviceId) {
    return NextResponse.json({ error: 'serviceId required' }, { status: 400 });
  }
  const charge = await chargeForAction(userId, 'serviceValidity.delete');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }
  const db = await getCompanionDb();
  await db.collection('serviceValidityPeriods').deleteOne({ serviceId });
  return NextResponse.json({ ok: true });
}
