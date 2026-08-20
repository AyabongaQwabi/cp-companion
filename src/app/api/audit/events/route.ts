import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { ensureAuditIndexes } from '@/lib/audit';
import { withAdminStatsCors, adminStatsCorsPreflight, checkAdminStatsSecret } from '@/lib/admin-stats-cors';
import type { AuditEvent, AuditEntityType, AuditActorType } from '@/lib/types';

const VALID_ENTITY_TYPES: AuditEntityType[] = [
  'appointment',
  'user',
  'company',
  'platform_control',
  'support_ticket',
];
const VALID_ACTOR_TYPES: AuditActorType[] = ['user', 'admin', 'system'];
const VALID_SOURCES: AuditEvent['source'][] = ['cp-redesign', 'cp-redesign-admin', 'legacy-import', 'system'];

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

/**
 * POST /api/audit/events — the single write entry point for the new centralized audit-event
 * system (cp_companion.audit_events, see the AuditEvent block in src/lib/types.ts). Called
 * cross-origin from cp-redesign and cp-redesign-admin (both separately deployed apps), so it
 * reuses the same CORS helper as /api/admin/* (src/lib/admin-stats-cors.ts) rather than inventing
 * a second CORS scheme.
 *
 * Auth/trust model — deliberately asymmetric with /api/admin/*:
 * This endpoint does NOT require x-admin-stats-secret. cp-redesign and cp-redesign-admin have no
 * server-verified session to forward (same situation documented on ADMIN_STATS_SECRET and on
 * every existing route in this app that accepts a client-supplied `userId` query param, e.g.
 * appointments/route.ts, employees/route.ts) — this app already trusts client-supplied actor
 * identity throughout its entire API surface, so requiring a secret here just to log an event
 * about an actor we already trust elsewhere would be inconsistent, not more secure. What IS
 * gated behind the admin secret is the system-wide GET below (see its own comment) — reading
 * everyone's activity at once is a materially different risk than writing one attributed event.
 * Only the CORS allowlist's implicit trust (known frontend origins) plus normal field validation
 * gate this route.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  const { entityType, entityId, action, actorType, actorId, actorName, changes, metadata, source, createdAt } = body as {
    entityType?: string;
    entityId?: string;
    action?: string;
    actorType?: string;
    actorId?: string | null;
    actorName?: string | null;
    changes?: AuditEvent['changes'];
    metadata?: AuditEvent['metadata'];
    source?: string;
    createdAt?: string;
  };

  if (!entityType || !VALID_ENTITY_TYPES.includes(entityType as AuditEntityType)) {
    return withAdminStatsCors(
      NextResponse.json({ error: `entityType is required and must be one of: ${VALID_ENTITY_TYPES.join(', ')}` }, { status: 400 })
    );
  }
  if (!entityId || typeof entityId !== 'string') {
    return withAdminStatsCors(NextResponse.json({ error: 'entityId is required' }, { status: 400 }));
  }
  if (!action || typeof action !== 'string') {
    return withAdminStatsCors(NextResponse.json({ error: 'action is required' }, { status: 400 }));
  }
  if (!actorType || !VALID_ACTOR_TYPES.includes(actorType as AuditActorType)) {
    return withAdminStatsCors(
      NextResponse.json({ error: `actorType is required and must be one of: ${VALID_ACTOR_TYPES.join(', ')}` }, { status: 400 })
    );
  }
  if (!source || !VALID_SOURCES.includes(source as AuditEvent['source'])) {
    return withAdminStatsCors(
      NextResponse.json({ error: `source is required and must be one of: ${VALID_SOURCES.join(', ')}` }, { status: 400 })
    );
  }

  const db = await getCompanionDb();
  const collection = db.collection<AuditEvent>('audit_events');

  const doc: AuditEvent = {
    id: crypto.randomUUID(),
    entityType: entityType as AuditEntityType,
    entityId,
    action,
    actorType: actorType as AuditActorType,
    actorId: actorId ?? null,
    actorName: actorName ?? null,
    ...(changes ? { changes } : {}),
    ...(metadata ? { metadata } : {}),
    source: source as AuditEvent['source'],
    createdAt: createdAt ? new Date(createdAt) : new Date(),
  };

  // Inserted directly rather than via logAuditEvent() because this route must honor an
  // optional caller-supplied `createdAt` (for legacy/backdated submissions), whereas
  // logAuditEvent always stamps "now" for its callers. ensureAuditIndexes() is the same
  // idempotent, once-per-process helper logAuditEvent uses internally, imported directly so this
  // route doesn't depend on a write happening first to trigger index creation.
  await ensureAuditIndexes();
  await collection.insertOne(doc);

  return withAdminStatsCors(NextResponse.json({ ok: true, event: doc }, { status: 201 }));
}

/**
 * GET /api/audit/events — system-wide audit browser: filter across ALL entities/actors at once
 * (entityType, entityId, actorId, action, source, dateFrom, dateTo — companyId is intentionally
 * NOT implemented as a first-class filter here; see note below). This is a materially different
 * risk than the single-entity timeline endpoint (GET /api/audit/entity/[type]/[id]), which is
 * scoped to one already-known entity id a caller must already possess — this route can enumerate
 * everything, so it is gated behind the SAME x-admin-stats-secret pattern as /api/admin/* via
 * checkAdminStatsSecret(), unlike every other route in this file/folder.
 *
 * Primary intended consumer is cp-redesign-admin's UI and any other REST consumer of the
 * documented contract — NOT the superadmin dashboard, which per product decision queries MongoDB
 * directly instead of going through this HTTP endpoint. Still implemented to the full contract
 * since it's documented as part of the API surface.
 *
 * companyId filtering: appointments reference their company via details.company.id
 * (AppointmentDocument in src/lib/types.ts) but AuditEvent has no top-level companyId field —
 * adding one would require every appointment-event writer to look up/pass it. As a lightweight
 * step toward making company-scoped filtering possible without a schema change, POST callers are
 * encouraged (not enforced) to include `companyId` inside `metadata` when logging an
 * appointment-related event; this GET then supports `companyId` as a filter on
 * `metadata.companyId` when provided, alongside entityType=company+entityId for company-entity
 * events themselves. This is a best-effort convention, not a guarantee — a caller that omits
 * companyId from metadata simply won't show up in a companyId-filtered query. Full company
 * scoping (e.g. backfilling companyId onto every historical appointment event) is a follow-up.
 */
