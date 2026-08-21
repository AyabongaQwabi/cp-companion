# Runnable npm scripts

Every `npm run <name>` script in this repo, what it does, when to run it, and what it needs. Keep
this in sync with reality — if you add, rename, or remove a script in `package.json`, update this
file in the same change.

## App lifecycle

| Script | What it does |
|---|---|
| `npm run dev` | Starts the Next.js dev server (`next dev`). |
| `npm run build` | Production build (`next build`). |
| `npm run start` | Runs a built app (`next start`) — requires `npm run build` first. |
| `npm run lint` | Runs ESLint (`eslint`). |

## Backfills

One-off (but safely re-runnable/idempotent) scripts that populate a `cp_companion` collection from
historical `production` data, so it doesn't have to wait for however many sync-pipeline runs it'd
otherwise take to catch up. Each connects to MongoDB directly using `DATABASE_URL`/`SELECTED_DB`/
`COMPANION_DB` from `.env.local` — no running server required.

| Script | Populates | Source data | Idempotency key |
|---|---|---|---|
| `npm run backfill:employee-directory` | `cp_companion.employeeDirectory`, `cp_companion.employeeStats` | `production.appointments[].details.employees[]` | Employee identity (idNumber, or name fallback) |
| `npm run backfill:audit-events` | `cp_companion.audit_events` (`source: 'legacy-import'`) | `production.{appointments,companies,users}[].tracking[]` | Deterministic hash of entityType+entityId+action+doer+date. Supports `--dry-run`. |
| `npm run backfill:site-directory` | `cp_companion.siteDirectory`, `cp_companion.siteDirectoryDuplicateFlags` | `production.appointments[].details.employees[].sites[]` (approved appointments only) | Upsert keyed on `normalizedNameKey` (sites) / sorted id pair (duplicate flags). Supports `--dry-run`. |
| `npm run backfill:lifecycle-status` | Writes `lifecycleStatus`/`lifecycleStatusReason`/`pipelineComplete` directly onto **`production.appointments`** (not a `cp_companion` collection) | `production.appointments` older than 3 months | Re-derives and `$set`s every run; skips appointments whose computed status already matches. **Note:** this is the only backfill script that writes to `production` rather than `cp_companion` — confirm you intend that before running it. |

Why these exist as standalone scripts instead of just "wait for the sync pipeline to catch up":
the sync pipeline (below) is incremental-since-last-run by design, so brand-new collections like
`siteDirectory` or `audit_events` would otherwise only backfill as fast as the pipeline's own
change-detection surfaces old data — which, for data that hasn't changed recently, could be never.
Each backfill script is the one-time "prime the pump" step; the pipeline keeps it current after that.

## Sync pipeline

| Script | What it does |
|---|---|
| `npm run sync:run` | Manually triggers the hourly production-sync/enrichment pipeline (`runSyncPipeline` — company profiles, booking patterns, compliance cache, data quality sweep, site directory, dormancy flags, new-company leads, anomaly watchdog, adoption metric, finance analytics) without waiting for the external cron-job.org scheduler's next hourly tick. |

Unlike the backfill scripts, this one calls the running app's own `GET /api/cron/sync` route over
HTTP (`X-Cron-Secret` header, using `CRON_SYNC_SECRET` from `.env.local`) rather than touching
MongoDB directly — it needs a running instance of the app (local `npm run dev`, or a deployed URL).

```
npm run sync:run                                # targets http://localhost:3000
npm run sync:run -- --url https://cpc.qwbi.lat  # targets a deployed instance
```

Every job inside the pipeline is itself designed to be safe to re-run at any frequency (upserts,
full-collection re-derivation, or additive-only writes) — running this manually between scheduled
ticks never produces duplicate or conflicting data.

## Marketing

| Script | What it does |
|---|---|
| `npm run marketing:campaign` | Runs a lifecycle marketing email campaign (`config/marketing-campaigns.json`) — dry-run by default; see the script's own `argv` handling for real-send usage. |
| `npm run marketing:test-email` | Sends a single test email for the default campaign (`clinicplus-companion-client-invite`) without touching real recipient enrollment state. |
| `npm run marketing:admin-companion:dry-run` | Lists everyone eligible for the ClinicPlus Admin Companion introduction: all `admin` users and `client` users whose email contains `clinic`. No emails are sent. |
| `npm run marketing:admin-companion:test-email` | Sends the Admin Companion introduction as a test email to `aya@qwabi.co.za` without enrolling recipients. |
| `npm run marketing:admin-companion:enroll` | Enrolls the Admin Companion introduction recipients into `emailCampaignInvites`. Does not send email by itself. |
| `npm run marketing:admin-companion:send-due` | Sends the due Admin Companion introduction emails. Live sends CC `aya@qwabi.co.za`, excluding duplicate CC when Aya is the direct recipient. |

## Adding a new script

- Backfill (one-off historical import into a `cp_companion` collection): follow the pattern in
  `scripts/backfill-audit-events.mjs` or `scripts/backfill-site-directory.mjs` — plain Node ESM
  (no TypeScript/path-alias loader is configured for `scripts/*.mjs`, so don't `import` from
  `src/`; duplicate the minimal logic needed and note in a comment where the "real" TS version
  lives so the two can be kept in sync manually), idempotent upserts, `--dry-run` support if the
  script has any destructive/bulk-write behavior worth previewing first.
- Anything that should run repeatedly on a schedule going forward: that belongs in the sync
  pipeline (`src/lib/sync/*.ts`, registered in `runSyncPipeline`) or a dedicated `/api/cron/*`
  route, not a new standalone script — see `docs/ENVIRONMENT_VARIABLES.md`'s "Adding a new cron
  route?" note for which shared secret to reuse.
- Whatever you add, add the matching `"name": "..."` entry to `package.json`'s `scripts` block and
  a row to the appropriate table above in the same change.
