import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { logAuditEvent } from '@/lib/audit';
import { sendSupportTicketResponseEmail } from '@/lib/mailjet';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const { id } = await params;
  try {
    const body = await req.json();
    const response = String(body.response || '').trim();
    const status = String(body.status || 'open').trim();
    if (!response && !status) {
      return withAdminStatsCors(NextResponse.json({ error: 'response or status is required' }, { status: 400 }));
    }

    const companionDb = await getCompanionDb();
    const tickets = companionDb.collection('supportTickets');
    const ticket = await tickets.findOne({ id });
    if (!ticket) {
      return withAdminStatsCors(NextResponse.json({ error: 'Ticket not found' }, { status: 404 }));
    }

    const responseDoc = response
      ? {
          id: crypto.randomUUID(),
          message: response,
          responderId: body.actorId || null,
          responderName: body.actorName || 'Support',
          createdAt: new Date(),
        }
      : null;

    const update: Record<string, unknown> = { $set: { status, updatedAt: new Date() } };
    if (responseDoc) update.$push = { responses: responseDoc };
    await tickets.updateOne({ id }, update);

    await logAuditEvent({
      entityType: 'support_ticket',
      entityId: id,
      action: 'updated',
      actorType: 'admin',
      actorId: body.actorId || null,
      actorName: body.actorName || null,
      source: 'cp-redesign-admin',
      changes: [{ field: 'status', before: ticket.status, after: status }],
      metadata: responseDoc ? { responseId: responseDoc.id } : {},
    });

    if (responseDoc && ticket.submittedByEmail) {
      try {
        await sendSupportTicketResponseEmail({
          toEmail: ticket.submittedByEmail,
          toName: ticket.submittedByName || 'there',
          ticketId: id,
          response,
          status,
        });
      } catch (emailErr) {
        console.error('[support-tickets] failed to email submitter', emailErr);
      }
    }

    const updated = await tickets.findOne({ id });
    return withAdminStatsCors(NextResponse.json({ ticket: updated }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
