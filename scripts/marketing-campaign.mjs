#!/usr/bin/env node

import fs from 'fs';
import { MongoClient } from 'mongodb';
import Mailjet from 'node-mailjet';
import marketingConfig from '../config/marketing-campaigns.json' with { type: 'json' };
import contactConfig from '../config/contact.json' with { type: 'json' };

const [, , command = 'dry-run', firstArg = 'clinicplus-companion-client-invite', secondArg] =
  process.argv;
const campaignId = command === 'test-send' ? 'clinicplus-companion-client-invite' : firstArg;

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

function testInviteUrl() {
  return `${campaign.baseUrl.replace(/\/$/, '')}/login?invite=test-preview`;
}

function unsubscribeUrl(token) {
  return `${campaign.baseUrl.replace(/\/$/, '')}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
}

function emailHtml(invite, email, options = {}) {
  const firstName = escapeHtml(invite.userName.split(' ')[0] || invite.userName);
  const ctaUrl = options.testMode ? testInviteUrl() : inviteUrl(invite.token);
  const optOutUrl = options.testMode ? `${campaign.baseUrl.replace(/\/$/, '')}/login` : unsubscribeUrl(invite.token);
  const body = email.body
    .map((paragraph) => `<p style="margin:0 0 16px;color:#3f3a33;line-height:1.7;font-size:15px;">${escapeHtml(paragraph)}</p>`)
    .join('');
  const bullets = email.bullets
    .map(
      (item) => `<tr>
          <td width="22" valign="top" style="padding:0 0 12px;">
            <span style="display:inline-block;width:6px;height:6px;margin-top:8px;border-radius:999px;background:#c41230;"></span>
          </td>
          <td valign="top" style="padding:0 0 12px;color:#3f3a33;line-height:1.55;font-size:14.5px;">${escapeHtml(item)}</td>
        </tr>`
    )
    .join('');

  return `<!doctype html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <title>${escapeHtml(email.subject)}</title>
    </head>
    <body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">${escapeHtml(email.preview)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:32px 12px;">
        <tr><td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 1px 3px rgba(20,16,8,0.06);border:1px solid #ece6d8;">
            <tr>
              <td style="padding:30px 32px 22px;text-align:center;background:#ffffff;border-bottom:1px solid #f0ead9;">
                <img src="${campaign.logoUrl}" width="200" alt="ClinicPlus Booking Companion" style="display:inline-block;max-width:200px;width:60%;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;text-align:center;">
                <span style="display:inline-block;margin-top:20px;padding:6px 14px;border-radius:999px;background:#fbf3e0;border:1px solid #e9d6a3;color:#8a6a1f;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">
                  New: ClinicPlus Booking Companion
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px 4px;">
                <p style="margin:0 0 10px;color:#c41230;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-align:center;">
                  ${escapeHtml(email.eyebrow)}
                </p>
                <h1 style="margin:0 0 20px;color:#1c1a16;font-size:26px;line-height:1.25;font-weight:700;text-align:center;">
                  ${escapeHtml(email.headline)}
                </h1>
                <p style="margin:0 0 16px;color:#3f3a33;line-height:1.7;font-size:15px;">Hi ${firstName},</p>
                <p style="margin:0 0 16px;color:#3f3a33;line-height:1.7;font-size:15px;">${escapeHtml(email.intro)}</p>
                ${body}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 8px;">
                  ${bullets}
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px auto 8px;">
                  <tr>
                    <td style="border-radius:999px;background:linear-gradient(180deg,#d1264a,#b8102f);box-shadow:0 6px 16px rgba(196,18,48,0.25);">
                      <a href="${ctaUrl}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14.5px;border-radius:999px;">
                        ${escapeHtml(email.cta)}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:4px 0 4px;color:#8a857a;font-size:12.5px;line-height:1.6;text-align:center;">
                  Use your existing ClinicPlus login. The 100-credit invite bonus is applied on first login when you enter through this email button.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 32px 30px;">
                <p style="margin:0 0 4px;color:#4a453c;font-size:13.5px;line-height:1.6;">
                  Thanks,<br />
                  <strong style="color:#1c1a16;">The ClinicPlus Booking Companion Team</strong>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 26px;background:#faf8f3;border-top:1px solid #f0ead9;">
                <p style="margin:0 0 6px;color:#8a857a;font-size:11.5px;line-height:1.6;">
                  ClinicPlus Booking Companion is a standalone product built and operated by
                  Namoota Technology (Pty) Ltd for ClinicPlus clients. It is not required to use
                  ClinicPlus and does not replace the ClinicPlus bookings website.
                </p>
                <p style="margin:0;color:#a49f92;font-size:11.5px;line-height:1.6;">
                  Prefer not to receive this invite sequence?
                  <a href="${optOutUrl}" style="color:#c41230;text-decoration:underline;">Unsubscribe here</a>.
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
  </html>`;
}

async function sendEmail(invite, email, options = {}) {
  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error('MAILJET_API_KEY / MAILJET_API_SECRET not set');
  const mailjet = Mailjet.apiConnect(apiKey, apiSecret);
  await mailjet.post('send', { version: 'v3.1' }).request({
    Messages: [
      {
        From: { Email: contactConfig.supportEmail, Name: contactConfig.senderName },
        To: [{ Email: invite.userEmail, Name: invite.userName }],
        Subject: options.testMode ? `[TEST] ${email.subject}` : email.subject,
        TextPart: email.preview,
        HTMLPart: emailHtml(invite, email, options),
        CustomID: `${campaign.name}:${options.testMode ? 'Test' : email.step}`,
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
  } else if (command === 'test-send') {
    const testEmail = firstArg || 'aya@qwabi.co.za';
    const step = Number(secondArg ?? 0);
    const email = campaign.sequence.find((item) => item.step === step);
    if (!email) throw new Error(`No campaign email found for step ${step}`);
    const invite = {
      userEmail: testEmail,
      userName: 'Aya Qwabi',
      token: 'test-preview',
    };
    await sendEmail(invite, email, { testMode: true });
    console.log(JSON.stringify({ campaignId, sent: 1, testEmail, step, subject: `[TEST] ${email.subject}` }, null, 2));
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
    throw new Error('Use one of: dry-run, test-send, enroll, send-due');
  }
} finally {
  await client.close();
}
