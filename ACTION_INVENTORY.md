# ClinicPlus Companion — Billable Action Inventory

**Status: draft for review, not final.** Every credit cost below is a starting-point estimate
based on the reasoning in the "Rationale" column — not a launched price, and nothing here has been
wired into an actual deduction. No wallet, ledger, or billing code exists yet. This file is the
output of Phase 5 (per `ADDON_APP_SPEC_AND_PROMPT.md` Part E) — read it, adjust the numbers, and
only then does Phase 6 (building the credits system itself) start.

Audited by reading every page and API route in `cp-companion` as of this commit: `src/app/**`
(pages) and `src/app/api/**/route.ts` (server actions). Nothing in `cp-redesign`,
`cp-redesign-admin`, or `clinicplus-server-latest-stable-version` was touched or counted — those
remain untouched per the spec's non-goals.

---

## Roster management

| Action | What it does | Billable (Y/N + why) | Draft credit cost | Rationale |
|---|---|---|---|---|
| Add employee to roster | Creates one `cp_companion.employees` document (`POST /api/employees`) | Y — writes new data the client will reuse indefinitely | 1 | Cheap DB write, no external cost; low price so the roster feels free to build up — the app's core value only shows up once it's populated |
| Edit employee | Updates an existing roster employee (`PATCH /api/employees`) | Y — a write, however small | 1 | Same basis as "add" — trivial DB write |
| Remove employee from roster | Soft-deletes (archives) a roster employee (`DELETE /api/employees`) | Y, low — but flagged: charging for deletion is unusual and may feel punitive | 0–1 (see note) | Trivial write, but see "Ambiguous cases" below — recommend Aya consider making this free |
| Add site to catalog | Creates a `cp_companion.sites` document (`POST /api/sites`) | Y — a write | 1 | Same basis as "add employee" |
| Delete site | Removes a `cp_companion.sites` document (`DELETE /api/sites`) | Y, low — same punitive-deletion concern as above | 0–1 (see note) | See "Ambiguous cases" |
| Create/reuse occupation | Adds a new occupation to the per-user catalog, or reuses an existing one by name (`POST /api/occupations`) | Y for genuine creation; a **reuse should not be billable** — the route already dedupes by name and returns the existing doc | 1 (creation only) | Only the first time a given occupation is typed should cost anything; every reuse after that is what makes the creatable-select valuable and should be free |
| Create/reuse employee group | Same pattern as occupation (`POST /api/employee-groups`) | Same as occupation — creation only, not reuse | 1 (creation only) | Same reasoning as occupation |
| Bulk-add employees to a site | Adds one site to `defaultSites` on N employees in one call (`POST /api/employees/bulk-add-site`) | Y — N writes in one action | 1 credit per employee added (flagged: quantity-based, see below) | This has a natural per-employee unit — pricing flat regardless of N would make it free to bulk-apply to 50 people at once, which seems wrong given each is a real write |
| Remove employee from a site | Removes one site from one employee's `defaultSites` (`POST /api/employees/remove-site`) | Y, low | 0–1 (see note) | Same punitive-deletion concern as above |
| Upload job spec file (single) | Uploads one file to Vercel Blob storage, stores the URL on an employee (`POST /api/upload`, called from the employee modal) | Y — real storage cost | 2 | Actually costs Aya money (Blob storage + bandwidth), unlike pure-DB actions above — priced above the base DB-write actions to reflect that |
| Upload extra job spec files (multiple) | Same upload endpoint, called once per file when multiple are selected (`POST /api/upload`) | Y — same real cost, once per file | 2 per file | Natural unit is per file, same reasoning as the single upload |

## Import from history

| Action | What it does | Billable (Y/N + why) | Draft credit cost | Rationale |
|---|---|---|---|---|
| Search past appointments for import candidates | Read-only query across `production.appointments` + `production.deleted_appointments`, scoped to the user via `usersWhoCanManage.id` (`GET /api/import-employees`) | **Flagged, not decided**: this is a read, but potentially an expensive one — it scans every appointment the user has ever managed, across both collections, with no pagination | 0 or 1–2 (see "Ambiguous cases") | This is exactly the kind of read the prompt asked to call out explicitly rather than assume free. Could be justified as billable given the query cost on a large, unindexed-for-this-purpose collection, but charging just to *see* what could be imported (before committing anything) may discourage the feature's main value |
| Commit selected employees into roster | Writes N new `cp_companion.employees` documents from reviewed import candidates (`POST /api/import-employees/commit`) | Y — real writes, and this is the single biggest roster-building shortcut in the app | 1 credit per employee imported | Natural per-employee unit, same logic as "add employee" — but this is the app's flagship time-saving feature (avoiding retyping 40+ people), so worth Aya's explicit sign-off on whether it should be priced *lower* than manual add-one-at-a-time to reward using the bulk tool |

## Appointment creation (`/book`)

