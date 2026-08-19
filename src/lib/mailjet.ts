import Mailjet from 'node-mailjet';
import contactConfig from '../../config/contact.json';
import featureRequestConfig from '../../config/feature-request.json';

/**
 * Mirrors clinicplus-server-latest-stable-version/lib/externalApi/mailjet.js and the two
 * appointment-creation email templates from lib/data/save/index.js (sendNewAppointmentEmail,
 * sendNewAppointmentEmailInternal). Unlike the source file, credentials come from env vars —
 * the source repo hardcodes its Mailjet API key/secret in source, which is a pre-existing
 * exposure in that repo, not something to replicate here.
 */

const apiKey = process.env.MAILJET_API_KEY;
const apiSecret = process.env.MAILJET_API_SECRET;

function getClient() {
  if (!apiKey || !apiSecret) {
    throw new Error('MAILJET_API_KEY / MAILJET_API_SECRET not set');
  }
  return Mailjet.apiConnect(apiKey, apiSecret);
}

interface EmailRecipient {
  Email: string;
  Name: string;
}

async function sendMailjetEmail(params: {
  from: EmailRecipient;
  to: EmailRecipient[];
  subject: string;
  html: string;
  customId: string;
}) {
  const mailjet = getClient();
  await mailjet.post('send', { version: 'v3.1' }).request({
    Messages: [
      {
        From: params.from,
        To: params.to,
        Subject: params.subject,
        TextPart: '',
        HTMLPart: params.html,
        CustomID: params.customId,
      },
    ],
  });
}

const FROM = { Email: contactConfig.supportEmail, Name: contactConfig.senderName };
const FROM_IT = { Email: contactConfig.supportEmail, Name: contactConfig.itSenderName };

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendNewAppointmentEmail(
  user: { details: { name: string; surname: string; email: string } },
  appointment: { id: string }
) {
  const websiteUrl = process.env.CLINICPLUS_WEBSITE_URL;
  const html = `<p>Hi there,</p>
  <p>You have succesfully created a new appointment on the ClinicPplus system.</p>
  <p>Please click the link below to view it</p>
  <p><a href="${websiteUrl}/appointment/${appointment.id}">${websiteUrl}/appointment/${appointment.id}</a></p>
  <p>Thanks,</p>
  <p>The ClinicPlus Booking Companion Team</p>`;
  await sendMailjetEmail({
    from: FROM,
    to: [{ Email: user.details.email, Name: `${user.details.name} ${user.details.surname}` }],
    subject: 'Appointment Created',
    html,
    customId: 'NewAppointment',
  });
}

export async function sendNewAppointmentEmailInternal(appointment: { id: string }) {
  const adminUrl = process.env.CLINICPLUS_ADMIN_WEBSITE_URL;
  const notifEmail = process.env.CLINICPLUS_NOTIF_EMAIL;
  if (!notifEmail) {
    throw new Error('CLINICPLUS_NOTIF_EMAIL not set');
  }
  const html = `<p>Hi ClinicPlus,</p>
  <p>A new appointment has been placed on the system. Appointment ID: ${appointment.id}</p>
  <p>Please click the link below to view it</p>
  <p><a href="${adminUrl}/appointment/${appointment.id}">${adminUrl}/appointment/${appointment.id}</a></p>
  <br/>
  <p>Thanks,</p>
  <p><small>Tecla Digital &amp; Midas Touch Technologies</small></p>`;
  await sendMailjetEmail({
    from: FROM_IT,
    to: [{ Email: notifEmail, Name: 'Bookings Department' }],
    subject: 'Appointment Created',
    html,
    customId: 'NewAppointment',
  });
}

export async function sendComplianceAlertEmail(
  user: { details: { name: string; surname: string; email: string } },
  entry: { employeeName: string; serviceId: string; expiryDate: string }
) {
  const html = `<p>Hi ${escapeHtml(user.details.name)},</p>
  <p>An employee on your ClinicPlus Companion roster has a medical/service due for renewal soon.</p>
  <p><strong>${escapeHtml(entry.employeeName)}</strong> — ${escapeHtml(entry.serviceId)} expires on ${escapeHtml(entry.expiryDate)}.</p>
  <p>Log in to ClinicPlus Companion to view compliance status and book a renewal appointment.</p>
  <p>Thanks,</p>
  <p>The ClinicPlus Booking Companion Team</p>`;
  await sendMailjetEmail({
    from: FROM,
    to: [{ Email: user.details.email, Name: `${user.details.name} ${user.details.surname}` }],
    subject: 'Compliance alert: a medical is expiring soon',
    html,
    customId: 'ComplianceAlert',
  });
}

