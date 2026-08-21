#!/usr/bin/env node

import fs from 'fs';
import { MongoClient } from 'mongodb';
import Mailjet from 'node-mailjet';
import marketingConfig from '../config/marketing-campaigns.json' with { type: 'json' };
import contactConfig from '../config/contact.json' with { type: 'json' };

// Verbose by default — this script runs unattended (cron) as often as it runs by hand, so every
// meaningful step logs what it's doing, what it found, and what it decided, not just the final
// summary line. Timestamped so log lines can be correlated against cron scheduling / Mailjet's
// own delivery logs when debugging why an email did or didn't go out.
//
// Only plain strings are logged, never raw objects — console.log pretty-prints a nested object
// across many lines, which drowns a fast-moving progress log (e.g. send-due processing hundreds
// of invites) in clutter. Any detail worth keeping is folded into the message string itself.
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

log(`Marketing campaign script starting (${process.argv.slice(2).join(' ') || 'no args'})`);

// --step <n> is an optional flag (only meaningful for send-due) that restricts the run to
// invites currently queued at that exact sequence step, e.g. `--step 0` to send only first
// emails and leave second-email-and-later invites for a separate run. Parsed out of the argv
// before the positional args below so it can appear anywhere on the command line.
const stepFlagIndex = process.argv.indexOf('--step');
const stepFilter = stepFlagIndex !== -1 ? Number(process.argv[stepFlagIndex + 1]) : null;
const positional = process.argv.slice(2).filter((_, i) => {
  const realIndex = i + 2;
  return realIndex !== stepFlagIndex && realIndex !== stepFlagIndex + 1;
});

const [command = 'dry-run', firstArg = 'clinicplus-companion-client-invite', secondArg] = positional;
const campaignId = command === 'test-send' ? 'clinicplus-companion-client-invite' : firstArg;
log(`Parsed command: ${command}, campaignId: ${campaignId}${stepFilter !== null ? `, step filter: ${stepFilter}` : ''}`);

let envVarsLoaded = 0;
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2];
    envVarsLoaded++;
  }
}
log(`Loaded ${envVarsLoaded} env vars from .env.local`);

const campaign = marketingConfig.campaigns.find((item) => item.id === campaignId);
if (!campaign || !campaign.enabled) {
  log(`ERROR: campaign not found or disabled: ${campaignId} (known: ${marketingConfig.campaigns.map((c) => c.id).join(', ')})`);
  throw new Error(`Campaign not found or disabled: ${campaignId}`);
}
log(`Loaded campaign "${campaign.name}" (${campaign.id}) — ${campaign.sequence.length} sequence steps, maxEmailsPerRun ${campaign.maxEmailsPerRun}`);

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wraps sendEmail with one retry after a transient-network failure (ECONNRESET, socket hang up,
// timeouts) — Mailjet's connection drops occasionally mid-batch, and without this a single flaky
// send used to throw and abort the entire send-due run, leaving everyone after it in the batch
// unprocessed. Returns { ok: true } on success or { ok: false, error } after both attempts fail,
// so the caller can log it and move on to the next invite instead of crashing.
async function sendEmailWithRetry(invite, email, options = {}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await sendEmail(invite, email, options);
      return { ok: true };
    } catch (err) {
      if (attempt === 2) {
        return { ok: false, error: err?.message || String(err) };
      }
      log(`  Retrying after transient send error for ${invite.userEmail}: ${err?.message}`);
      await sleep(1000);
    }
  }
}

async function sendEmail(invite, email, options = {}) {
  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_API_SECRET;
  if (!apiKey || !apiSecret) {
    log('ERROR: MAILJET_API_KEY / MAILJET_API_SECRET not set');
    throw new Error('MAILJET_API_KEY / MAILJET_API_SECRET not set');
  }
  const subject = options.testMode ? `[TEST] ${email.subject}` : email.subject;
  const customId = `${campaign.name}:${options.testMode ? 'Test' : email.step}`;
  log(`Sending email to ${invite.userName} <${invite.userEmail}> — step ${email.step}: "${subject}"`);
  const mailjet = Mailjet.apiConnect(apiKey, apiSecret);
  const start = Date.now();
  try {
    const result = await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: { Email: contactConfig.supportEmail, Name: contactConfig.senderName },
          To: [{ Email: invite.userEmail, Name: invite.userName }],
          Subject: subject,
          TextPart: email.preview,
          HTMLPart: emailHtml(invite, email, options),
          CustomID: customId,
        },
      ],
    });
    const status = result.body?.Messages?.[0]?.Status;
    const messageId = result.body?.Messages?.[0]?.To?.[0]?.MessageID;
    log(`Mailjet accepted send to ${invite.userName} <${invite.userEmail}> — status ${status}, messageId ${messageId}, ${Date.now() - start}ms`);
  } catch (err) {
    log(`ERROR: Mailjet send failed for ${invite.userName} <${invite.userEmail}> — ${err?.message}`);
    throw err;
  }
}

const dbConnectStart = Date.now();
const client = await new MongoClient(process.env.DATABASE_URL).connect();
log(`MongoDB connected (${Date.now() - dbConnectStart}ms)`);

if (stepFilter !== null && command !== 'send-due') {
  log(`ERROR: --step is only meaningful for send-due, not ${command}`);
  throw new Error('--step is only meaningful for send-due');
}

