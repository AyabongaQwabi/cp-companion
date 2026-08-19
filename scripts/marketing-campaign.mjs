#!/usr/bin/env node

import fs from 'fs';
import { MongoClient } from 'mongodb';
import Mailjet from 'node-mailjet';
import marketingConfig from '../config/marketing-campaigns.json' with { type: 'json' };
import contactConfig from '../config/contact.json' with { type: 'json' };

const [, , command = 'dry-run', campaignId = 'clinicplus-companion-client-invite'] = process.argv;

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const campaign = marketingConfig.campaigns.find((item) => item.id === campaignId);
if (!campaign || !campaign.enabled) {
  throw new Error(`Campaign not found or disabled: ${campaignId}`);
}

function eligibleUserFilter() {
  const excluded = campaign.segment.excludeEmailWords
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return {
    role: campaign.segment.role,
    'details.email': { $type: 'string', $not: new RegExp(excluded, 'i') },
  };
}

function displayName(user) {
  return [user.details?.name, user.details?.surname].filter(Boolean).join(' ').trim() || 'there';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function inviteUrl(token) {
  return `${campaign.baseUrl.replace(/\/$/, '')}/api/marketing/click?token=${encodeURIComponent(token)}`;
}

function unsubscribeUrl(token) {
  return `${campaign.baseUrl.replace(/\/$/, '')}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
}

function emailHtml(invite, email) {
  const firstName = escapeHtml(invite.userName.split(' ')[0] || invite.userName);
  const body = email.body
    .map((paragraph) => `<p style="margin:0 0 16px;color:#2b2b2b;line-height:1.65;">${escapeHtml(paragraph)}</p>`)
    .join('');
  const bullets = email.bullets
    .map((item) => `<li style="margin:0 0 10px;color:#2b2b2b;line-height:1.5;"><span style="color:#b8892f;font-weight:700;">•</span> ${escapeHtml(item)}</li>`)
    .join('');

  return `<!doctype html>
  <html>
    <body style="margin:0;padding:0;background:#0f0f10;font-family:Arial,Helvetica,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">${escapeHtml(email.preview)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f0f10;padding:28px 12px;">
        <tr><td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #d6b25e;">
            <tr><td style="background:#111111;padding:26px 28px;text-align:center;">
              <img src="${campaign.logoUrl}" width="220" alt="ClinicPlus Companion" style="display:inline-block;max-width:220px;width:70%;height:auto;" />
            </td></tr>
            <tr><td style="padding:34px 30px 8px;">
              <p style="margin:0 0 12px;color:#b8892f;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(email.eyebrow)}</p>
              <h1 style="margin:0 0 18px;color:#111111;font-size:28px;line-height:1.18;font-weight:700;">${escapeHtml(email.headline)}</h1>
              <p style="margin:0 0 16px;color:#2b2b2b;line-height:1.65;">Hi ${firstName},</p>
              <p style="margin:0 0 16px;color:#2b2b2b;line-height:1.65;">${escapeHtml(email.intro)}</p>
              ${body}
              <ul style="margin:2px 0 22px;padding:0;list-style:none;">${bullets}</ul>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0;"><tr><td style="border-radius:999px;background:#c41230;">
                <a href="${inviteUrl(invite.token)}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-weight:700;border-radius:999px;border:1px solid #d6b25e;">${escapeHtml(email.cta)}</a>
              </td></tr></table>
              <p style="margin:0 0 16px;color:#666666;font-size:13px;line-height:1.6;">Use your existing ClinicPlus login. The 100-credit invite bonus is applied on first login when you enter through this email button.</p>
            </td></tr>
            <tr><td style="padding:22px 30px 30px;background:#fafafa;border-top:1px solid #eeeeee;">
              <p style="margin:0;color:#555555;font-size:13px;line-height:1.6;">Thanks,<br />The ClinicPlus Team</p>
              <p style="margin:14px 0 0;color:#777777;font-size:12px;line-height:1.5;">Prefer not to receive this invite sequence? <a href="${unsubscribeUrl(invite.token)}" style="color:#c41230;text-decoration:underline;">Unsubscribe here</a>.</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
  </html>`;
}

async function sendEmail(invite, email) {
  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error('MAILJET_API_KEY / MAILJET_API_SECRET not set');
  const mailjet = Mailjet.apiConnect(apiKey, apiSecret);
  await mailjet.post('send', { version: 'v3.1' }).request({
    Messages: [
      {
        From: { Email: contactConfig.supportEmail, Name: contactConfig.senderName },
        To: [{ Email: invite.userEmail, Name: invite.userName }],
        Subject: email.subject,
        TextPart: email.preview,
        HTMLPart: emailHtml(invite, email),
        CustomID: `${campaign.name}:${email.step}`,
      },
    ],
  });
}

const client = await new MongoClient(process.env.DATABASE_URL).connect();
try {
  const prod = client.db(process.env.SELECTED_DB || 'production');
  const companion = client.db(process.env.COMPANION_DB || 'cp_companion');

  if (command === 'dry-run') {
    const users = await prod
      .collection('users')
      .find(eligibleUserFilter())
      .project({ id: 1, role: 1, 'details.name': 1, 'details.surname': 1, 'details.email': 1 })
      .sort({ 'details.email': 1 })
      .toArray();
    console.log(JSON.stringify({ campaignId, eligible: users.length, users: users.map((user) => ({ id: user.id, name: displayName(user), email: user.details.email, role: user.role })) }, null, 2));
  } else if (command === 'enroll') {
    const users = await prod.collection('users').find(eligibleUserFilter()).project({ id: 1, role: 1, details: 1 }).toArray();
    let enrolled = 0;
    let existing = 0;
    const now = new Date();
    await companion.collection('emailCampaignInvites').createIndex({ campaignId: 1, userId: 1 }, { unique: true });
    await companion.collection('emailCampaignInvites').createIndex({ token: 1 }, { unique: true });
    for (const user of users) {
      const result = await companion.collection('emailCampaignInvites').updateOne(
        { campaignId, userId: user.id },
        {
          $setOnInsert: {
            campaignId,
            userId: user.id,
            userEmail: user.details.email,
            userName: displayName(user),
            token: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '').slice(0, 16),
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
    console.log(JSON.stringify({ campaignId, eligible: users.length, enrolled, existing }, null, 2));
  } else if (command === 'send-due') {
    const now = new Date();
    const invites = await companion
      .collection('emailCampaignInvites')
      .find({ campaignId, nextStep: { $lt: campaign.sequence.length }, nextEmailDueAt: { $lte: now }, unsubscribedAt: { $exists: false } })
      .sort({ nextEmailDueAt: 1 })
      .limit(campaign.maxEmailsPerRun)
      .toArray();
    let sent = 0;
    for (const invite of invites) {
      const email = campaign.sequence.find((item) => item.step === invite.nextStep);
      if (!email) continue;
      const stillEligible = await prod.collection('users').findOne({
        $and: [eligibleUserFilter(), { id: invite.userId, 'details.email': invite.userEmail }],
      });
      if (!stillEligible) {
        await companion.collection('emailCampaignInvites').updateOne(
          { _id: invite._id },
          {
            $set: { unsubscribedAt: now, completedAt: now },
            $unset: { nextEmailDueAt: '' },
          }
        );
        continue;
      }
      await sendEmail(invite, email);
      const nextStep = invite.nextStep + 1;
      const nextEmail = campaign.sequence.find((item) => item.step === nextStep);
      await companion.collection('emailCampaignInvites').updateOne(
        { _id: invite._id },
        {
          $set: nextEmail
            ? { nextStep, nextEmailDueAt: new Date(now.getTime() + nextEmail.delayDays * 86400000) }
            : { nextStep, completedAt: now },
          ...(nextEmail ? {} : { $unset: { nextEmailDueAt: '' } }),
          $push: { sent: { step: email.step, subject: email.subject, sentAt: now } },
        }
      );
      sent++;
    }
    console.log(JSON.stringify({ campaignId, processed: invites.length, sent }, null, 2));
  } else {
    throw new Error('Use one of: dry-run, enroll, send-due');
  }
} finally {
  await client.close();
}