export async function sendNewCompanyEmail(
  user: { details: { name: string; surname: string; email: string } },
  company: { details: { name: string } }
) {
  const websiteUrl = process.env.CLINICPLUS_WEBSITE_URL;
  const html = `<p>Hi there,</p>
  <p>You have succesfully registered ${company.details.name} on the ClinicPplus system.</p>
  <p>Please click the link below to login</p>
  <p><a href="${websiteUrl}/login">${websiteUrl}/login</a></p>
  <p>Thanks,</p>
  <p>The ClinicPlus Booking Companion Team</p>`;
  await sendMailjetEmail({
    from: FROM,
    to: [{ Email: user.details.email, Name: `${user.details.name} ${user.details.surname}` }],
    subject: 'Company Registered',
    html,
    customId: 'NewCompany',
  });
}

export async function sendNewCompanyEmailInternal(company: { details: { name: string } }) {
  const adminUrl = process.env.CLINICPLUS_ADMIN_WEBSITE_URL;
  const notifEmail = process.env.CLINICPLUS_NOTIF_EMAIL;
  if (!notifEmail) {
    throw new Error('CLINICPLUS_NOTIF_EMAIL not set');
  }
  const html = `<p>Hi ClinicPlus,</p>
  <p>Company: ${company.details.name} has been successfully registered on the ClinicPplus system.</p>
  <p>Please click the link below to login</p>
  <p><a href="${adminUrl}/login">${adminUrl}/login</a></p>
  <p>Thanks,</p>
  <p>Tecla Digital &amp; Midas Touch Technologies</p>`;
  await sendMailjetEmail({
    from: FROM_IT,
    to: [{ Email: notifEmail, Name: 'Bookings Department' }],
    subject: 'New Company Registered',
    html,
    customId: 'NewCompanyInternal',
  });
}

export async function sendFeatureRequestEmail(params: {
  userName: string;
  userEmail: string;
  title: string;
  description: string;
  impact?: string;
}) {
  const emailConfig = featureRequestConfig.email;
  const title = escapeHtml(params.title);
  const description = escapeHtml(params.description).replaceAll('\n', '<br/>');
  const impact = params.impact ? escapeHtml(params.impact).replaceAll('\n', '<br/>') : '';
  const userName = escapeHtml(params.userName);
  const userEmail = escapeHtml(params.userEmail);
  const html = `<p>Hi ${escapeHtml(emailConfig.greetingName)},</p>
  <p>${escapeHtml(emailConfig.intro)}</p>
  <p><strong>User:</strong> ${userName} (${userEmail})</p>
  <p><strong>Feature:</strong> ${title}</p>
  <p><strong>Description:</strong><br/>${description}</p>
  ${impact ? `<p><strong>Impact:</strong><br/>${impact}</p>` : ''}
  <p>Thanks,</p>
  <p>${escapeHtml(emailConfig.teamName)}</p>`;

  await sendMailjetEmail({
    from: FROM_IT,
    to: [{ Email: emailConfig.recipientEmail, Name: emailConfig.recipientName }],
    subject: `${emailConfig.subjectPrefix} ${params.title}`,
    html,
    customId: emailConfig.customId,
  });
}

