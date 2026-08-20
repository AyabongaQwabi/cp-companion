#!/usr/bin/env node

import fs from 'fs';

/**
 * Manually triggers the hourly production-sync/enrichment pipeline (runSyncPipeline,
 * src/lib/sync/index.ts — company profiles, booking patterns, compliance cache, data quality
 * sweep, site directory, dormancy flags, new-company leads, anomaly watchdog, adoption metric,
 * finance analytics) without waiting for the external cron-job.org scheduler's next hourly tick.
 *
 * Calls GET /api/cron/sync over HTTP with the X-Cron-Secret header (src/app/api/cron/sync/route.ts)
 * rather than importing runSyncPipeline directly, because that function and everything it calls is
 * TypeScript with `@/*` path aliases — scripts/*.mjs in this repo run as plain Node ESM with no
 * TS/path-alias loader (same constraint documented in backfill-employee-directory.mjs and
 * backfill-audit-events.mjs). Going over HTTP means this script exercises the exact same code path
 * the real hourly trigger uses, with zero duplicated logic.
 *
 * Requires a running instance of this app (local dev server or a deployed URL) — this is NOT a
 * standalone DB script like the backfill-*.mjs scripts, it's a trigger for the app's own route.
 *
 * Usage:
 *   npm run sync:run                              # targets http://localhost:3000
 *   npm run sync:run -- --url https://cpc.qwbi.lat # targets a deployed instance
 */
function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

const urlFlagIndex = process.argv.indexOf('--url');
const baseUrl =
  urlFlagIndex !== -1 && process.argv[urlFlagIndex + 1]
    ? process.argv[urlFlagIndex + 1]
    : process.env.CP_COMPANION_BASE_URL || 'http://localhost:3000';

if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const secret = process.env.CRON_SYNC_SECRET;
if (!secret) {
  log('ERROR: CRON_SYNC_SECRET is not set (checked process.env and .env.local)');
  process.exit(1);
}

const target = `${baseUrl.replace(/\/$/, '')}/api/cron/sync`;
log('Triggering sync pipeline', { target });

const res = await fetch(target, {
  headers: { 'X-Cron-Secret': secret },
});

const body = await res.json().catch(() => ({}));

if (!res.ok || body.ok === false) {
  log('Sync pipeline run FAILED', { status: res.status, body });
  process.exit(1);
}

log('Sync pipeline run complete', {
  runId: body.runId,
  status: body.status,
  jobs: body.jobs,
});
