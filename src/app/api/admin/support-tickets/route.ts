import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { logAuditEvent } from '@/lib/audit';
import { sendSupportTicketCreatedEmail } from '@/lib/mailjet';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const status = req.nextUrl.searchParams.get('status');
  const category = req.nextUrl.searchParams.get('category');
  const submittedByUserId = req.nextUrl.searchParams.get('submittedByUserId');

  try {
    const companionDb = await getCompanionDb();
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (submittedByUserId) filter.submittedByUserId = submittedByUserId;

    const tickets = await companionDb
      .collection('supportTickets')
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    return withAdminStatsCors(
      NextResponse.json({ tickets: tickets.map((ticket) => ({ ...ticket, _id: String(ticket._id) })) })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}

export async function POST(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const category = String(body.category || '').trim();
    const message = String(body.message || '').trim();
    if (!['request', 'complaint', 'suggestion'].includes(category) || !message) {
      return withAdminStatsCors(
        NextResponse.json({ error: 'category and message are required' }, { status: 400 })
      );
    }

    const prodDb = await getProductionDb();
    const submitter = body.submittedByUserId
      ? await prodDb.collection('users').findOne({ id: body.submittedByUserId })
      : null;
    const submittedByName =
      String(body.submittedByName || '').trim() ||
      `${submitter?.details?.name || ''} ${submitter?.details?.surname || ''}`.trim() ||
      'Admin';
    const submittedByEmail = body.submittedByEmail || submitter?.details?.email || null;
    const ticket = {
      id: `TKT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      category,
      message,
      submittedByUserId: body.submittedByUserId || null,
      submittedByName,
      submittedByEmail,
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date(),
      responses: [],
    };

    const companionDb = await getCompanionDb();
    await companionDb.collection('supportTickets').insertOne(ticket);
    await logAuditEvent({
      entityType: 'support_ticket',
      entityId: ticket.id,
      action: 'created',
      actorType: 'admin',
      actorId: ticket.submittedByUserId,
      actorName: submittedByName,
      source: 'cp-redesign-admin',
      metadata: { category },
    });

    try {
      await sendSupportTicketCreatedEmail({
        category,
        message,
        submittedByName,
        submittedByEmail,
        ticketId: ticket.id,
      });
    } catch (emailErr) {
      console.error('[support-tickets] failed to email Aya', emailErr);
    }

    return withAdminStatsCors(NextResponse.json({ ticket }, { status: 201 }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
