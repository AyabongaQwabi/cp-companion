import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import { computeRosterCompliance } from '@/lib/compliance';
import { sendComplianceAlertEmail } from '@/lib/mailjet';
import type { RosterEmployee, ServiceValidityPeriod, ComplianceAlertSent } from '@/lib/types';

/**
 * Global cron: proactive compliance expiry email alerts. For every roster employee (across all
 * users) whose compliance entry is 'expiring-soon', checks complianceAlertsSent for an existing
 * row for this exact expiry cycle (rosterEmployeeId + serviceId + expiryDate); if none exists,
 * charges compliance.alertEmail (3 credits) to the roster owner's wallet and sends the email.
 *
 * If the charge fails (insufficient credits), the send is skipped but NO dedup row is written —
 * per explicit decision, this means the cron retries daily until either the wallet can afford it
 * or the expiry date passes (at which point the entry naturally falls out of 'expiring-soon'),
 * rather than permanently silencing the alert after one failed attempt.
 *
 * Inert until cp_companion.serviceValidityPeriods has real rows — computeRosterCompliance returns
 * [] for every employee when it's empty, so this cron does nothing until Aya supplies validity
 * periods, same as the rest of compliance tracking.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();

  const validityPeriods = await companionDb
    .collection<ServiceValidityPeriod>('serviceValidityPeriods')
    .find()
    .toArray();

  if (validityPeriods.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, note: 'no service validity periods configured' });
  }

  const allEmployees = await companionDb
    .collection<RosterEmployee>('employees')
    .find({ status: { $ne: 'terminated' } })
    .toArray();

  const byUser = new Map<string, RosterEmployee[]>();
  for (const emp of allEmployees) {
    const list = byUser.get(emp.userId) || [];
    list.push(emp);
    byUser.set(emp.userId, list);
  }

  const alertsSent = companionDb.collection<ComplianceAlertSent>('complianceAlertsSent');
  const usersCollection = prodDb.collection<{ details: { name: string; surname: string; email: string } }>('users');

  let sentCount = 0;
  let skippedCount = 0;

  for (const [userId, rosterEmployees] of byUser) {
    const entries = await computeRosterCompliance(prodDb, rosterEmployees, validityPeriods, 30);
    const expiringSoon = entries.filter((e) => e.status === 'expiring-soon');
    if (expiringSoon.length === 0) continue;

    const user = await usersCollection.findOne({ id: userId });
    if (!user) continue;

    for (const entry of expiringSoon) {
      try {
        const already = await alertsSent.findOne({
          rosterEmployeeId: entry.rosterEmployeeId,
          serviceId: entry.serviceId,
          expiryDate: entry.expiryDate,
        });
        if (already) continue;

        const charge = await chargeForAction(userId, 'compliance.alertEmail');
        if (!charge.ok) {
          skippedCount++;
          await companionDb.collection('auditLog').insertOne({
            action: 'COMPLIANCE_ALERT_SKIPPED',
            userId,
            rosterEmployeeId: entry.rosterEmployeeId,
            serviceId: entry.serviceId,
            expiryDate: entry.expiryDate,
            reason: 'insufficient_credits',
            at: new Date(),
          });
          continue;
        }

        await sendComplianceAlertEmail(user, {
          employeeName: entry.employeeName,
          serviceId: entry.serviceId,
          expiryDate: entry.expiryDate,
        });

        await alertsSent.insertOne({
          rosterEmployeeId: entry.rosterEmployeeId,
          serviceId: entry.serviceId,
          expiryDate: entry.expiryDate,
          userId,
          sentAt: new Date(),
        });
        sentCount++;
      } catch (err) {
        await companionDb.collection('auditLog').insertOne({
          action: 'COMPLIANCE_ALERT_FAILED',
          userId,
          rosterEmployeeId: entry.rosterEmployeeId,
          serviceId: entry.serviceId,
          error: err instanceof Error ? err.message : String(err),
          at: new Date(),
        });
      }
    }
  }

  return NextResponse.json({ sent: sentCount, skipped: skippedCount });
}
