import type { Db } from 'mongodb';
import { createHash } from 'crypto';
import type { AuditEvent, AuditEntityType } from '@/lib/types';
import { ensureAuditIndexes } from '@/lib/audit';

/**
 * Core import logic for turning legacy production.{appointments,companies,users}[].tracking
 * entries into cp_companion.audit_events rows. Shared by:
 *   - scripts/backfill-audit-events.mjs (one-off/re-runnable full backfill, plain JS per this
 *     repo's script convention — see that file's own header for why the algorithm is duplicated
 *     there rather than imported from here: scripts/*.mjs have no TypeScript/path-alias runtime
 *     in this repo, same as backfill-employee-directory.mjs, so it re-implements this same logic
 *     in vanilla JS. Keep the two in sync if this file's mapping rules change.)
 *   - src/app/api/cron/sync-audit-events/route.ts (hourly re-sync, TypeScript, imports this
 *     directly)
 *
 * Mapping rules (must match the backfill script exactly):
 *   - entityId (top-level, AuditEvent.entityId) = the appointment/company/user's OWN id — i.e.
 *     the id of the document the .tracking array lives on, NOT the tracking entry's own
 *     `entityId` field (which, per confirmed real data, sometimes refers to a *different* related
 *     entity — e.g. a company's ADD_NEW_MANAGER tracking entry's `entityId` is the manager user's
 *     id, not the company's). That original tracking-entry `entityId` (when present) is preserved
 *     under metadata.legacyTrackingEntityId instead, so it's never lost, just never collides with
 *     the new schema's entityId.
 *   - action = the legacy `type` value passed through completely unchanged (no renaming/mapping)
 *     — see the AuditAction vocabulary table in src/lib/types.ts.
 *   - actorType = 'user' when `doer` is present (legacy doer is always a user id per prior
 *     research), else 'system'. actorId = doer ?? null.
 *   - source = 'legacy-import' unconditionally.
 *   - id (AuditEvent.id) = a deterministic hash of
 *     `${entityType}:${entityId}:${action}:${doer}:${date.toISOString()}` — NOT a fresh
 *     crypto.randomUUID() like logAuditEvent() uses for new writes, specifically so re-running
 *     the backfill/sync never creates duplicate rows for the same tracking entry. Upserted by
 *     this id via findOneAndUpdate, not insertOne.
 */

export interface LegacyTrackingEntry {
  type: string;
  date: Date | string;
  doer?: string | null;
  entityId?: string;
}

export interface LegacySyncCounts {
  appointments: { scanned: number; imported: number; skipped: number };
  companies: { scanned: number; imported: number; skipped: number };
  users: { scanned: number; imported: number; skipped: number };
}

/** Deterministic id so upserts are idempotent across repeated runs. */
export function deterministicLegacyEventId(
  entityType: AuditEntityType,
  entityId: string,
  action: string,
  doer: string | null | undefined,
  date: Date
): string {
  const key = `${entityType}:${entityId}:${action}:${doer ?? 'null'}:${date.toISOString()}`;
  return `legacy-${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
}

function buildEventDoc(
  entityType: AuditEntityType,
  entityOwnId: string,
  entry: LegacyTrackingEntry
): AuditEvent {
  const date = entry.date instanceof Date ? entry.date : new Date(entry.date);
  const doer = entry.doer || null;
  const id = deterministicLegacyEventId(entityType, entityOwnId, entry.type, doer, date);

  return {
    id,
    entityType,
    entityId: entityOwnId,
    action: entry.type,
    actorType: doer ? 'user' : 'system',
    actorId: doer,
    actorName: null,
    ...(entry.entityId ? { metadata: { legacyTrackingEntityId: entry.entityId } } : {}),
    source: 'legacy-import',
    createdAt: date,
  };
}

/**
 * Imports (upserts) tracking entries for one entityType's collection. `filter` narrows which
 * documents are scanned — full backfill passes {} (everything), the hourly cron re-sync passes a
 * recency-scoped filter where possible (see sync-audit-events/route.ts for why a true "what's new
 * since last run" filter isn't available for these collections).
 */
async function importTrackingForCollection(
  prodDb: Db,
  companionDb: Db,
  collectionName: 'appointments' | 'companies' | 'users',
  entityType: AuditEntityType,
  filter: Record<string, unknown>
): Promise<{ scanned: number; imported: number; skipped: number }> {
  const auditEvents = companionDb.collection<AuditEvent>('audit_events');
  const docs = await prodDb
    .collection(collectionName)
    .find(filter)
    .project({ id: 1, tracking: 1 })
    .toArray();

  let imported = 0;
  let skipped = 0;

  for (const doc of docs) {
    const ownId = (doc as { id?: string }).id;
    const tracking = ((doc as { tracking?: LegacyTrackingEntry[] }).tracking || []) as LegacyTrackingEntry[];
    if (!ownId) {
      skipped += tracking.length;
      continue;
    }

    for (const entry of tracking) {
      if (!entry?.type || !entry?.date) {
        skipped++;
        continue;
      }
      const eventDoc = buildEventDoc(entityType, ownId, entry);
      await auditEvents.findOneAndUpdate(
        { id: eventDoc.id },
        { $set: eventDoc },
        { upsert: true }
      );
      imported++;
    }
  }

  return { scanned: docs.length, imported, skipped };
}

/**
 * Runs the legacy tracking -> audit_events import across appointments, companies, and users.
 * `since`, when provided, scopes each collection's scan to `tracking.date >= since` (used by the
 * hourly cron re-sync); omitted (or undefined) scans every document (used by the full backfill).
 */
export async function syncLegacyAuditEvents(
  prodDb: Db,
  companionDb: Db,
  since?: Date
): Promise<LegacySyncCounts> {
  await ensureAuditIndexes();

  const trackingFilter = since ? { 'tracking.date': { $gte: since } } : {};

  const [appointments, companies, users] = await Promise.all([
    importTrackingForCollection(prodDb, companionDb, 'appointments', 'appointment', trackingFilter),
    importTrackingForCollection(prodDb, companionDb, 'companies', 'company', trackingFilter),
    // users.tracking is confirmed dead (only ever set once at signup, never appended to — see
    // ClinicPlusUserDocument's comment in types.ts) but included anyway per the backfill spec:
    // cheap, idempotent, and correct if that ever changes upstream.
    importTrackingForCollection(prodDb, companionDb, 'users', 'user', trackingFilter),
  ]);

  return { appointments, companies, users };
}
