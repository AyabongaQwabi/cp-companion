import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import type { AccountDeletionSchedule } from '@/lib/types';

/**
 * Cron-triggered: processes every accountDeletionSchedule row whose scheduledFor has elapsed and
 * is still 'pending'. Per explicit confirmation (not the spec's own recommended
 * Companion-side-only default — the user was shown the cross-system blast radius and chose to
 * proceed anyway, with an explicit warning + double confirm already required at request time in
 * /api/profile/delete-account POST and its frontend modal): this HARD DELETES the
 * production.users document, which also breaks login to cp-redesign/cp-redesign-admin since it's
 * the same shared ClinicPlus account — not just Companion access.
 *
 * Fail-closed, same copy-then-delete discipline as appointment deletion: the user document is
 * copied into a new production.deleted_users collection (mirroring deleted_appointments) before
 * being removed, and the schedule row is only marked 'completed' after both steps succeed. If the
 * user document is already gone (e.g. deleted through some other path), the schedule is still
 * marked completed rather than retried forever.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();
  const schedules = companionDb.collection<AccountDeletionSchedule>('accountDeletionSchedule');
  const usersCollection = prodDb.collection('users');
  const deletedUsersCollection = prodDb.collection('deleted_users');

  const due = await schedules
    .find({ status: 'pending', scheduledFor: { $lte: new Date() } })
    .toArray();

  const results: { userId: string; outcome: string }[] = [];

  for (const schedule of due) {
    const { userId } = schedule;
    try {
      const user = await usersCollection.findOne({ id: userId });

      if (!user) {
        await schedules.updateOne(
          { _id: schedule._id },
          { $set: { status: 'completed', completedAt: new Date() } }
        );
        await companionDb.collection('auditLog').insertOne({
          action: 'PROCESS_ACCOUNT_DELETION',
          userId,
          note: 'production.users document already absent',
          at: new Date(),
        });
        results.push({ userId, outcome: 'already_absent' });
        continue;
      }

      await deletedUsersCollection.insertOne(user);
      await usersCollection.deleteOne({ _id: user._id });

      await schedules.updateOne(
        { _id: schedule._id },
        { $set: { status: 'completed', completedAt: new Date() } }
      );

      await companionDb.collection('auditLog').insertOne({
        action: 'PROCESS_ACCOUNT_DELETION',
        userId,
        before: user,
        at: new Date(),
      });
      results.push({ userId, outcome: 'deleted' });
    } catch (err) {
      // Fail closed for this one row: leave it 'pending' so the next cron run retries it, and
      // never partially mark it completed if the copy or delete didn't both succeed.
      await companionDb.collection('auditLog').insertOne({
        action: 'PROCESS_ACCOUNT_DELETION_FAILED',
        userId,
        error: err instanceof Error ? err.message : String(err),
        at: new Date(),
      });
      results.push({ userId, outcome: 'failed' });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
