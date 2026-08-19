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
  <p>The ClinicPlus Team</p>`;
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
  <p>The ClinicPlus Team</p>`;
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
  <p>The ClinicPlus Team</p>`;
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
    cta: string;
  };
}) {
  const recipientName = escapeHtml(params.recipientName.split(' ')[0] || params.recipientName);
  const body = params.email.body
    .map((paragraph) => `<p style="margin:0 0 16px;color:#2b2b2b;line-height:1.65;">${escapeHtml(paragraph)}</p>`)
    .join('');
  const bullets = params.email.bullets
    .map(
      (item) =>
        `<li style="margin:0 0 10px;color:#2b2b2b;line-height:1.5;"><span style="color:#b8892f;font-weight:700;">•</span> ${escapeHtml(item)}</li>`
    )
    .join('');

  const html = `<!doctype html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <title>${escapeHtml(params.email.subject)}</title>
    </head>
    <body style="margin:0;padding:0;background:#0f0f10;font-family:Arial,Helvetica,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">
        ${escapeHtml(params.email.preview)}
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f0f10;padding:28px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #d6b25e;">
              <tr>
                <td style="background:#111111;padding:26px 28px;text-align:center;">
                  <img src="${params.logoUrl}" width="220" alt="ClinicPlus Companion" style="display:inline-block;max-width:220px;width:70%;height:auto;" />
                </td>
              </tr>
              <tr>
                <td style="padding:34px 30px 8px;">
                  <p style="margin:0 0 12px;color:#b8892f;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                    ${escapeHtml(params.email.eyebrow)}
                  </p>
                  <h1 style="margin:0 0 18px;color:#111111;font-size:28px;line-height:1.18;font-weight:700;">
                    ${escapeHtml(params.email.headline)}
                  </h1>
                  <p style="margin:0 0 16px;color:#2b2b2b;line-height:1.65;">Hi ${recipientName},</p>
                  <p style="margin:0 0 16px;color:#2b2b2b;line-height:1.65;">${escapeHtml(params.email.intro)}</p>
                  ${body}
                  <ul style="margin:2px 0 22px;padding:0;list-style:none;">
                    ${bullets}
                  </ul>
                  <table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0;">
                    <tr>
                      <td style="border-radius:999px;background:#c41230;">
                        <a href="${params.inviteUrl}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-weight:700;border-radius:999px;border:1px solid #d6b25e;">
                          ${escapeHtml(params.email.cta)}
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 16px;color:#666666;font-size:13px;line-height:1.6;">
                    Use your existing ClinicPlus login. The 100-credit invite bonus is applied on first login when you enter through this email button.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 30px 30px;background:#fafafa;border-top:1px solid #eeeeee;">
                  <p style="margin:0;color:#555555;font-size:13px;line-height:1.6;">
                    Thanks,<br />
                    The ClinicPlus Team
                  </p>
                  <p style="margin:14px 0 0;color:#777777;font-size:12px;line-height:1.5;">
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
