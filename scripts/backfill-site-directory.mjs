#!/usr/bin/env node

import fs from 'fs';
import { MongoClient } from 'mongodb';

/**
 * One-off (but safely re-runnable) backfill: populates cp_companion.siteDirectory from every
 * approved appointment in production.appointments.details.employees[].sites[], the same way the
 * hourly sync pipeline's site-directory job would on its first-ever run (no changedAppointmentIds
 * passed = full scan, matching runSyncPipeline's own "everything is changed" first-run behavior —
 * see getLastSuccessfulRunCutoff in src/lib/sync/index.ts). Running this script now just avoids
 * waiting for the next scheduled/triggered pipeline run to populate the directory.
 *
 * This does NOT touch production, clinic capacity/availability data, or cp_companion.sites
 * (the unrelated per-user RosterSite roster list) — see src/lib/sync/site-directory.ts's own
 * header comment for the full disambiguation.
 *
 * IMPORTANT — kept in sync manually, not imported: this script duplicates syncSiteDirectory's
 * logic from src/lib/sync/site-directory.ts rather than importing it, because scripts/*.mjs in
 * this repo run as plain Node ESM with no TypeScript/path-alias loader configured (same
 * constraint as backfill-employee-directory.mjs and backfill-audit-events.mjs). If the sync job's
 * upsert/dormancy/dedup rules ever change, mirror the change here too.
 *
 * Idempotent: every write is an upsert keyed on normalizedNameKey (sites) or the sorted
 * siteIdA/siteIdB pair (duplicate flags) — safe to re-run.
 */
