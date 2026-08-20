import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { calculateBookingPrice } from '@/lib/pricing';
import { MEDICAL_SERVICES, DOVER_PRICE, XRAYS_PRICE } from '@/lib/clinicplus-constants';
import type { AppointmentDocument, Invoice } from '@/lib/types';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

/**
 * Deterministic, idempotent invoice number derived from appointmentId (NOT crypto.randomUUID() —
 * unlike audit_events' id, this one must resolve to the exact same value every time it's derived
 * for the same appointment, including the very first call before any DB row exists, so a second
 * concurrent GET racing the first insert still agrees on the number instead of needing a lock).
 * Scheme: `INV-{year}-{6 hex chars of sha1(appointmentId)}`. {year} is the year this invoice number
 * is first generated (captured once and persisted — see findOrCreateInvoiceNumber below), not the
 * appointment date, matching how real invoice numbering is usually read.
 */
function deriveInvoiceSuffix(appointmentId: string): string {
  return createHash('sha1').update(appointmentId).digest('hex').slice(0, 6);
}

/**
 * Finds the existing cp_companion.invoices row for this appointment (if any prior compute/send
 * happened) and reuses its invoiceId verbatim. Otherwise derives a fresh one. Does NOT insert a
 * document here — compute is read-only; POST /api/admin/invoices is the only write path — so two
 * concurrent computes for an appointment with no prior invoice both derive the identical
 * deterministic invoiceId anyway (see deriveInvoiceSuffix), so there's nothing to race.
 */
async function findOrDeriveInvoiceNumber(appointmentId: string): Promise<string> {
  const companionDb = await getCompanionDb();
  const existing = await companionDb
    .collection<Invoice>('invoices')
    .findOne({ appointmentId }, { sort: { sentAt: -1 } });
  if (existing?.invoiceId) return existing.invoiceId;

  const year = new Date().getFullYear();
  return `INV-${year}-${deriveInvoiceSuffix(appointmentId)}`;
}

/**
 * Computes the authoritative amount/subtotal breakdown for an appointment's invoice/quote, always
 * via calculateBookingPrice() (src/lib/pricing.ts) — the same formula the anomaly-watchdog uses to
 * flag legacy payment.amount drift — so the number shown on the quote PDF and the number persisted
 * by POST /api/admin/invoices can never diverge from each other or from that watchdog's baseline.
 *
 * This intentionally does NOT write to cp_companion.invoices — it's a pure read/compute endpoint,
 * called on every quote-page load (including re-visits of an already-sent invoice) so the
 * displayed amount always reflects calculateBookingPrice() even if pricing config changes after
 * the invoice was first sent. The persisted Invoice.amount from POST is a point-in-time record of
 * what was actually charged/sent; this endpoint is the live, always-current computation.
 */
export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const appointmentId = req.nextUrl.searchParams.get('appointmentId');
  if (!appointmentId) {
    return withAdminStatsCors(NextResponse.json({ error: 'appointmentId is required' }, { status: 400 }));
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

    // Defensive: never let a pricing computation failure (malformed employee/service data, a
    // config lookup throwing, etc) propagate into a response the client can't render safely —
    // caught here and turned into a clean 500 rather than a document/response with amount missing
    // or NaN. See Invoice's docblock in types.ts for why amount must always be a real number.
    let servicesSubtotal = 0;
    let doverSubtotal = 0;
    let xraySubtotal = 0;
    let grandTotal = 0;
    let serviceLines: { serviceId: string; title: string; count: number; subtotal: number }[] = [];
    let doverEmployeeCount = 0;
    let xrayEmployeeCount = 0;

    try {
      grandTotal = calculateBookingPrice(employees);

      const allServices = employees.flatMap((e) => e.services || []).filter((s) => s.id !== 'vienna-test');
      serviceLines = Object.values(MEDICAL_SERVICES)
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
      servicesSubtotal = serviceLines.reduce((acc, line) => acc + line.subtotal, 0);

      doverEmployeeCount = employees.filter((e) => e.dover?.required).length;
      xrayEmployeeCount = employees.filter((e) => e.xray?.required).length;
      // Re-derived directly from DOVER_PRICE/XRAYS_PRICE (not backed into grandTotal) so this
      // per-category math is legible on its own and matches calculateBookingPrice()'s own logic
      // line-for-line rather than reverse-engineering a split from the single summed total.
      doverSubtotal = doverEmployeeCount * DOVER_PRICE;
      xraySubtotal = xrayEmployeeCount * XRAYS_PRICE;
    } catch (computeErr) {
      console.error('[admin/invoices/compute] pricing computation failed', computeErr);
      return withAdminStatsCors(
        NextResponse.json({ error: 'Failed to compute invoice amount' }, { status: 500 })
      );
    }

    const invoiceId = await findOrDeriveInvoiceNumber(appointmentId);

    const servicesBreakdown = {
      services: serviceLines,
      servicesSubtotal,
      doverEmployeeCount,
      doverSubtotal,
      xrayEmployeeCount,
      xraySubtotal,
      grandTotal,
    };

    return withAdminStatsCors(
      NextResponse.json({
        appointmentId,
        invoiceId,
        amount: grandTotal,
        servicesBreakdown,
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
