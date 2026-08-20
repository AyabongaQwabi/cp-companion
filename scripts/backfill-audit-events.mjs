#!/usr/bin/env node

import fs from 'fs';
import crypto from 'crypto';
import { MongoClient } from 'mongodb';

/**
 * One-off (but safely re-runnable) backfill: scans .tracking arrays on production.appointments,
 * production.companies, and production.users, and upserts each entry as an AuditEvent into
 * cp_companion.audit_events — the new centralized audit-event system (see the AuditEvent block in
 * src/lib/types.ts). This does NOT touch cp_companion.auditLog (the older, separate, still-active
 * ad hoc audit collection) or any of the ~15 existing write sites into it — that system is
 * untouched.
 *
 * Idempotent by design: each imported event's `id` is a deterministic hash of
 * entityType+entityId+action+doer+date (see deterministicLegacyEventId below), and every write is
 * an upsert (findOneAndUpdate with upsert:true) keyed on that id — re-running this script never
 * creates duplicate rows, it just re-writes the same documents.
 *
 * IMPORTANT — kept in sync manually, not imported: this script duplicates the mapping logic in
 * src/lib/audit-legacy-sync.ts (used by src/app/api/cron/sync-audit-events/route.ts for the
 * hourly re-sync of the same data) rather than importing it, because scripts/*.mjs in this repo
 * run as plain Node ESM with no TypeScript/path-alias loader configured (see
 * backfill-employee-directory.mjs — same constraint, same reason it's self-contained JS). If the
 * mapping rules in audit-legacy-sync.ts ever change, mirror the change here too.
 *
 * Mapping rules:
 *   - entityId (top-level, on the written AuditEvent) = the appointment/company/user's OWN id —
 *     i.e. the id of the document the .tracking array lives on. This is NOT the same as the
 *     tracking entry's own optional `entityId` field, which in real company/appointment tracking
 *     data sometimes names a *different* related entity (e.g. a company's ADD_NEW_MANAGER
 *     tracking entry's `entityId` is the manager user's id, not the company's own id). That
 *     original field, when present, is preserved under metadata.legacyTrackingEntityId instead so
 *     it's never lost and never collides with the new schema's entityId.
 *   - action = the legacy `type` value passed through completely unchanged, no renaming/mapping.
 *   - actorType = 'user' when `doer` is present (legacy doer is always a user id per prior
 *     research); 'system' when doer is missing/null.
 *   - actorId = doer, or null.
 *   - source = 'legacy-import' for every row this script writes.
 */
function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

const DRY_RUN = process.argv.includes('--dry-run');

log('Audit-events legacy backfill starting', { dryRun: DRY_RUN });

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2];
  }
}

const client = await new MongoClient(process.env.DATABASE_URL).connect();
const prodDb = client.db(process.env.SELECTED_DB || 'production');
const companionDb = client.db(process.env.COMPANION_DB || 'cp_companion');
const auditEvents = companionDb.collection('audit_events');

// Same indexes as ensureAuditIndexes() in src/lib/audit.ts — createIndex is idempotent, so it's
// safe to (re-)run here even though the app itself also ensures these lazily on first write.
await Promise.all([
  auditEvents.createIndex({ entityType: 1, entityId: 1, createdAt: -1 }),
  auditEvents.createIndex({ createdAt: -1 }),
  auditEvents.createIndex({ actorId: 1 }),
  auditEvents.createIndex({ action: 1 }),
]);

function deterministicLegacyEventId(entityType, entityId, action, doer, date) {
  const key = `${entityType}:${entityId}:${action}:${doer ?? 'null'}:${date.toISOString()}`;
  return `legacy-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
}

function buildEventDoc(entityType, entityOwnId, entry) {
  const date = entry.date instanceof Date ? entry.date : new Date(entry.date);
  const doer = entry.doer || null;
  const id = deterministicLegacyEventId(entityType, entityOwnId, entry.type, doer, date);

  const doc = {
    id,
    entityType,
    entityId: entityOwnId,
    action: entry.type,
    actorType: doer ? 'user' : 'system',
    actorId: doer,
    actorName: null,
    source: 'legacy-import',
    createdAt: date,
  };
  if (entry.entityId) {
    doc.metadata = { legacyTrackingEntityId: entry.entityId };
  }
  return doc;
}

async function importCollection(collectionName, entityType) {
  log(`Scanning production.${collectionName}`);
  const docs = await prodDb
    .collection(collectionName)
    .find({})
    .project({ id: 1, tracking: 1 })
    .toArray();

  let scanned = docs.length;
  let imported = 0;
  let skipped = 0;

  for (const doc of docs) {
    const ownId = doc.id;
    const tracking = doc.tracking || [];
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
      if (!DRY_RUN) {
        await auditEvents.findOneAndUpdate(
          { id: eventDoc.id },
          { $set: eventDoc },
          { upsert: true }
        );
      }
      imported++;
    }
  }

  log(`Done: production.${collectionName}`, { scanned, imported, skipped });
  return { scanned, imported, skipped };
}

const results = {
  appointments: await importCollection('appointments', 'appointment'),
  companies: await importCollection('companies', 'company'),
  // users.tracking is confirmed dead (only ever set once at signup, never appended to — see
  // ClinicPlusUserDocument's comment in src/lib/types.ts) but scanned anyway: cheap, idempotent,
  // and correct if that ever changes upstream.
  users: await importCollection('users', 'user'),
};

log('Backfill complete', {
  dryRun: DRY_RUN,
  totalScanned: results.appointments.scanned + results.companies.scanned + results.users.scanned,
  totalImported: results.appointments.imported + results.companies.imported + results.users.imported,
  totalSkipped: results.appointments.skipped + results.companies.skipped + results.users.skipped,
  byEntity: results,
});

await client.close();