const DRY_RUN = process.argv.includes('--dry-run');
const DORMANCY_MULTIPLIER = 2;
const PAIRWISE_DEDUP_WARN_THRESHOLD = 3000;
const SIMILARITY_THRESHOLD = 0.6;

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function normalizeName(raw) {
  return (raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function computeSimilarity(nameA, nameB) {
  const tokensA = new Set(normalizeName(nameA).split(' ').filter(Boolean));
  const tokensB = new Set(normalizeName(nameB).split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

log('Site directory backfill starting', { dryRun: DRY_RUN });

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2];
  }
}

const client = await new MongoClient(process.env.DATABASE_URL).connect();
const prodDb = client.db(process.env.SELECTED_DB || 'production');
const companionDb = client.db(process.env.COMPANION_DB || 'cp_companion');
const directory = companionDb.collection('siteDirectory');
const flags = companionDb.collection('siteDirectoryDuplicateFlags');

// --- Pass 1: scan + upsert sites ---
log('Scanning production.appointments (approved only)');
const rawDocs = await prodDb
  .collection('appointments')
  .find({ status: 'approved' })
  .project({ id: 1, 'details.date': 1, 'details.company.id': 1, 'details.employees.sites': 1 })
  .toArray();
log('Fetched appointments', { count: rawDocs.length });

const bucket = new Map();

for (const doc of rawDocs) {
  const companyId = doc.details?.company?.id;
  const date = doc.details?.date;
  const appointmentId = doc.id;
  const employees = doc.details?.employees;
  if (!employees) continue;

  const seenThisAppointment = new Set();

  for (const employee of employees) {
    for (const site of employee.sites || []) {
      const rawName = (site?.name || '').trim();
      if (!rawName) continue;
      const key = normalizeName(rawName);
      if (!key) continue;

      if (!bucket.has(key)) {
        bucket.set(key, { name: rawName, companyIds: new Set(), appointmentIds: new Set(), dates: [] });
      }
      const entry = bucket.get(key);
      entry.name = rawName;
      if (companyId) entry.companyIds.add(companyId);
      if (appointmentId && !seenThisAppointment.has(key)) {
        entry.appointmentIds.add(appointmentId);
        seenThisAppointment.add(key);
      }
      if (date) entry.dates.push(date);
    }
  }
}

log('Distinct site names found', { count: bucket.size });

let sitesProcessed = 0;
let errors = 0;
const now = new Date();
const siteOps = [];

for (const [key, agg] of bucket.entries()) {
  try {
    const sortedDates = agg.dates.filter(Boolean).sort();
    const lastUsedAt = sortedDates.length > 0 ? new Date(sortedDates[sortedDates.length - 1]) : now;
    const firstSeenAt = sortedDates.length > 0 ? new Date(sortedDates[0]) : now;

    siteOps.push({
      updateOne: {
        filter: { normalizedNameKey: key },
        update: {
          $set: {
            name: agg.name,
            normalizedNameKey: key,
            companyIds: Array.from(agg.companyIds),
            lastUsedAt,
            appointmentCount: agg.appointmentIds.size,
            lastSyncedAt: now,
          },
          $setOnInsert: {
            firstSeenAt,
            address: null,
            gpsCoordinates: null,
            region: null,
            siteType: null,
            capacity: null,
            onSiteContactName: null,
            onSiteContactPhone: null,
            accessRequirements: null,
            accessCardTypicallyRequired: null,
            notes: null,
            status: 'active',
          },
        },
        upsert: true,
      },
    });
    sitesProcessed++;
  } catch (err) {
    errors++;
    log('ERROR building upsert for site', { key, error: err instanceof Error ? err.message : String(err) });
  }
}

if (!DRY_RUN && siteOps.length > 0) {
  await directory.bulkWrite(siteOps, { ordered: false });
}
log('Sites upserted', { sitesProcessed, errors, dryRun: DRY_RUN });

// --- Pass 2: dormancy status ---
if (!DRY_RUN) {
  log('Computing dormancy status');
  const sites = await directory.find({}).toArray();
  const statusOps = [];

  for (const site of sites) {
    const lifespanDays = Math.max(
      0,
      (new Date(site.lastUsedAt).getTime() - new Date(site.firstSeenAt).getTime()) / 86400000
    );
    const intervalCount = Math.max(site.appointmentCount - 1, 1);
    const avgIntervalDays = site.appointmentCount >= 2 ? lifespanDays / intervalCount : null;

    let status = 'active';
    if (avgIntervalDays !== null && avgIntervalDays > 0) {
      const daysSinceLastUse = (now.getTime() - new Date(site.lastUsedAt).getTime()) / 86400000;
      const threshold = avgIntervalDays * DORMANCY_MULTIPLIER;
      if (daysSinceLastUse > threshold) status = 'dormant';
    }

    if (status !== site.status) {
      statusOps.push({ updateOne: { filter: { _id: site._id }, update: { $set: { status } } } });
    }
  }

  if (statusOps.length > 0) {
    await directory.bulkWrite(statusOps, { ordered: false });
  }
  log('Dormancy status computed', { updated: statusOps.length });
} else {
  log('Skipping dormancy pass (dry run)');
}

// --- Pass 3: fuzzy-duplicate detection ---
if (!DRY_RUN) {
  log('Detecting near-duplicate site names');
  const sites = await directory.find({}).project({ name: 1, normalizedNameKey: 1 }).toArray();

  if (sites.length > PAIRWISE_DEDUP_WARN_THRESHOLD) {
    log('WARNING: site count exceeds pairwise-dedup comfort threshold, this pass will be slow', {
      count: sites.length,
      threshold: PAIRWISE_DEDUP_WARN_THRESHOLD,
    });
  }

  const resolved = await flags
    .find({ status: { $in: ['merged', 'dismissed'] } })
    .project({ siteIdA: 1, siteIdB: 1 })
    .toArray();
  const resolvedPairKeys = new Set(resolved.map((f) => [f.siteIdA, f.siteIdB].sort().join('::')));

  const dupOps = [];
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      const a = sites[i];
      const b = sites[j];
      if (a.normalizedNameKey === b.normalizedNameKey) continue;

      const idA = String(a._id);
      const idB = String(b._id);
      const pairKey = [idA, idB].sort().join('::');
      if (resolvedPairKeys.has(pairKey)) continue;

      const score = computeSimilarity(a.name, b.name);
      if (score < SIMILARITY_THRESHOLD) continue;

      const [sortedIdA, sortedIdB] = [idA, idB].sort();
      const [sortedNameA, sortedNameB] = sortedIdA === idA ? [a.name, b.name] : [b.name, a.name];

      dupOps.push({
        updateOne: {
          filter: { siteIdA: sortedIdA, siteIdB: sortedIdB },
          update: {
            $set: { siteIdA: sortedIdA, siteIdB: sortedIdB, nameA: sortedNameA, nameB: sortedNameB, similarityScore: score },
            $setOnInsert: { status: 'pending', flaggedAt: now },
          },
          upsert: true,
        },
      });
    }
  }

  if (dupOps.length > 0) {
    await flags.bulkWrite(dupOps, { ordered: false });
  }
  log('Duplicate flags upserted', { count: dupOps.length });
} else {
  log('Skipping duplicate-detection pass (dry run)');
}

log('Backfill complete', { sitesProcessed, errors, dryRun: DRY_RUN });

await client.close();
