import Mailjet from 'node-mailjet';
import contactConfig from '../../config/contact.json';
import featureRequestConfig from '../../config/feature-request.json';
import { SITE_URL } from './seo';

const LOGO_URL = `${SITE_URL}/_next/image?url=%2Flogo-wide.png&w=2048&q=75`;

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

/**
 * Shared premium shell for every transactional email — same visual language as
 * sendMarketingCampaignEmail's template (warm off-white canvas, gold eyebrow badge, red gradient
 * CTA, subtle card shadow) so a recipient never sees a plain-text-looking email from this app.
 * `badge` is the small pill above the headline (e.g. "Appointment confirmed"); `rows` renders an
 * optional key/value summary table (e.g. Appointment ID, Employee, Expiry date).
 */
function renderEmailShell(params: {
  subject: string;
  badge: string;
  eyebrow: string;
  headline: string;
  greeting: string;
  paragraphs: string[];
  rows?: { label: string; value: string }[];
  cta?: { label: string; url: string };
  signOff?: string;
}) {
  const paragraphs = params.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;color:#3f3a33;line-height:1.7;font-size:15px;">${p}</p>`
    )
    .join('');

  const rows = (params.rows || [])
    .map(
      (row) => `
        <tr>
          <td style="padding:10px 14px;color:#8a857a;font-size:12.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #f0ead9;white-space:nowrap;">${escapeHtml(row.label)}</td>
          <td style="padding:10px 14px;color:#1c1a16;font-size:14px;font-weight:600;border-bottom:1px solid #f0ead9;text-align:right;">${row.value}</td>
        </tr>`
    )
    .join('');

  const rowsTable = rows
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 22px;background:#fbf8f2;border:1px solid #ecdfc2;border-radius:12px;overflow:hidden;">${rows}</table>`
    : '';

  const cta = params.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px auto 8px;">
        <tr>
          <td style="border-radius:999px;background:linear-gradient(180deg,#d1264a,#b8102f);box-shadow:0 6px 16px rgba(196,18,48,0.25);">
            <a href="${params.cta.url}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14.5px;border-radius:999px;">
              ${escapeHtml(params.cta.label)}
            </a>
          </td>
        </tr>
      </table>`
    : '';

  return `<!doctype html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <title>${escapeHtml(params.subject)}</title>
    </head>
    <body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:32px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 1px 3px rgba(20,16,8,0.06);border:1px solid #ece6d8;">
              <tr>
                <td style="padding:30px 32px 22px;text-align:center;background:#ffffff;border-bottom:1px solid #f0ead9;">
                  <img src="${LOGO_URL}" width="200" alt="ClinicPlus Booking Companion" style="display:inline-block;max-width:200px;width:60%;height:auto;" />
                </td>
              </tr>
              <tr>
                <td style="padding:8px 32px 0;text-align:center;">
                  <span style="display:inline-block;margin-top:20px;padding:6px 14px;border-radius:999px;background:#fbf3e0;border:1px solid #e9d6a3;color:#8a6a1f;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">
                    ${escapeHtml(params.badge)}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 32px 4px;">
                  <p style="margin:0 0 10px;color:#c41230;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-align:center;">
                    ${escapeHtml(params.eyebrow)}
                  </p>
                  <h1 style="margin:0 0 20px;color:#1c1a16;font-size:24px;line-height:1.3;font-weight:700;text-align:center;">
                    ${escapeHtml(params.headline)}
                  </h1>
                  <p style="margin:0 0 16px;color:#3f3a33;line-height:1.7;font-size:15px;">${escapeHtml(params.greeting)}</p>
                  ${paragraphs}
                  ${rowsTable}
                  ${cta}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 32px 30px;">
                  <p style="margin:0 0 4px;color:#4a453c;font-size:13.5px;line-height:1.6;">
                    ${escapeHtml(params.signOff || 'Thanks,')}<br />
                    <strong style="color:#1c1a16;">The ClinicPlus Booking Companion Team</strong>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 32px 26px;background:#faf8f3;border-top:1px solid #f0ead9;">
                  <p style="margin:0;color:#8a857a;font-size:11.5px;line-height:1.6;">
                    ClinicPlus Booking Companion is a standalone product built and operated by
                    Namoota Technology (Pty) Ltd for ClinicPlus clients.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}

