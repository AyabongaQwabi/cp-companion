import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { calculateBookingPrice } from '@/lib/pricing';
import { sendInvoiceEmail } from '@/lib/mailjet';
import type { AppointmentDocument, Invoice } from '@/lib/types';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

const PAGE_SIZE = 25;

/**
 * Lists cp_companion.invoices for the admin Invoices page (src/views/invoices/index.js in
 * cp-redesign-admin), replacing that page's old GET_ALL_INVOICES / GET_NEXT_PAGE_INVOICES /
 * SEARCH_INVOICE socket calls against the legacy server. Pagination shape matches
 * admin/employees/route.ts exactly (0-indexed page, PAGE_SIZE=25, { page, pageCount, totalCount }).
 *
 * Filters: company/client are case-insensitive substring matches (denormalized companyName /
 * clientName fields on the Invoice doc itself, so this never has to join back to
 * production.appointments or production.users just to render a list row). Date range filters on
 * sentAt. Amount range filters on amount.
 */
export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;
  const company = (params.get('company') || '').trim();
  const client = (params.get('client') || '').trim();
  const dateFrom = params.get('dateFrom');
  const dateTo = params.get('dateTo');
  const amountMin = params.get('amountMin');
  const amountMax = params.get('amountMax');
  const page = Math.max(0, parseInt(params.get('page') || '0', 10) || 0);

  try {
    const companionDb = await getCompanionDb();
    const invoices = companionDb.collection<Invoice>('invoices');

    const filter: Record<string, unknown> = {};
    if (company) filter.companyName = { $regex: company, $options: 'i' };
    if (client) filter.clientName = { $regex: client, $options: 'i' };

    if (dateFrom || dateTo) {
      const sentAt: Record<string, Date> = {};
      if (dateFrom) sentAt.$gte = new Date(dateFrom);
      if (dateTo) sentAt.$lte = new Date(dateTo);
      filter.sentAt = sentAt;
    }

    if (amountMin || amountMax) {
      const amount: Record<string, number> = {};
      if (amountMin) amount.$gte = parseFloat(amountMin);
      if (amountMax) amount.$lte = parseFloat(amountMax);
      filter.amount = amount;
    }

    const [totalCount, rows] = await Promise.all([
      invoices.countDocuments(filter),
      invoices
        .find(filter)
        .sort({ sentAt: -1 })
        .skip(page * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .toArray(),
    ]);

    return withAdminStatsCors(
      NextResponse.json({
        invoices: rows.map((row) => ({ ...row, _id: String(row._id) })),
        page,
        pageCount: Math.ceil(totalCount / PAGE_SIZE),
        totalCount,
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}

interface RecordInvoiceBody {
  appointmentId: string;
  invoiceId: string;
  pdfUrl: string;
  // Optional — AppointmentDocument.usersWhoCanEdit only carries { id, name }, no email, so neither
  // frontend can reliably supply this itself. When omitted (or empty), this route resolves it
  // server-side from production.users via usersWhoCanEdit[0].id, since that's the only place a
  // real email address for "the client" lives. Callers MAY still pass explicit addresses (e.g. an
  // admin manually cc'ing someone) and those are unioned with the resolved client email.
  emailedTo?: string[];
  actorId?: string | null;
  actorName?: string | null;
}

/**
 * Records a sent invoice into cp_companion.invoices and emails the client via Mailjet
 * (sendInvoiceEmail, src/lib/mailjet.ts). Called by both cp-redesign's and cp-redesign-admin's
 * quote pages right after their existing SEND_INVOICE socket emit + PDF upload succeeds — this
 * endpoint does NOT replace SEND_INVOICE (left untouched, still emitted by both frontends; other
 * parts of the ecosystem may still read from the legacy invoices collection it writes to), it just
 * gives the ecosystem a second, authoritative record that isn't subject to the legacy round-trip's
 * per-mount fresh-uuid bug.
 *
 * Assumption (documented per task): it could not be verified, without reading the legacy
 * clinicplus-server-latest-stable-version repo (out of scope for this change), whether the legacy
 * SEND_INVOICE handler already emails the client itself. This endpoint sends the email regardless,
 * as a safety default — neither frontend should depend on SEND_INVOICE for anything going forward,
 * including whether the client actually receives an email.
 *
 * amount + servicesBreakdown are recomputed server-side here via calculateBookingPrice() (not
 * trusted from the request body) so a stale/tampered client-side amount can never be persisted —
 * the client only supplies pdfUrl/emailedTo/actor info, everything price-related is authoritative
 * from this repo's own pricing.ts, exactly like GET .../compute.
 */
export async function POST(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const body: RecordInvoiceBody = await req.json();
  const { appointmentId, invoiceId, pdfUrl } = body;
  const explicitEmailedTo = Array.isArray(body.emailedTo) ? body.emailedTo.filter(Boolean) : [];

  if (!appointmentId || !invoiceId || !pdfUrl) {
    return withAdminStatsCors(
      NextResponse.json({ error: 'appointmentId, invoiceId, and pdfUrl are required' }, { status: 400 })
    );
  }

  try {
    const prodDb = await getProductionDb();
    const appointment = await prodDb
      .collection<AppointmentDocument>('appointments')
      .findOne({ id: appointmentId });

    if (!appointment) {
      return withAdminStatsCors(NextResponse.json({ error: 'Appointment not found' }, { status: 404 }));
    }

    const employees = appointment.details?.employees || [];
    const client = appointment.usersWhoCanEdit?.[0] || null;

    // usersWhoCanEdit only carries { id, name } — resolve the client's real email from
    // production.users (see RecordInvoiceBody docblock above) rather than trusting the frontend
    // to have one, since neither quote page has access to it either.
    let clientEmail: string | null = null;
    if (client?.id) {
      const clientUser = await prodDb.collection('users').findOne({ id: client.id });
      clientEmail = clientUser?.details?.email || null;
    }

    const emailedTo = Array.from(new Set([...(clientEmail ? [clientEmail] : []), ...explicitEmailedTo]));
    if (emailedTo.length === 0) {
      return withAdminStatsCors(
        NextResponse.json(
          { error: 'Could not resolve a client email and none was provided in emailedTo' },
          { status: 422 }
        )
      );
    }

    let amount: number;
    try {
      amount = calculateBookingPrice(employees);
    } catch (computeErr) {
      console.error('[admin/invoices POST] pricing computation failed', computeErr);
      return withAdminStatsCors(
        NextResponse.json({ error: 'Failed to compute invoice amount' }, { status: 500 })
      );
    }

    const { MEDICAL_SERVICES, DOVER_PRICE, XRAYS_PRICE } = await import('@/lib/clinicplus-constants');
    const allServices = employees.flatMap((e) => e.services || []).filter((s) => s.id !== 'vienna-test');
    const serviceLines = Object.values(MEDICAL_SERVICES)
      .map((service) => {
        const matching = allServices.filter((s) => s.id === service.id);
        return {
          serviceId: service.id,
          title: service.title,
          count: matching.length,
          subtotal: matching.reduce((acc, s) => acc + s.price, 0),
        };
      })
      .filter((line) => line.count > 0);
    const servicesSubtotal = serviceLines.reduce((acc, line) => acc + line.subtotal, 0);
    const doverEmployeeCount = employees.filter((e) => e.dover?.required).length;
    const xrayEmployeeCount = employees.filter((e) => e.xray?.required).length;
    const doverSubtotal = doverEmployeeCount * DOVER_PRICE;
    const xraySubtotal = xrayEmployeeCount * XRAYS_PRICE;

    const doc: Invoice = {
      invoiceId,
      appointmentId,
      companyId: appointment.details?.company?.id || '',
      companyName: appointment.details?.company?.name || '',
      clientUserId: client?.id || null,
      clientName: client?.name || null,
      clientEmail: clientEmail,
      amount,
      servicesBreakdown: {
        services: serviceLines,
        servicesSubtotal,
        doverEmployeeCount,
        doverSubtotal,
        xrayEmployeeCount,
        xraySubtotal,
        grandTotal: amount,
      },
      pdfUrl,
      sentAt: new Date(),
      sentByActorId: body.actorId ?? null,
      sentByActorName: body.actorName ?? null,
      emailedTo,
    };

    const companionDb = await getCompanionDb();
    const result = await companionDb.collection<Invoice>('invoices').insertOne(doc);

    // Email failures are logged but never fail the request — the invoice record itself is already
    // durably saved above, and the caller (quote page) has already generated/uploaded the PDF and
    // shown the user a success state via SEND_INVOICE; losing the confirmation email shouldn't
    // roll any of that back or block the UI.
    try {
      await sendInvoiceEmail({
        to: emailedTo.map((email) => ({ Email: email, Name: doc.clientName || doc.companyName })),
        companyName: doc.companyName,
        invoiceId,
        amount,
        pdfUrl,
      });
    } catch (emailErr) {
      console.error('[admin/invoices POST] sendInvoiceEmail failed', emailErr);
    }

    return withAdminStatsCors(
      NextResponse.json({ ok: true, invoice: { ...doc, _id: String(result.insertedId) } })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
