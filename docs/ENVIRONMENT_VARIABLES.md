# Environment variables

Every environment variable this app reads, grouped by purpose. Keep this in sync with reality —
see the rule at the bottom.

Set these in Vercel under Project Settings → Environment Variables (per environment: Development /
Preview / Production), and mirror the ones you need locally into `.env.local` (gitignored, never
commit real secrets).

## Database

| Variable | Required | Used in | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | `src/lib/mongodb.ts`, all `scripts/*.mjs` | MongoDB connection string. Single cluster shared with `clinicplus-server-latest-stable-version`; this app connects to two logical databases on it (see below). |
| `SELECTED_DB` | No (default `production`) | `src/lib/mongodb.ts` | Name of the production database — the one owned by `clinicplus-server-latest-stable-version` (`appointments`, `companies`, `users`, `deleted_appointments`, ...). Treated as read-mostly; the only writes this app makes into it are additive-only enrichment fields (e.g. the lifecycle-status job) and the appointment CRUD routes it owns. |
| `COMPANION_DB` | No (default `cp_companion`) | `src/lib/mongodb.ts`, `scripts/marketing-campaign.mjs` | Name of this app's own database — every `cp_companion.*` collection (`syncLog`, `companyProfiles`, `employees`, `auditLog`, etc.) lives here. Fully owned by this app. |

## Cron authentication

Three different secrets gate three different invocation mechanisms — see
`src/app/api/cron/sync/route.ts`'s doc comment for the fullest explanation of why there are two
schemes at all (Vercel Hobby plan caps native `vercel.json` crons at once/day).

| Variable | Required | Used in | Purpose |
|---|---|---|---|
| `CRON_SECRET` | Yes (prod) | Every native `vercel.json` cron route: `api/cron/lifecycle-status`, `api/cron/date-cleanup`, `api/cron/compliance-alerts`, `api/cron/process-account-deletions`, `api/cron/marketing-campaigns`; also `api/admin/email-campaigns/[id]` | Shared secret Vercel's own cron invoker sends as `Authorization: Bearer <value>` for anything scheduled via `vercel.json`'s `crons` array (daily or slower). If unset, these routes skip the auth check — fine for local dev, must be set in production. |
| `CRON_SYNC_SECRET` | Yes (prod) | `api/cron/sync`, `api/cron/sync-audit-events` | Shared secret for routes triggered by the **external** scheduler (cron-job.org), not Vercel's native cron — used for anything that needs to run more often than once/day. Sent as a custom `x-cron-secret` header, not `Authorization: Bearer`, since cron-job.org's dashboard URL itself isn't secret. |
| `ADMIN_STATS_SECRET` | Yes (prod) | `api/admin/dashboard-stats`, `api/admin/finance-analytics` | Shared secret for cross-origin calls from `cp-redesign-admin` (a separate deployment) into this app's read-only analytics endpoints. Not a cron secret — gates browser-initiated requests, hence the CORS handling alongside it (`src/lib/admin-stats-cors.ts`). |

**Adding a new cron route?** Reuse `CRON_SECRET` if it's a native `vercel.json` cron (daily or
slower). Only reuse `CRON_SYNC_SECRET` if it's invoked by the external cron-job.org scheduler
because it needs sub-daily frequency. Don't invent a fourth secret without a reason.

## Email (Mailjet)

| Variable | Required | Used in | Purpose |
|---|---|---|---|
| `MAILJET_API_KEY` | Yes | `src/lib/mailjet.ts`, `scripts/marketing-campaign.mjs` | Mailjet API key/public key for transactional + marketing email sends. |
| `MAILJET_API_SECRET` | Yes | `src/lib/mailjet.ts`, `scripts/marketing-campaign.mjs` | Mailjet API secret, paired with the key above. |
| `CLINICPLUS_NOTIF_EMAIL` | Yes (for the emails that use it) | `src/lib/mailjet.ts` | Destination address for internal ClinicPlus notification emails (e.g. compliance alerts) — not a client-facing address. |
| `CLINICPLUS_WEBSITE_URL` | Yes (for the emails that use it) | `src/lib/mailjet.ts` | Client-facing ClinicPlus site URL, interpolated into email templates (links back to the main site). |
| `CLINICPLUS_ADMIN_WEBSITE_URL` | Yes (for the emails that use it) | `src/lib/mailjet.ts` | Admin-facing `cp-redesign-admin` URL, interpolated into email templates (links admins to the record in question). |

## Payments (Yoco)

| Variable | Required | Used in | Purpose |
|---|---|---|---|
| `YOCO_SECRET_KEY` | Yes (billing features) | `src/lib/yoco.ts` | Yoco Checkout API secret key, Bearer-authenticates checkout creation. Throws at call time if unset — no silent fallback. |
| `YOCO_WEBHOOK_SECRET` | Yes (billing features) | `src/lib/yoco.ts` | Yoco webhook signing secret (`whsec_...`), used to HMAC-verify incoming webhook payloads before trusting them. |

## URLs / cross-app linking

| Variable | Required | Used in | Purpose |
|---|---|---|---|
| `CLINICPLUS_UPLOAD_URL` | No (defaults to `https://api.clinicplusbooking.co.za/upload-file-to-cloud-storage`) | `src/app/api/upload/route.ts` | Where file uploads are proxied to — reuses `clinicplus-server-latest-stable-version`'s existing GCS upload route rather than a separate storage account, so resulting URLs are ones the admin app already knows how to render. |
| `CP_COMPANION_BASE_URL` | No (falls back to `SITE_URL` from `src/lib/seo.ts`, i.e. `https://cpc.qwbi.lat`) | `src/app/api/billing/checkout/route.ts` | Base URL used to build Yoco checkout redirect/callback links. Only needs setting explicitly if a preview/staging deployment must generate correct redirect URLs. |

## Framework-provided (not app-specific)

| Variable | Notes |
|---|---|
| `NODE_ENV` | Set by Next.js/Vercel, not by you. `src/lib/mongodb.ts` uses it to decide whether to reuse a cached Mongo client across hot-reloads in dev. |

---

## Rule: always document new environment variables

Whenever a change to this repo (`cp-companion`) introduces a **new** `process.env.X` reference —
a new secret, a new external service key, a new configurable URL, anything — add it to this file
in the same change:

- Put it in the most fitting section above (or add a new section if it's a genuinely new category).
- Fill in all four columns: variable name, whether it's required and in which environment(s),
  every file that reads it (or the first/primary one if there are many), and a one-line purpose —
  say what it gates or configures, not just what it's called.
- If it reuses an existing secret (e.g. a new cron route reusing `CRON_SECRET`), you don't need a
  new row — but do add the route to that row's "Used in" list.

This file is the single source of truth for "what do I need to set before this works" — keep it
current rather than letting `.env.local` or tribal knowledge be the only record.