export async function sendNewAppointmentEmail(
  user: { details: { name: string; surname: string; email: string } },
  appointment: { id: string }
) {
  const websiteUrl = process.env.CLINICPLUS_WEBSITE_URL;
  const appointmentUrl = `${websiteUrl}/appointment/${appointment.id}`;
  const html = renderEmailShell({
    subject: 'Appointment Created',
    badge: 'Booking confirmed',
    eyebrow: 'New appointment',
    headline: 'Your appointment has been created',
    greeting: `Hi ${escapeHtml(user.details.name)},`,
    paragraphs: [
      'Your appointment has been successfully created on the ClinicPlus system. You can view its full details, tracking, and status at any time using the link below.',
    ],
    rows: [{ label: 'Appointment ID', value: escapeHtml(appointment.id) }],
    cta: { label: 'View appointment', url: appointmentUrl },
  });
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
  const appointmentUrl = `${adminUrl}/appointment/${appointment.id}`;
  const html = renderEmailShell({
    subject: 'Appointment Created',
    badge: 'Internal notification',
    eyebrow: 'New appointment',
    headline: 'A new appointment has been placed',
    greeting: 'Hi ClinicPlus,',
    paragraphs: [
      'A new appointment has been placed on the system. Review it using the link below.',
    ],
    rows: [{ label: 'Appointment ID', value: escapeHtml(appointment.id) }],
    cta: { label: 'View appointment', url: appointmentUrl },
    signOff: 'Thanks,',
  });
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
  const html = renderEmailShell({
    subject: 'Compliance alert: a medical is expiring soon',
    badge: 'Compliance alert',
    eyebrow: 'Renewal due',
    headline: 'A medical on your roster is expiring soon',
    greeting: `Hi ${escapeHtml(user.details.name)},`,
    paragraphs: [
      'An employee on your ClinicPlus Companion roster has a medical or service due for renewal soon. Log in to view compliance status and book a renewal appointment.',
    ],
    rows: [
      { label: 'Employee', value: escapeHtml(entry.employeeName) },
      { label: 'Service', value: escapeHtml(entry.serviceId) },
      { label: 'Expires', value: escapeHtml(entry.expiryDate) },
    ],
    cta: { label: 'Log in to Companion', url: `${SITE_URL}/login` },
  });
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
  const html = renderEmailShell({
    subject: 'Company Registered',
    badge: 'Registration confirmed',
    eyebrow: 'New company',
    headline: `${company.details.name} has been registered`,
    greeting: 'Hi there,',
    paragraphs: [
      `${escapeHtml(company.details.name)} has been successfully registered on the ClinicPlus system. Log in below to get started.`,
    ],
    cta: { label: 'Log in', url: `${websiteUrl}/login` },
  });
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
  const html = renderEmailShell({
    subject: 'New Company Registered',
    badge: 'Internal notification',
    eyebrow: 'New company',
    headline: 'A new company has been registered',
    greeting: 'Hi ClinicPlus,',
    paragraphs: [
      `Company: ${escapeHtml(company.details.name)} has been successfully registered on the ClinicPlus system.`,
    ],
    cta: { label: 'Log in', url: `${adminUrl}/login` },
    signOff: 'Thanks,',
  });
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
  const description = escapeHtml(params.description).replaceAll('\n', '<br/>');
  const impact = params.impact ? escapeHtml(params.impact).replaceAll('\n', '<br/>') : '';
  const html = renderEmailShell({
    subject: `${emailConfig.subjectPrefix} ${params.title}`,
    badge: 'Feature request',
    eyebrow: 'Product feedback',
    headline: escapeHtml(params.title),
    greeting: `Hi ${escapeHtml(emailConfig.greetingName)},`,
    paragraphs: [
      escapeHtml(emailConfig.intro),
      `<strong style="color:#1c1a16;">Description</strong><br/>${description}`,
      ...(impact ? [`<strong style="color:#1c1a16;">Impact</strong><br/>${impact}`] : []),
    ],
    rows: [
      { label: 'From', value: escapeHtml(params.userName) },
      { label: 'Email', value: escapeHtml(params.userEmail) },
    ],
    signOff: 'Thanks,',
  });

  await sendMailjetEmail({
    from: FROM_IT,
    to: [{ Email: emailConfig.recipientEmail, Name: emailConfig.recipientName }],
    subject: `${emailConfig.subjectPrefix} ${params.title}`,
    html,
    customId: emailConfig.customId,
  });
}

