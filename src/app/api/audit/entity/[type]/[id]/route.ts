import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb } from '@/lib/mongodb';
import { withAdminStatsCors, adminStatsCorsPreflight } from '@/lib/admin-stats-cors';
import type { AuditEvent, AuditEntityType } from '@/lib/types';

const VALID_ENTITY_TYPES: AuditEntityType[] = ['appointment', 'user', 'company'];

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

/**
 * GET /api/audit/entity/[type]/[id] — full sorted (desc by createdAt) audit timeline for ONE
 * entity, read straight from cp_companion.audit_events. Unlike the older /api/audit-log route,
 * this does NOT merge production.appointments[].tracking / production.companies[].tracking
 * in-request — that legacy data is imported into this same audit_events collection ahead of time
 * (scripts/backfill-audit-events.mjs, then kept current by the hourly
 * /api/cron/sync-audit-events job), so a plain query against audit_events already includes it.
 *
 * Reuses the admin-stats CORS allowlist (cp-redesign-admin's audit timeline UI is the intended
 * caller) but does NOT require x-admin-stats-secret — this is a read scoped to one entity id the
 * caller must already know/possess, not an enumeration of all activity (contrast with
 * GET /api/audit/events, which IS gated behind the secret — see that route's comment for the
 * full asymmetry rationale). Non-sensitive audit metadata for an already-identified entity is
 * treated the same trust level as the rest of this app's id-scoped reads.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id } = await params;

  if (!VALID_ENTITY_TYPES.includes(type as AuditEntityType)) {
    return withAdminStatsCors(
      NextResponse.json({ error: `type must be one of: ${VALID_ENTITY_TYPES.join(', ')}` }, { status: 400 })
    );
  }
  if (!id) {
    return withAdminStatsCors(NextResponse.json({ error: 'id is required' }, { status: 400 }));
  }

  const db = await getCompanionDb();
  const collection = db.collection<AuditEvent>('audit_events');
  const query = { entityType: type as AuditEntityType, entityId: id };

  const pageParam = req.nextUrl.searchParams.get('page');

  // No `page` param: return the full timeline (capped at 500), matching this repo's existing
  // "paginate only if asked" convention (see employees/route.ts) and the 500 cap already used by
  // /api/audit-log for the same kind of unbounded-timeline concern.
  if (!pageParam) {
    const events = await collection.find(query).sort({ createdAt: -1 }).limit(500).toArray();
    return withAdminStatsCors(NextResponse.json({ events }));
  }

  const page = Math.max(1, parseInt(pageParam, 10) || 1);
  const pageSize = Math.min(250, Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '20', 10)));

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
