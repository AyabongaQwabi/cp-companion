import crypto from 'crypto';
import type { Db, Filter, UpdateFilter } from 'mongodb';
import marketingCampaignsConfig from '../../config/marketing-campaigns.json';
import { getCompanionDb, getProductionDb } from './mongodb';
import { sendMarketingCampaignEmail } from './mailjet';
import type { ClinicPlusUserDocument, EmailCampaignInvite } from './types';

type CampaignEmail = {
  step: number;
  delayDays: number;
  subject: string;
  preview: string;
  headline: string;
  eyebrow: string;
  intro: string;
  body: string[];
  bullets: string[];
  cta: string;
};

type CampaignConfig = {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
  logoUrl: string;
  firstLoginBonusCredits: number;
  fallbackSignupBonusCredits: number;
  maxEmailsPerRun: number;
  segment: {
    role: string;
    excludeEmailWords: string[];
  };
  sequence: CampaignEmail[];
};

const CAMPAIGNS = marketingCampaignsConfig.campaigns as CampaignConfig[];

export function getMarketingCampaign(campaignId: string): CampaignConfig {
  const campaign = CAMPAIGNS.find((item) => item.id === campaignId);
  if (!campaign || !campaign.enabled) {
    throw new Error(`Marketing campaign not found or disabled: ${campaignId}`);
  }
  return campaign;
}

function eligibleUserFilter(campaign: CampaignConfig): Filter<ClinicPlusUserDocument> {
  const excluded = campaign.segment.excludeEmailWords
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  return {
    role: campaign.segment.role,
    'details.email': {
      $type: 'string',
      $not: new RegExp(excluded, 'i'),
    },
  } as Filter<ClinicPlusUserDocument>;
}

function displayName(user: ClinicPlusUserDocument): string {
  return [user.details?.name, user.details?.surname].filter(Boolean).join(' ').trim() || 'there';
}

function nextDueDate(from: Date, delayDays: number): Date {
  return new Date(from.getTime() + delayDays * 86400000);
}

function inviteUrl(campaign: CampaignConfig, token: string): string {
  const base = campaign.baseUrl.replace(/\/$/, '');
  return `${base}/api/marketing/click?token=${encodeURIComponent(token)}`;
}