export async function sendSupportTicketCreatedEmail(params: {
  category: string;
  message: string;
  submittedByName: string;
  submittedByEmail?: string | null;
  ticketId: string;
}) {
  const html = renderEmailShell({
    subject: `ClinicPlus support ticket: ${params.category}`,
    badge: 'Support ticket',
    eyebrow: 'Admin support',
    headline: `New ${params.category} from ${params.submittedByName}`,
    greeting: 'Hi Aya,',
    paragraphs: [
      `<strong style="color:#1c1a16;">Message</strong><br/>${escapeHtml(params.message).replaceAll('\n', '<br/>')}`,
    ],
    rows: [
      { label: 'Ticket ID', value: escapeHtml(params.ticketId) },
      { label: 'Submitted by', value: escapeHtml(params.submittedByName) },
      ...(params.submittedByEmail ? [{ label: 'Email', value: escapeHtml(params.submittedByEmail) }] : []),
      { label: 'Category', value: escapeHtml(params.category) },
    ],
    signOff: 'Thanks,',
  });

  await sendMailjetEmail({
    from: FROM_IT,
    to: [{ Email: 'aya@qwabi.co.za', Name: 'Aya' }],
    subject: `ClinicPlus support ticket: ${params.category}`,
    html,
    customId: 'AdminSupportTicket',
  });
}

export async function sendSupportTicketResponseEmail(params: {
  toEmail: string;
  toName: string;
  ticketId: string;
  response: string;
  status: string;
}) {
  const html = renderEmailShell({
    subject: `Support ticket update: ${params.ticketId}`,
    badge: 'Support update',
    eyebrow: 'Admin support',
    headline: 'Your support ticket has been updated',
    greeting: `Hi ${escapeHtml(params.toName)},`,
    paragraphs: [
      `<strong style="color:#1c1a16;">Response</strong><br/>${escapeHtml(params.response).replaceAll('\n', '<br/>')}`,
    ],
    rows: [
      { label: 'Ticket ID', value: escapeHtml(params.ticketId) },
      { label: 'Status', value: escapeHtml(params.status) },
    ],
  });

  await sendMailjetEmail({
    from: FROM_IT,
    to: [{ Email: params.toEmail, Name: params.toName }],
    subject: `Support ticket update: ${params.ticketId}`,
    html,
    customId: 'AdminSupportTicketResponse',
  });
}

/**
 * Sent from POST /api/admin/invoices right after a quote/invoice PDF is generated and recorded —
 * see that route's docblock for why this repo sends the email itself rather than assuming the
 * legacy SEND_INVOICE handler already does (unverified, so this is a safety default, not a
 * guaranteed non-duplicate). `to` accepts multiple recipients since a company invoice can be
 * emailed to more than one address (emailedTo[] on the Invoice document).
 */
export async function sendInvoiceEmail(params: {
  to: EmailRecipient[];
  companyName: string;
  invoiceId: string;
  amount: number;
  pdfUrl: string;
}) {
  const formattedAmount = `R ${params.amount.toFixed(2)}`;
  const html = renderEmailShell({
    subject: `Invoice ${params.invoiceId}`,
    badge: 'Invoice sent',
    eyebrow: 'ClinicPlus invoice',
    headline: `Your invoice for ${escapeHtml(params.companyName)}`,
    greeting: 'Hi there,',
    paragraphs: [
      'Please find your ClinicPlus invoice attached/linked below. If you have any questions about this invoice, please get in touch.',
    ],
    rows: [
      { label: 'Invoice Number', value: escapeHtml(params.invoiceId) },
      { label: 'Company', value: escapeHtml(params.companyName) },
      { label: 'Amount', value: escapeHtml(formattedAmount) },
    ],
    cta: { label: 'View invoice PDF', url: params.pdfUrl },
  });
  await sendMailjetEmail({
    from: FROM,
    to: params.to,
    subject: `Invoice ${params.invoiceId}`,
    html,
    customId: 'Invoice',
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
