import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import type { AccountDeletionSchedule } from '@/lib/types';

const SCHEDULE_DAYS = 10;

/**
 * Current deletion schedule state for this user, if any — GET so the Profile page can show
 * "scheduled for deletion in X days" on load without a client-side date computation drifting
 * from the server's own SCHEDULE_DAYS constant.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const companionDb = await getCompanionDb();
  const schedule = await companionDb
    .collection<AccountDeletionSchedule>('accountDeletionSchedule')
    .findOne({ userId, status: 'pending' });

  return NextResponse.json({ schedule: schedule || null });
}

interface ScheduleDeletionBody {
  userId: string;
  confirmationText: string;
}

/**
 * Schedules ClinicPlus account deletion 10 days out. Deliberately never touches production.users
 * here — only cp_companion.accountDeletionSchedule. The actual hard-delete of production.users
 * happens exclusively in /api/cron/process-account-deletions once scheduledFor elapses; this
 * route only ever creates/reactivates the pending schedule row. Priced at 250 credits
 * (account.deleteRequest) — this self-serve scheduling flow is a Companion-only convenience with
 * no equivalent in ClinicPlus/booking itself, so it's priced like the other high-consequence
 * bulk-delete actions in the table, not treated as free the way it might be if this were a
 * built-in ClinicPlus feature.
 */
export async function POST(req: NextRequest) {
  const body: ScheduleDeletionBody = await req.json();
  const { userId, confirmationText } = body;

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  if (confirmationText !== 'DELETE') {
    return NextResponse.json({ error: 'Type DELETE to confirm' }, { status: 400 });
  }

  const companionDb = await getCompanionDb();
  const schedules = companionDb.collection<AccountDeletionSchedule>('accountDeletionSchedule');

  const existing = await schedules.findOne({ userId, status: 'pending' });
  if (existing) {
    return NextResponse.json({ error: 'Deletion is already scheduled' }, { status: 409 });
  }

  const charge = await chargeForAction(userId, 'account.deleteRequest');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const now = new Date();
  const scheduledFor = new Date(now.getTime() + SCHEDULE_DAYS * 24 * 60 * 60 * 1000);

  const schedule: Omit<AccountDeletionSchedule, '_id'> = {
    userId,
    scheduledFor,
    status: 'pending',
    requestedAt: now,
  };
  await schedules.insertOne(schedule);

  await companionDb.collection('auditLog').insertOne({
    action: 'SCHEDULE_ACCOUNT_DELETION',
    userId,
    scheduledFor,
    at: now,
  });

  return NextResponse.json({ ok: true, scheduledFor });
}

interface CancelDeletionBody {
  userId: string;
}

/**
 * Cancels a pending deletion schedule — flips status to 'cancelled', which the cron job's query
 * (status: 'pending') then naturally skips. Free, same POPIA reasoning as scheduling it.
 */
export async function DELETE(req: NextRequest) {
  const body: CancelDeletionBody = await req.json();
  const { userId } = body;
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const companionDb = await getCompanionDb();
  const schedules = companionDb.collection<AccountDeletionSchedule>('accountDeletionSchedule');

  const existing = await schedules.findOne({ userId, status: 'pending' });
  if (!existing) {
    return NextResponse.json({ error: 'No pending deletion to cancel' }, { status: 404 });
  }

  const charge = await chargeForAction(userId, 'account.deleteCancel');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const now = new Date();
  await schedules.updateOne(
    { _id: existing._id },
    { $set: { status: 'cancelled', cancelledAt: now } }
  );

  await companionDb.collection('auditLog').insertOne({
    action: 'CANCEL_ACCOUNT_DELETION',
    userId,
    at: now,
  });

  return NextResponse.json({ ok: true });
}