| Action | What it does | Billable (Y/N + why) | Draft credit cost | Rationale |
|---|---|---|---|---|
| Check booking availability for a clinic/date | Read-only query against `production.systemSettings` + `production.appointments` (`GET /api/booking-status`), used both live while booking and in the standalone "check any day" tool | N (recommended) | 0 | This is a safety/planning read explicitly meant to prevent wasted effort building an appointment that will be rejected — charging for it would discourage the exact behavior (checking before committing) the feature exists to encourage |
| Apply service selection to all selected employees | Client-side only — no API call, just local state | N | 0 | No server cost at all; purely a UI convenience over data the user already has |
| Add employees to appointment by occupation/group | Client-side only — no API call | N | 0 | Same as above |
| Generate + upload NDA PDF | Generates a PDF client-side (`jsPDF`) and uploads it to Blob storage (`POST /api/upload`) as part of accepting the NDA | Y — real storage cost, and mandatory before an appointment can be created | 2 | Same basis as job-spec-file upload — real Blob storage cost. Flagged: this is *mandatory*, not optional, so charging for it is effectively part of the cost of "create appointment" below — Aya may prefer to fold this into the appointment price rather than charge it separately |
| **Create appointment** | Validates shape, checks date/holiday and per-clinic per-day headcount limits, computes price from `MEDICAL_SERVICES`, inserts into `production.appointments`, updates `production.users.appointmentsManaging`, sends 2 Mailjet emails, logs to `cp_companion.auditLog` + `appointmentLog` (`POST /api/appointments`) | **Y, definitively — the highest-stakes single action in the app** | 15 | This is the one action that writes into ClinicPlus's own production database and triggers real emails (a real external cost via Mailjet) — per the prompt's own instruction, this belongs at or near the top of the pricing range. Also the one action a bogus/duplicate attempt could genuinely cost Aya real downstream cleanup, which the confirm-before-spending step (Part E) exists specifically to prevent |

## Insights

| Action | What it does | Billable (Y/N + why) | Draft credit cost | Rationale |
|---|---|---|---|---|
| View Insights page | Read-only aggregation across `production.appointments` + `production.deleted_appointments` for every appointment the user has managed (`GET /api/insights`), computed fresh on every page load — no caching | **Flagged, not decided** | 0 or 1 (see "Ambiguous cases") | This is a genuinely non-trivial read (full collection scans, in-memory aggregation across every historical appointment) that runs on *every visit* to the page, not just once — worth Aya deciding whether repeat views should cost something or whether this should be free/cached instead of priced |

## Auth

| Action | What it does | Billable (Y/N + why) | Draft credit cost | Rationale |
|---|---|---|---|---|
| Log in | Verifies bcrypt hash against `production.users`, read-only (`POST /api/auth/login`) | N | 0 | Never charge for authentication — this isn't a "value" action, it's a prerequisite for using the app at all |

---

## Ambiguous cases — flagged explicitly, not decided

1. **Deletions (remove employee, delete site, remove employee from site).** These are real writes,
   so the letter of "every action costs credits" would price them at 1 like every other write. But
   charging a user to delete their own mistake feels punitive rather than value-based, and could
   discourage keeping the roster clean. **Recommendation: make deletions free (0 credits)** —
   listed at 0–1 above rather than defaulting silently either way.

2. **Import search (`GET /api/import-employees`) and Insights (`GET /api/insights`).** Both are
   reads with real, non-trivial query cost (unindexed scans across potentially years of
   `production.appointments`/`deleted_appointments`), which is exactly the kind of read the
   original prompt said not to assume is free. Two ways to think about it:
   - Charge a small flat fee (1–2 credits) per lookup, since it does cost real compute/DB load.
   - Leave both free, on the theory that discouraging people from checking their own data (before
     importing, or just to see their own numbers) works against the app's value proposition, and
     the actual DB load is Aya's to absorb as a cost of running the product — the same way viewing
     a dashboard isn't normally billed per-view in most SaaS products.

   No recommendation made here — this is squarely the kind of call the prompt said was Aya's to
   make, not mine to assume.

3. **Bulk-add-to-site and import-commit are both quantity-based, not flat.** Both operate on N
   employees in a single user action. Pricing them flat (e.g. "5 credits no matter how many") would
   make bulk operations on 50 employees effectively free per person, while pricing per-employee
   (as proposed above) means a large bulk action costs proportionally more — worth Aya confirming
   this is the intended shape rather than a flat per-click price for convenience actions.

4. **NDA PDF generation/upload vs. "create appointment."** The NDA upload is mandatory before an
   appointment can be created — it's not an independent choice the user makes. Priced separately
   above (2 credits) for cost-accounting clarity, but Aya may prefer folding this into the
   appointment's total price (e.g. 15 → 17 combined) rather than showing it as two separate
   confirm-before-spending prompts in one flow, since Part E's own copywriting guidance says the
   confirm modal should be as plain and unhurried as possible — two confirms in a row for one
   logical action could work against that.

5. **Occupation/group "create" vs. "reuse."** The API already dedupes by case-insensitive name and
   returns the existing document on a match — this was built that way specifically so the
   creatable-select doesn't spam duplicates. It should follow that reuse is never billable, only
   genuine creation of a new value. Flagging this explicitly since it's the one place where "did
   this action actually write something new" isn't obvious from the endpoint name alone.

---

## Summary of what's confidently NOT billable

- Login
- Client-side-only conveniences with no API call (apply-services-to-all, add-by-occupation/group
  in the booking flow)
- Booking-status / availability checks (recommended free — actively encourages checking before
  committing, which protects users from the no-refunds appointment-creation cost)
- Reusing an existing occupation or employee group (only first-time creation should cost)

## Summary of what's confidently billable, high-confidence pricing

- **Create appointment: 15 credits** — the one action that writes into `production.*`, sends real
  emails, and is irreversible once submitted.
- File uploads (job spec, NDA PDF): 2 credits each — real Blob storage cost incurred per file.
- Roster writes (add employee, add site, create occupation/group): 1 credit each — trivial DB
  writes, priced low so the roster's core value (being populated) isn't itself a paywall.
