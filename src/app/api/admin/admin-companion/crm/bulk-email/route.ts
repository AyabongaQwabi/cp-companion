import { NextRequest, NextResponse } from 'next/server';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { getAdminCompanionDb, getProductionDb } from '@/lib/mongodb';
import { sendAdminBulkEmail } from '@/lib/mailjet';
import type { ClinicPlusUserDocument } from '@/lib/types';

export function OPTIONS() {
  return adminStatsCorsPreflight();
}

function displayName(user: ClinicPlusUserDocument) {
  return [user.details?.name, user.details?.surname].filter(Boolean).join(' ').trim() || user.details?.email || 'Customer';
}

export async function POST(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const purpose = body.purpose === 'transactional' ? 'transactional' : 'marketing';
  const senderName = typeof body.senderName === 'string' ? body.senderName.trim() : 'ClinicPlus Admin';
  const recipientIds = Array.isArray(body.recipientIds)
    ? body.recipientIds.filter((id: unknown): id is string => typeof id === 'string')
    : [];

  if (!subject || !message) {
    return withAdminStatsCors(NextResponse.json({ error: 'subject and message are required' }, { status: 400 }));
  }

  const prodDb = await getProductionDb();
  const query =
    recipientIds.length > 0
      ? { id: { $in: recipientIds }, 'details.email': { $type: 'string', $ne: '' } }
      : { role: 'client', 'details.email': { $type: 'string', $ne: '' } };
  const recipients = (await prodDb
    .collection<ClinicPlusUserDocument>('users')
    .find(query)
    .project({ id: 1, details: 1, role: 1 })
    .limit(500)
    .toArray()) as unknown as ClinicPlusUserDocument[];

  const adminDb = await getAdminCompanionDb();
  const campaign = {
    subject,
    message,
    purpose,
    senderName,
    senderId: typeof body.senderId === 'string' ? body.senderId : null,
    recipientCount: recipients.length,
    createdAt: new Date(),
  };
  const campaignResult = await adminDb.collection('crmEmailCampaigns').insertOne(campaign);

  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      await sendAdminBulkEmail({
        to: { Email: recipient.details.email, Name: displayName(recipient) },
        subject,
        message,
        purpose,
        senderName,
      });
      sent++;
      await adminDb.collection('crmEmailDeliveries').insertOne({
        campaignId: campaignResult.insertedId,
        userId: recipient.id,
        email: recipient.details.email,
        status: 'sent',
        sentAt: new Date(),
      });
    } catch (error) {
      failed++;
      await adminDb.collection('crmEmailDeliveries').insertOne({
        campaignId: campaignResult.insertedId,
        userId: recipient.id,
        email: recipient.details.email,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        failedAt: new Date(),
      });
    }
  }

  await adminDb.collection('crmEmailCampaigns').updateOne(
    { _id: campaignResult.insertedId },
    { $set: { sent, failed, completedAt: new Date() } }
  );

  return withAdminStatsCors(NextResponse.json({ campaignId: campaignResult.insertedId, recipients: recipients.length, sent, failed }));
}