export async function sendMarketingCampaignEmail(params: {
  to: EmailRecipient;
  logoUrl: string;
  inviteUrl: string;
  unsubscribeUrl: string;
  recipientName: string;
  campaignName: string;
  email: {
    step: number;
    subject: string;
    preview: string;
    headline: string;
    eyebrow: string;
    intro: string;
    body: string[];
    bullets: string[];
    featureGrid?: { title: string; description: string }[];
    cta: string;
    footNote?: string;
  };
}) {
  const recipientName = escapeHtml(params.recipientName.split(' ')[0] || params.recipientName);
  const body = params.email.body
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;color:#3f3a33;line-height:1.7;font-size:15px;">${escapeHtml(paragraph)}</p>`
    )
    .join('');
  const bullets = params.email.bullets
    .map(
      (item) =>
        `<tr>
          <td width="22" valign="top" style="padding:0 0 12px;">
            <span style="display:inline-block;width:6px;height:6px;margin-top:8px;border-radius:999px;background:#c41230;"></span>
          </td>
          <td valign="top" style="padding:0 0 12px;color:#3f3a33;line-height:1.55;font-size:14.5px;">${escapeHtml(item)}</td>
        </tr>`
    )
    .join('');

  const featureGrid = (params.email.featureGrid || [])
    .map(
      (feature, i) => `
        <tr>
          <td style="padding:${i === 0 ? '0' : '14px'} 0 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf8f2;border:1px solid #ecdfc2;border-radius:12px;">
              <tr>
                <td style="padding:16px 18px;">
                  <p style="margin:0 0 4px;color:#8a6a1f;font-size:13.5px;font-weight:700;">${escapeHtml(feature.title)}</p>
                  <p style="margin:0;color:#5b5548;font-size:13.5px;line-height:1.55;">${escapeHtml(feature.description)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    )
    .join('');

  const html = `<!doctype html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <title>${escapeHtml(params.email.subject)}</title>
    </head>
    <body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">
        ${escapeHtml(params.email.preview)}
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:32px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 1px 3px rgba(20,16,8,0.06);border:1px solid #ece6d8;">
              <tr>
                <td style="padding:30px 32px 22px;text-align:center;background:#ffffff;border-bottom:1px solid #f0ead9;">
                  <img src="${params.logoUrl}" width="200" alt="ClinicPlus Booking Companion" style="display:inline-block;max-width:200px;width:60%;height:auto;" />
                </td>
              </tr>
              <tr>
                <td style="padding:8px 32px 0;text-align:center;">
                  <span style="display:inline-block;margin-top:20px;padding:6px 14px;border-radius:999px;background:#fbf3e0;border:1px solid #e9d6a3;color:#8a6a1f;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">
                    Credit-based power-user tool &middot; not a free app
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 32px 4px;">
                  <p style="margin:0 0 10px;color:#c41230;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-align:center;">
                    ${escapeHtml(params.email.eyebrow)}
                  </p>
                  <h1 style="margin:0 0 20px;color:#1c1a16;font-size:26px;line-height:1.25;font-weight:700;text-align:center;">
                    ${escapeHtml(params.email.headline)}
                  </h1>
                  <p style="margin:0 0 16px;color:#3f3a33;line-height:1.7;font-size:15px;">Hi ${recipientName},</p>
                  <p style="margin:0 0 16px;color:#3f3a33;line-height:1.7;font-size:15px;">${escapeHtml(params.email.intro)}</p>
                  ${body}
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 8px;">
                    ${bullets}
                  </table>
                  ${featureGrid ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 8px;">${featureGrid}</table>` : ''}
                  <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px auto 8px;">
                    <tr>
                      <td style="border-radius:999px;background:linear-gradient(180deg,#d1264a,#b8102f);box-shadow:0 6px 16px rgba(196,18,48,0.25);">
                        <a href="${params.inviteUrl}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14.5px;border-radius:999px;">
                          ${escapeHtml(params.email.cta)}
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:4px 0 4px;color:#8a857a;font-size:12.5px;line-height:1.6;text-align:center;">
                    Log in with your existing ClinicPlus account &mdash; Companion is optional and never replaces the ClinicPlus bookings website.
                  </p>
                  ${
                    params.email.footNote
                      ? `<p style="margin:18px 0 0;padding:14px 16px;background:#fbf8f2;border-left:3px solid #d6b25e;border-radius:8px;color:#5b5548;font-size:13px;line-height:1.6;">${escapeHtml(params.email.footNote)}</p>`
                      : ''
                  }
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
                    <a href="${params.unsubscribeUrl}" style="color:#c41230;text-decoration:underline;">Unsubscribe here</a>.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  await sendMailjetEmail({
    from: FROM,
    to: [params.to],
    subject: params.email.subject,
    html,
    customId: `${params.campaignName}:${params.email.step}`,
  });
}