export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;
  const entityType = params.get('entityType');
  const entityId = params.get('entityId');
  const actorId = params.get('actorId');
  const action = params.get('action');
  const source = params.get('source');
  const companyId = params.get('companyId');
  const dateFrom = params.get('dateFrom');
  const dateTo = params.get('dateTo');

  if (entityType && !VALID_ENTITY_TYPES.includes(entityType as AuditEntityType)) {
    return withAdminStatsCors(
      NextResponse.json({ error: `entityType must be one of: ${VALID_ENTITY_TYPES.join(', ')}` }, { status: 400 })
    );
  }

  const query: Record<string, unknown> = {};
  if (entityType) query.entityType = entityType;
  if (entityId) query.entityId = entityId;
  if (actorId) query.actorId = actorId;
  if (action) query.action = action;
  if (source) query.source = source;
  if (companyId) query['metadata.companyId'] = companyId;
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.$gte = new Date(dateFrom);
    if (dateTo) createdAt.$lte = new Date(dateTo);
    query.createdAt = createdAt;
  }

  const db = await getCompanionDb();
  const collection = db.collection<AuditEvent>('audit_events');

  const pageParam = params.get('page');

  // Same convention as employees/route.ts and other paginated routes in this repo: no `page`
  // param means "return everything" (capped at 500, matching audit-log/route.ts's existing cap,
  // to avoid an unbounded scan/response when a caller forgets to paginate).
  if (!pageParam) {
    const events = await collection.find(query).sort({ createdAt: -1 }).limit(500).toArray();
    return withAdminStatsCors(NextResponse.json({ events }));
  }

  const page = Math.max(1, parseInt(pageParam, 10) || 1);
  const pageSize = Math.min(250, Math.max(1, parseInt(params.get('pageSize') || '20', 10)));

  const [events, total] = await Promise.all([
    collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection.countDocuments(query),
  ]);

  return withAdminStatsCors(
    NextResponse.json({ events, page, pageSize, total, totalPages: Math.ceil(total / pageSize) })
  );
}