try {
  const prod = client.db(process.env.SELECTED_DB || 'production');
  const companion = client.db(process.env.COMPANION_DB || 'cp_companion');

  if (command === 'dry-run') {
    log('Running dry-run: listing eligible users, no emails sent, no DB writes');
    const filter = eligibleUserFilter();
    const users = await prod
      .collection('users')
      .find(filter)
      .project({ id: 1, role: 1, 'details.name': 1, 'details.surname': 1, 'details.email': 1 })
      .sort({ 'details.email': 1 })
      .toArray();
    log(`Dry-run result: ${users.length} eligible user(s)`);
    for (const [i, user] of users.entries()) {
      log(`  [${i + 1}/${users.length}] ${displayName(user)} <${user.details.email}>`);
    }

  } else if (command === 'test-send') {
    const testEmail = firstArg || 'aya@qwabi.co.za';
    const step = Number(secondArg ?? 0);
    log(`Running test-send to ${testEmail}, step ${step}`);
    const email = campaign.sequence.find((item) => item.step === step);
    if (!email) {
      log(`ERROR: no campaign email found for step ${step} (known steps: ${campaign.sequence.map((s) => s.step).join(', ')})`);
      throw new Error(`No campaign email found for step ${step}`);
    }
    log(`Found sequence step ${email.step}: "${email.subject}"`);
    const invite = {
      userEmail: testEmail,
      userName: 'Aya Qwabi',
      token: 'test-preview',
    };
    await sendEmail(invite, email, { testMode: true });
    log(`test-send complete: sent to ${testEmail}`);

  } else if (command === 'enroll') {
    log('Running enroll: upserting emailCampaignInvites for every eligible user');
    const filter = eligibleUserFilter();
    const users = await prod.collection('users').find(filter).project({ id: 1, role: 1, details: 1 }).toArray();
    log(`Found ${users.length} eligible user(s)`);

    await companion.collection('emailCampaignInvites').createIndex({ campaignId: 1, userId: 1 }, { unique: true });
    await companion.collection('emailCampaignInvites').createIndex({ token: 1 }, { unique: true });

    let enrolled = 0;
    let existing = 0;
    const now = new Date();
    for (const [i, user] of users.entries()) {
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
      const name = displayName(user);
      if (result.upsertedCount) {
        enrolled++;
        log(`[${i + 1}/${users.length}] Enrolled ${name} <${user.details.email}>`);
      } else {
        existing++;
        log(`[${i + 1}/${users.length}] Already enrolled, skipped: ${name} <${user.details.email}>`);
      }
    }
    log(`enroll complete: ${enrolled} newly enrolled, ${existing} already enrolled, ${users.length} eligible total`);

  } else if (command === 'send-due') {
    log(
      stepFilter !== null
        ? `Running send-due: sending only step ${stepFilter} to due, still-eligible invites (other steps skipped this run)`
        : 'Running send-due: sending the next queued email to every due, still-eligible invite'
    );
    const now = new Date();
    const dueFilter = {
      campaignId,
      nextStep: stepFilter !== null ? stepFilter : { $lt: campaign.sequence.length },
      nextEmailDueAt: { $lte: now },
      unsubscribedAt: { $exists: false },
    };
    const invites = await companion
      .collection('emailCampaignInvites')
      .find(dueFilter)
      .sort({ nextEmailDueAt: 1 })
      .limit(campaign.maxEmailsPerRun)
      .toArray();
    log(`Found ${invites.length} due invite(s) (maxEmailsPerRun ${campaign.maxEmailsPerRun})`);

    let sent = 0;
    let skippedIneligible = 0;
    let skippedNoStep = 0;
    let skippedFailed = 0;
    for (const [i, invite] of invites.entries()) {
      const remaining = invites.length - (i + 1);
      const progress = `${i + 1}/${invites.length}, ${sent} sent so far, ${remaining} remaining after this`;
      const email = campaign.sequence.find((item) => item.step === invite.nextStep);
      if (!email) {
        log(`[${progress}] Skipping ${invite.userName} <${invite.userEmail}>: no sequence step matches nextStep ${invite.nextStep} (sequence may have shrunk)`);
        skippedNoStep++;
        continue;
      }
      const stillEligible = await prod.collection('users').findOne({
        $and: [eligibleUserFilter(), { id: invite.userId, 'details.email': invite.userEmail }],
      });
      if (!stillEligible) {
        log(`[${progress}] ${invite.userName} <${invite.userEmail}> no longer eligible — marking unsubscribed/completed, skipping send`);
        await companion.collection('emailCampaignInvites').updateOne(
          { _id: invite._id },
          {
            $set: { unsubscribedAt: now, completedAt: now },
            $unset: { nextEmailDueAt: '' },
          }
        );
        skippedIneligible++;
        continue;
      }
      log(`[${progress}] Sending to ${invite.userName} <${invite.userEmail}> — step ${email.step}: "${email.subject}"`);
      const result = await sendEmailWithRetry(invite, email);
      if (!result.ok) {
        log(`[${progress}] FAILED (both attempts) for ${invite.userName} <${invite.userEmail}>: ${result.error} — left due for next run`);
        skippedFailed++;
        continue;
      }
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
    log(`send-due complete: ${sent} sent, ${skippedIneligible} skipped (no longer eligible), ${skippedNoStep} skipped (no matching step), ${skippedFailed} failed (still due next run), ${invites.length} due total`);

  } else {
    log(`ERROR: unknown command: ${command}`);
    throw new Error('Use one of: dry-run, test-send, enroll, send-due');
  }
} catch (err) {
  log(`ERROR: script failed (${command}): ${err?.message}`);
  if (err?.stack) console.error(err.stack);
  throw err;
} finally {
  await client.close();
  log('Done');
}
