import { getCompanionDb } from '@/lib/mongodb';
import type { AuditEvent } from '@/lib/types';

/**
 * Shared write path into the new cp_companion.audit_events collection (see the AuditEvent block
 * in src/lib/types.ts for the full field-by-field rationale). Used internally by
 * POST /api/audit/events (src/app/api/audit/events/route.ts) and available for this app's own
 * server-side routes to call directly later — there is no requirement today that any existing
 * cp-companion route call this; the ~15 existing cp_companion.auditLog write sites are untouched
 * and keep writing exactly as they do now.
 *
 * Indexes: this collection has no index-creation step anywhere else in the codebase to hook into
 * (unlike, say, a migrations runner), so indexes are ensured lazily and idempotently here, once
 * per server process, the first time an event is written. createIndexes is itself idempotent
 * (Mongo no-ops if an equivalent index already exists), so concurrent cold starts across
 * serverless instances are safe — worst case a few redundant createIndexes calls, never a
 * duplicate or conflicting index.
 *
 * Indexes chosen to match the two read access patterns this system defines:
 *   - entityType + entityId (+ createdAt for the sort) → GET /api/audit/entity/[type]/[id]
 *   - createdAt, actorId, action → GET /api/audit/events filters (entityType/entityId reuse the
 *     compound index above; actorId/action/createdAt get their own single-field indexes since
 *     they're each filtered independently and in varying combinations)
 */
let indexesEnsured = false;

/**
 * Exported (not just used internally by logAuditEvent) so other writers into this collection —
 * currently just POST /api/audit/events, which inserts directly rather than through
 * logAuditEvent because it needs to honor a caller-supplied `createdAt` — can ensure indexes
 * exist without duplicating the createIndex calls.
 */
export async function ensureAuditIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const db = await getCompanionDb();
  const collection = db.collection<AuditEvent>('audit_events');
  await Promise.all([
    collection.createIndex({ entityType: 1, entityId: 1, createdAt: -1 }),
    collection.createIndex({ createdAt: -1 }),
    collection.createIndex({ actorId: 1 }),
    collection.createIndex({ action: 1 }),
  ]);
  indexesEnsured = true;
}

/**
 * Inserts one audit event. Always succeeds or throws — callers that consider audit logging
 * best-effort (e.g. "don't fail the real request just because audit logging failed") should wrap
 * this in their own try/catch, matching how the existing auditLog insertOne call sites in this
 * repo are NOT wrapped (a failed audit write today does fail the request) — this helper doesn't
 * change that behavior on its own, it just centralizes the insert.
 */
export async function logAuditEvent(event: Omit<AuditEvent, 'id' | 'createdAt'>): Promise<void> {
  await ensureAuditIndexes();
  const db = await getCompanionDb();
  const collection = db.collection<AuditEvent>('audit_events');

  const doc: AuditEvent = {
    ...event,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  };

  await collection.insertOne(doc);
}