function unsubscribeUrl(campaign: CampaignConfig, token: string): string {
  const base = campaign.baseUrl.replace(/\/$/, '');
  return `${base}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function previewMarketingCampaignAudience(campaignId: string) {
  const campaign = getMarketingCampaign(campaignId);
  const prodDb = await getProductionDb();
  const filter = eligibleUserFilter(campaign);
  const total = await prodDb.collection<ClinicPlusUserDocument>('users').countDocuments(filter);
  const sample = (await prodDb
    .collection<ClinicPlusUserDocument>('users')
    .find(filter)
    .project({ id: 1, role: 1, 'details.name': 1, 'details.surname': 1, 'details.email': 1 })
    .sort({ 'details.email': 1 })
    .limit(10)
    .toArray()) as unknown as ClinicPlusUserDocument[];

  return {
    campaignId,
    total,
    sample: sample.map((user) => ({
      id: user.id,
      name: displayName(user),
      email: user.details.email,
      role: user.role,
    })),
  };
}

export async function enrollMarketingCampaignAudience(campaignId: string) {
  const campaign = getMarketingCampaign(campaignId);
  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();
  const now = new Date();
  await companionDb
    .collection<EmailCampaignInvite>('emailCampaignInvites')
    .createIndex({ campaignId: 1, userId: 1 }, { unique: true });
  await companionDb
    .collection<EmailCampaignInvite>('emailCampaignInvites')
    .createIndex({ token: 1 }, { unique: true });
  const users = (await prodDb
    .collection<ClinicPlusUserDocument>('users')
    .find(eligibleUserFilter(campaign))
    .project({ id: 1, role: 1, details: 1 })
    .toArray()) as unknown as ClinicPlusUserDocument[];

  let enrolled = 0;
  let existing = 0;
  for (const user of users) {
    const result = await companionDb.collection<EmailCampaignInvite>('emailCampaignInvites').updateOne(
      { campaignId, userId: user.id },
      {
        $setOnInsert: {
          campaignId,
          userId: user.id,
          userEmail: user.details.email,
          userName: displayName(user),
          token: crypto.randomBytes(24).toString('hex'),
          firstLoginBonusCredits: campaign.firstLoginBonusCredits,
          enrolledAt: now,
          nextStep: 0,
          nextEmailDueAt: now,
          sent: [],
        },
      },
      { upsert: true }
    );
    if (result.upsertedCount) enrolled++;
    else existing++;
  }

  return { campaignId, eligible: users.length, enrolled, existing };
}

export async function sendDueMarketingCampaignEmails(campaignId: string, limit?: number) {
  const campaign = getMarketingCampaign(campaignId);
  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();
  const now = new Date();
  const sendLimit = Math.min(Math.max(limit || campaign.maxEmailsPerRun, 1), 250);
  const invites = await companionDb
    .collection<EmailCampaignInvite>('emailCampaignInvites')
    .find({
      campaignId,
      nextStep: { $lt: campaign.sequence.length },
      nextEmailDueAt: { $lte: now },
      unsubscribedAt: { $exists: false },
    })
    .sort({ nextEmailDueAt: 1 })
    .limit(sendLimit)
    .toArray();

  let sent = 0;
  let failed = 0;
  for (const invite of invites) {
    const email = campaign.sequence.find((item) => item.step === invite.nextStep);
    if (!email) continue;

    try {
      const stillEligible = await prodDb.collection<ClinicPlusUserDocument>('users').findOne({
        $and: [
          eligibleUserFilter(campaign),
          { id: invite.userId, 'details.email': invite.userEmail },
        ],
      });
      if (!stillEligible) {
        await companionDb.collection<EmailCampaignInvite>('emailCampaignInvites').updateOne(
          { _id: invite._id },
          {
            $set: {
              unsubscribedAt: now,
              completedAt: now,
            },
            $unset: {
              nextEmailDueAt: '',
            },
          }
        );
        continue;
      }

      await sendMarketingCampaignEmail({
        to: { Email: invite.userEmail, Name: invite.userName },
        logoUrl: campaign.logoUrl,
        inviteUrl: inviteUrl(campaign, invite.token),
        unsubscribeUrl: unsubscribeUrl(campaign, invite.token),
        recipientName: invite.userName,
        campaignName: campaign.name,
        email,
      });

      const nextStep = invite.nextStep + 1;
      const nextEmail = campaign.sequence.find((item) => item.step === nextStep);
      const completionUpdate: UpdateFilter<EmailCampaignInvite> = nextEmail
        ? {
            $set: {
              nextStep,
              nextEmailDueAt: nextDueDate(now, nextEmail.delayDays),
            },
          }
        : {
            $set: {
              nextStep,
              completedAt: now,
            },
            $unset: {
              nextEmailDueAt: '',
            },
          };
      await companionDb.collection<EmailCampaignInvite>('emailCampaignInvites').updateOne(
        { _id: invite._id },
        {
          ...completionUpdate,
          $push: {
            sent: {
              step: email.step,
              subject: email.subject,
              sentAt: now,
            },
          } as never,
        }
      );
      sent++;
    } catch (error) {
      failed++;
      await companionDb.collection('auditLog').insertOne({
        action: 'MARKETING_CAMPAIGN_EMAIL_FAILED',
        campaignId,
        userId: invite.userId,
        email: invite.userEmail,
        step: email.step,
        error: error instanceof Error ? error.message : String(error),
        at: now,
      });
    }
  }

  return { campaignId, processed: invites.length, sent, failed };
}

export async function markMarketingInviteClicked(token: string) {
  const db = await getCompanionDb();
  const now = new Date();
  const invite = await db.collection<EmailCampaignInvite>('emailCampaignInvites').findOneAndUpdate(
    { token },
    { $set: { clickedAt: now, lastClickedAt: now } },
    { returnDocument: 'after' }
  );
  return invite;
}

export async function unsubscribeMarketingInvite(token: string) {
  const db = await getCompanionDb();
  const now = new Date();
  const invite = await db.collection<EmailCampaignInvite>('emailCampaignInvites').findOneAndUpdate(
    { token },
    { $set: { unsubscribedAt: now } },
    { returnDocument: 'after' }
  );
  return invite;
}

export async function resolveCampaignInviteBonus(
  db: Db,
  productionUserId: string,
  inviteToken?: string
) {
  if (!inviteToken) return null;
  return db.collection<EmailCampaignInvite>('emailCampaignInvites').findOne({
    token: inviteToken,
    userId: productionUserId,
    bonusClaimedAt: { $exists: false },
  });
}
