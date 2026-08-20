export interface Site {
  id: string;
  name: string;
  hasAccessCard: boolean;
}

export interface Comment {
  id: string;
  message: string;
}

export interface AppointmentEmployee {
  id: string;
  name: string;
  idNumber: string;
  comments: Comment[];
  occupation: string;
  // { id, price } only — matches cp-redesign's services.js, which stores
  // omit(['info', 'title'], selectedItem). Do not add title/info here.
  services: { id: string; price: number }[];
  sites: Site[];
  isMinimized: boolean;
  dover: { required: boolean };
  xray: { required: boolean };
  jobSpecFile?: string;
  extraJobSpecFiles?: string[];
}

// One entry in AppointmentDocument.messages — confirmed against the real apps (not invented):
// appendMessageToAppointment in
// cp-redesign-admin/src/views/appointments/appointment/index.js:110-129 and the near-identical
// cp-redesign/src/pages/appointments/appointment/index.js:136-152. The whole appointment document
// (including the updated messages array) is re-sent via the UPDATE_APPOINTMENT socket event —
// there is no dedicated message-send event or separate messages collection server-side
// (clinicplus-server-latest-stable-version/lib/data/update/index.js:216-242 $sets the whole doc).
export interface AppointmentMessage {
  message: string;
  author: { id: string; name: string; role: string };
  // "YYYY-MM-DD HH:mm:ss" — matches moment().format(...) in the real apps exactly, not an ISO Date.
  createdAt: string;
}

export interface AppointmentDocument {
  id?: string;
  details: {
    company: { id: string; name: string };
    date: string;
    purchaseOrderNumber: string | null;
    companyNameOnMedical?: string;
    companyResponsibleForPayment?: string;
    clinic: string;
    ndaAccepted: boolean;
    ndaPdf?: string;
    employees: AppointmentEmployee[];
  };
  usersWhoCanEdit: { id: string; name: string }[];
  usersWhoCanManage: { id: string; name: string }[];
  payment: {
    proofOfPayment: string;
    amount: number;
  };
  isVoided: boolean;
  isComplete: boolean;
  tracking: { type: string; date: Date; doer: string }[];
  messages: AppointmentMessage[];
  status: 'pending' | 'approved' | 'declined';

  // --- Additive-only lifecycle enrichment fields, written exclusively by the daily
  // lifecycle-status job (src/lib/sync/lifecycle-status.ts). Never written by any user-facing
  // request path, and never read as a substitute for `status` by anything that still needs the
  // raw admin-set value. See that file's doc comment for the full rule set.
  lifecycleStatus?: 'expired' | 'approved' | 'completed';
  lifecycleStatusReason?: string;
  lifecycleStatusSetAt?: Date;
  pipelineComplete?: boolean;
  pipelineCompletedAt?: Date;
}

// cp_companion.employees — the roster (add-on's own data, separate from production).
// Scoped by userId, not companyId — a ClinicPlus user is not tied to a single company
// (usersWhoCanManage/usersWhoCanEdit on production.appointments can span several), so the
// roster belongs to the logged-in user, not to any one company they've booked for.
// _id is a string here because these types describe the JSON shape returned by the API
// (Mongo ObjectId is serialized to string); insertOne() calls omit _id and let Mongo assign it.
export interface RosterEmployee {
  _id?: string;
  userId: string;
  name: string;
  idNumber: string;
  occupation: string;
  defaultServices: string[];
  defaultSites: RosterEmployeeSite[];
  groupIds: string[];
  // production.companies ids this employee has been added to (Companies feature) — an employee
  // can belong to zero, one, or several companies, same shape as groupIds.
  companyIds: string[];
  jobSpecFile?: string;
  extraJobSpecFiles?: string[];
  notes?: string;
  // Replaces the old bare isArchived boolean. 'inactive' is what removing an employee produces
  // (same soft-delete behavior isArchived:true used to mean); 'terminated' is a new, distinct
  // state only ever set explicitly via a separate roster action, never implied by removal.
  status: 'active' | 'inactive' | 'terminated';
  createdAt: Date;
  updatedAt: Date;
}

// Embedded on RosterEmployee.defaultSites — same shape as the appointment-employee Site type
// (Part A #4: { id, name, hasAccessCard }), but scoped to the roster rather than one appointment.
export interface RosterEmployeeSite {
  id: string;
  name: string;
  hasAccessCard: boolean;
}

// cp_companion.sites — the user's site catalog (distinct from RosterEmployeeSite, which is
// the copy embedded per-employee once picked from this catalog).
export interface RosterSite {
  _id?: string;
  userId: string;
  name: string;
  hasAccessCard: boolean;
  createdAt: Date;
}

// cp_companion.occupations — per-user reusable, creatable list.
export interface Occupation {
  _id?: string;
  userId: string;
  title: string;
  createdAt: Date;
}

// cp_companion.employeeGroups — per-user reusable, creatable list (departments, shifts, etc).
export interface EmployeeGroup {
  _id?: string;
  userId: string;
  name: string;
  // Part F.3 — predefined services applied automatically when employees are bulk-added to an
  // appointment by this group (Part D's "add by group" action).
  defaultServiceIds: string[];
  createdAt: Date;
}

// cp_companion.creditWallets — Part E/F.1. Scoped per-user (production.users id), not per-company
// — the roster/occupations/groups/sites are all user-scoped already (Part D's userId-scoping
// decision), and most billable actions aren't tied to any one company, so a per-company wallet
// would leave no unambiguous wallet to debit for most actions. This deliberately diverges from
// Part E's original "one wallet per company" text — flagged and confirmed as a correction, not a
// silent default.
export interface CreditWallet {
  _id?: string;
  userId: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

// cp_companion.creditTransactions — append-only ledger, never mutated after insert (no refunds,
// enforced by there being no update/delete code path for these documents).
export interface CreditTransaction {
  _id?: string;
  userId: string;
  type: 'topup' | 'debit';
  // signed: positive for topup (including bonus), negative for debit.
  credits: number;
  action?: string; // actionKey from config/action-pricing.json, for debits
  balanceAfter: number;
  createdAt: Date;
  yoco?: { checkoutId: string; chargeId?: string; amountZAR: number };
}

// Runtime shape returned by config/action-pricing.json lookups. Pricing is not stored in DB.
export interface ActionPricing {
  _id?: string;
  actionKey: string;
  label: string;
  creditCost: number;
  isActive: boolean;
}

// cp_companion.companionUsers — Part F.5. Tracks which production.users people have logged into
// Companion before, so the one-time 50-credit signup bonus is granted exactly once per person.
// `role` defaults to 'company_user' for everyone; 'superadmin' is never self-service — it's seeded
// directly into the database for Aya's own production.users id only (see the superadmin gate on
// serviceValidityPeriods routes).
export interface CompanionUser {
  _id?: string;
  productionUserId: string;
  firstLoginAt: Date;
  signupBonusGrantedAt: Date;
  companyIdAtSignup?: string;
  role?: 'company_user' | 'superadmin';
  termsAcceptedAt?: Date;
  termsVersion?: string;
  emailConsent?: boolean;
}

// cp_companion.userPreferences — per-user app settings, currently just the
// confirm-before-spending toggle. Defaults to skipping the confirm step (autoConfirmSpend: true)
// for any user without a row here, so this collection only ever needs a row once a user actually
// opts back into confirming.
export interface UserPreferences {
  _id?: string;
  userId: string;
  autoConfirmSpend: boolean;
  updatedAt: Date;
}

// cp_companion.accountDeletionSchedule — Profile page's "delete ClinicPlus booking account"
// danger-zone flow. Scheduling this never touches production.users (see route comments) — only
// the background job in /api/cron/process-account-deletions does, once scheduledFor elapses and
// status is still 'pending'.
export interface AccountDeletionSchedule {
  _id?: string;
  userId: string;
  scheduledFor: Date;
  status: 'pending' | 'cancelled' | 'completed';
  requestedAt: Date;
  cancelledAt?: Date;
  completedAt?: Date;
}

// cp_companion.featureRequests — user-submitted product feedback from Companion settings.
export interface FeatureRequest {
  _id?: string;
  userId: string;
  userName: string;
  userEmail: string;
  title: string;
  description: string;
  impact?: string;
  status: 'new' | 'reviewed' | 'planned' | 'shipped' | 'declined';
  createdAt: Date;
}

// cp_companion.emailCampaignInvites — invite/enrollment state for lifecycle marketing campaigns.
// The actual email copy, timing, audience rules, and bonus amount live in
// config/marketing-campaigns.json so campaign strategy changes are reviewed as config changes.
export interface EmailCampaignInvite {
  _id?: unknown;
  campaignId: string;
  userId: string;
  userEmail: string;
  userName: string;
  token: string;
  firstLoginBonusCredits: number;
  enrolledAt: Date;
  clickedAt?: Date;
  lastClickedAt?: Date;
  bonusClaimedAt?: Date;
  nextStep: number;
  nextEmailDueAt?: Date;
  completedAt?: Date;
  unsubscribedAt?: Date;
  sent: {
    step: number;
    subject: string;
    sentAt: Date;
  }[];
}

// cp_companion.recurringBookingFlags — per-employee (optionally per-service) repeat-booking
// reminder. Never auto-creates an appointment; the UI only ever surfaces a prompt from this data,
// still requiring the full human confirm/NDA/job-spec flow to actually book. One row per
// (userId, rosterEmployeeId, serviceId) pairing — re-flagging updates the existing row.
export interface RecurringBookingFlag {
  _id?: string;
  userId: string;
  rosterEmployeeId: string;
  serviceId?: string;
  intervalMonths: number;
  lastAppointmentDate: string; // YYYY-MM-DD, seed value the reminder is computed from
  nextDueDate: string; // YYYY-MM-DD, = lastAppointmentDate + intervalMonths
  createdAt: Date;
  updatedAt: Date;
}

// cp_companion.serviceValidityPeriods — how long a given medical service stays valid before an
// employee needs to redo it. Left empty/unconfigured until Aya supplies real clinical values per
// service; a service with no row here is simply never tracked for expiry (never guess a default).
// `isDraft` marks a value seeded from reasoned-but-unconfirmed evidence (e.g. ClinicPlus's own
// "Medicals older than 6 months" exit-medical copy) rather than a clinical determination — every
// user-facing surface driven by this data must visibly flag draft rows until a superadmin clears
// the flag via the gated settings page.
export interface ServiceValidityPeriod {
  _id?: string;
  serviceId: string;
  validityMonths: number;
  isDraft: boolean;
  updatedAt: Date;
}

// cp_companion.complianceAlertsSent — dedup ledger for compliance expiry alert emails, keyed to
// the specific expiry cycle (rosterEmployeeId + serviceId + expiryDate) so a re-approval that
// shifts the expiry date correctly triggers a fresh alert cycle. Only written on a successful
// send — a skipped send (insufficient credits) writes no row here, so the cron retries daily
// until either sent or the expiry date passes.
export interface ComplianceAlertSent {
  _id?: string;
  rosterEmployeeId: string;
  serviceId: string;
  expiryDate: string; // YYYY-MM-DD
  userId: string; // roster owner, charged for the send
  sentAt: Date;
}

// production.companies — mirrors cp-redesign's saveNewCompany/updateCompany shape exactly (see
// clinincplus-server-latest-stable-version/lib/data/save/index.js and update/index.js). `id` is
// the business id (3-letter prefix + random code), distinct from Mongo's `_id`. Only `details`
// fields are ever edited from Companion; usersWhoCanEdit/usersWhoCanManage/messages/tracking are
// production-managed metadata we read but don't rewrite wholesale.
export interface Company {
  _id?: string;
  id: string;
  details: {
    name: string;
    registrationName?: string;
    registrationNumber?: string;
    vat?: string;
    physicalAddress?: string;
    postalAddress?: string;
  };
  usersWhoCanEdit: { id: string; name: string }[];
  usersWhoCanManage: { id: string; name: string }[];
  messages: unknown[];
  isDecomissioned: boolean;
  tracking: { type: string; date: Date; doer: string; entityId: string }[];
}

// production.users — mirrors saveNewUser/updateUser in
// clinicplus-server-latest-stable-version/lib/data/{save,update}/index.js exactly. `hash` is the
// bcrypt-nodejs hash used by the legacy server's own login/resetPassword; `password` is a
// pre-existing plaintext copy the legacy server also writes on every password change — Companion
// mirrors that pairing on its own password-change route rather than diverging from it, but this
// is flagged as a pre-existing bad practice, not something newly introduced here. `tracking` is
// real but only ever populated once at signup by the legacy server — never read or appended to by
// Companion or any app in this workspace, so it is NOT used as an append target here; profile and
// password changes are logged into cp_companion.auditLog instead (see profile/route.ts comments).
export interface ClinicPlusUserDocument {
  _id?: string;
  id: string;
  details: { name: string; surname: string; email: string; contactNumber?: string };
  hash: string;
  password: string;
  role: string;
  companiesManaging: { id: string; name: string }[];
  companiesCanEdit?: { id: string; name: string }[];
  appointmentsManaging?: string[];
  tracking?: { type: string; date: Date; entityId: string; doer: string }[];
}

// --- Section 0 (production-sync/enrichment pipeline) collections, all cp_companion-only ---
// Every collection below is written exclusively by the hourly sync job (src/lib/sync/*) and
// read-only everywhere else. None of these are ever written from a user-facing request path.

// cp_companion.syncLog — one row per pipeline run, across all sub-jobs in that run.
export interface SyncLogEntry {
  _id?: string;
  runId: string;
  startedAt: Date;
  finishedAt?: Date;
  status: 'running' | 'success' | 'partial' | 'failed';
  jobs: {
    name: string;
    processed: number;
    errors: number;
    durationMs: number;
  }[];
  error?: string;
}

// cp_companion.companyProfiles — one row per production.companies document, derived aggregates
// only. peerCohortKey is the input to section 1's benchmarking (employee-count band + dominant
// service type) — never exposed raw to any client, only used server-side to group cohorts.
export interface CompanyProfile {
  _id?: string;
  companyId: string; // production.companies.id
  companyName: string;
  totalHistoricalSpend: number;
  employeeCountTrend: { date: string; count: number }[]; // YYYY-MM, snapshotted per sync run
  currentEmployeeCount: number;
  dominantClinic: string | null;
  dominantServiceType: string | null;
  avgBookingIntervalDays: number | null;
  peerCohortKey: string; // e.g. "11-50|medical-fitness"
  firstSeenAt: Date;
  lastActiveAt: Date | null;
  lastSyncedAt: Date;
}

// cp_companion.bookingPatterns — per-company booking-cadence mining, feeds both a company's own
// Insights page and (aggregated across a cohort) section 1's cross-company benchmarks.
export interface BookingPattern {
  _id?: string;
  companyId: string;
  avgDaysBetweenBookings: number | null;
  seasonalMonthCounts: Record<string, number>; // "01".."12" -> appointment count, all-time
  avgEmployeesPerBooking: number | null;
  serviceMix: Record<string, number>; // serviceId -> count across all bookings
  // x-ray is a separate employee.xray.required flag, not a MEDICAL_SERVICES id, so it can't live
  // in serviceMix — tracked as its own fraction for the section-1 x-ray attach-rate benchmark.
  xrayAttachRate: number; // fraction of this company's bookings (0-1) that included an x-ray
  lastSyncedAt: Date;
}

// cp_companion.complianceStatusCache — precomputed per-employee expiry status, mirroring
// computeRosterCompliance's ComplianceStatus shape so dashboards can read this instead of
// recomputing live. Keyed by rosterEmployeeId + serviceId, same identity as ComplianceAlertSent.
export interface ComplianceStatusCache {
  _id?: string;
  rosterEmployeeId: string;
  userId: string;
  serviceId: string;
  status: 'valid' | 'expiring-soon' | 'expired';
  expiryDate: string | null;
  isDraft: boolean;
  lastSyncedAt: Date;
}

// cp_companion.dataQualitySweep — platform-wide name-variant/ID-checksum flags, superadmin-only.
export interface DataQualityFlag {
  _id?: string;
  companyId: string;
  rosterEmployeeId?: string;
  flagType: 'name-variant' | 'id-checksum';
  detail: string;
  lastSyncedAt: Date;
}

// cp_companion.dormancyFlags — companies quiet relative to their own historical cadence.
// Superadmin-only outreach list, never surfaced to the client themselves.
export interface DormancyFlag {
  _id?: string;
  companyId: string;
  companyName: string;
  avgBookingIntervalDays: number;
  daysSinceLastBooking: number;
  lastBookingDate: string | null;
  flaggedAt: Date;
}

// cp_companion.newCompanyLeads — production.companies documents the sync job first saw this run.
// Superadmin-only running list of ClinicPlus companies not yet on Companion.
export interface NewCompanyLead {
  _id?: string;
  companyId: string;
  companyName: string;
  firstSeenAt: Date;
  isOnCompanion: boolean; // true once any production.users linked to this company has a companionUsers row
}

// cp_companion.anomalyFlags — production.appointments whose stored payment.amount doesn't match
// what calculateBookingPrice() recomputes from the same document's employees/dover/xray. Internal
// correctness check, superadmin-only, never client-facing.
export interface AnomalyFlag {
  _id?: string;
  appointmentId: string;
  companyId: string | null;
  storedAmount: number;
  recomputedAmount: number;
  difference: number;
  flaggedAt: Date;
}

// cp_companion.adoptionMetrics — one row per sync run, platform-wide Companion-vs-direct
// appointment volume split. Superadmin-only headline metric.
export interface AdoptionMetric {
  _id?: string;
  computedAt: Date;
  totalAppointments: number;
  companionCreatedAppointments: number;
  adoptionRate: number; // companionCreatedAppointments / totalAppointments
}

// cp_companion.financeAnalyticsCache — one row per (type, month) the admin Analytics page has
// requested, replacing the legacy GET_FINANCE_ANALYTICS socket handler (which loaded the entire
// month's appointments plus full companies/users collections into memory on every request and
// took minutes). Refreshed by the hourly sync job for the current and previous month only —
// finance analytics is not same-day-sensitive the way dashboard stats are, so hourly staleness is
// acceptable. Keyed by monthKey ("YYYY-MM") + type so x-ray-admin and all-clinics views don't
// collide.
export interface FinanceAnalyticsCache {
  _id?: string;
  monthKey: string; // "YYYY-MM"
  type: 'all' | 'x-rays';
  hendrina: ClinicMonthAnalytics;
  churchill: ClinicMonthAnalytics;
  allClinics: ClinicMonthAnalytics;
  companiesJoined: Record<string, number>; // date (YYYY-MM-DD) -> count of companies created that day
  usersJoined: Record<string, number>; // date (YYYY-MM-DD) -> count of client users created that day
  lastSyncedAt: Date;
}

export interface ClinicMonthAnalytics {
  appointments: Record<string, number>; // date -> count
  employeesCateredTo: Record<string, number>; // date -> count
  amountsMade: Record<string, number>; // date -> sum of payment.amount
  servicesPerformed: Record<string, number>; // date -> count
}

// cp_companion.companyCompliancePreferences — Section 2's per-company opt-in for the public
// compliance verification page. One row per companyId; absence of a row (or publicPageEnabled:
// false) means the public page must 404, never silently render with defaults. publicToken is
// generated once, on first opt-in, and is the only way to reach the public page — never the
// companyId itself, so a guessable ClinicPlus company id can't be used to probe compliance data.
export interface CompanyCompliancePreferences {
  _id?: string;
  companyId: string;
  publicPageEnabled: boolean;
  publicToken: string | null;
  enabledAt: Date | null;
  enabledByUserId: string | null;
}

// --- Admin: Employee directory (backfilled from production.appointments.details.employees) ---
// Deliberately separate from cp_companion.employees (the roster, keyed by userId — a Companion
// user's own employee list they manage) — this is a platform-wide directory of every employee
// ever seen across ALL appointments, for the admin portal, keyed by a derived identity rather
// than any one user's roster membership. Backfilled by scripts/backfill-employee-directory.mjs.

// cp_companion.employeeDirectory — one row per distinct employee identity.
export interface EmployeeDirectoryEntry {
  _id?: string;
  // Primary key when available: the SA ID number / passport string exactly as stored on
  // appointments (not normalized beyond trim) — this is what real appointment documents use to
  // represent "the same person" across bookings, so it's the strongest identity signal we have
  // short of a dedicated employee-master-data system that doesn't exist in this codebase.
  idNumber: string | null;
  // Fallback identity when idNumber is missing/empty on every appointment this employee appears
  // on: lowercased, whitespace-collapsed name. Never used to merge two records that both HAVE an
  // idNumber, even if the names differ — idNumber is authoritative whenever present on either side.
  nameKey: string;
  displayName: string; // most-recently-seen casing of the name, for display only
  matchedBy: 'idNumber' | 'nameOnly';
  // 'verified' = matched by idNumber (or a validated ID checksum). 'unverified' = matched by
  // name only, meaning two different real people with the same name could have been merged into
  // one directory row — surfaced in the UI so admins don't treat it as ground truth.
  matchConfidence: 'verified' | 'unverified';
  idNumberValid: boolean | null; // isValidSouthAfricanId() result; null = not a 13-digit number (assumed passport)
  dateOfBirth: string | null; // YYYY-MM-DD, only set when idNumberValid === true
  age: number | null; // only set when idNumberValid === true
  gender: 'male' | 'female' | null; // only set when idNumberValid === true
  occupations: string[]; // distinct occupation strings seen across their appointments
  firstSeenAt: string; // earliest details.date this employee appears on (YYYY-MM-DD)
  lastSeenAt: string; // latest details.date this employee appears on (YYYY-MM-DD)
  appointmentIds: string[]; // production.appointments.id values this employee appears on
  lastSyncedAt: Date;
}

// cp_companion.employeeStats — one row per EmployeeDirectoryEntry._id, derived aggregates.
// Split from EmployeeDirectoryEntry so the backfill can cheaply re-derive stats without
// re-running identity resolution, and so the two concerns (who is this person vs. how have they
// performed) stay independently extendable.
export interface EmployeeStats {
  _id?: string;
  employeeDirectoryId: string; // EmployeeDirectoryEntry._id
  totalAppointments: number;
  // Paid = approved, unpaid = not approved (pending or declined) — per the platform-wide rule
  // that payment status is inferred exclusively from appointment.status, never from any other
  // field (payment.amount can be nonzero on a pending/declined appointment; that is not payment).
  paidAppointments: number;
  unpaidAppointments: number;
  totalRevenue: number; // sum of payment.amount across paid (approved) appointments only
  monthlyTrend: { month: string; appointments: number; revenue: number }[]; // month = "YYYY-MM", paid appointments/revenue only
  topCompanies: { companyId: string; companyName: string; appointmentCount: number }[]; // sorted desc by appointmentCount, top 5
  lastSyncedAt: Date;
}

// --- Admin: Site directory (backfilled/synced from production.appointments.details.employees[].sites[]) ---
//
// IMPORTANT domain distinction — do not confuse with either of these unrelated things that also
// go by "site"/"location" in this codebase:
//   1. ClinicPlus's own two physical clinics ("Hendrina" and "Churchill" — config/clinics.json,
//      CLINIC_LOCATIONS in clinicplus-constants.ts, systemSettings.limits.Hendrina/.Churchill,
//      already served by /api/admin/availability/capacity + src/lib/availability.ts). Unrelated.
//      Confusingly, a client worksite can be named e.g. "Hendrina Colliery" — same word, unrelated
//      entity; this directory is about the worksite, never the clinic.
//   2. cp_companion.sites (RosterSite, above) — a single company contact's own personal,
//      userId-scoped convenience list of site names for quick-fill on the booking form. This new
//      directory is platform-wide (not scoped to one user/company) and is a derived analytics
//      view built from real appointment history, not a hand-maintained personal list. The two
//      collections are intentionally never cross-referenced.
//
// One row per distinct real-world client worksite (e.g. a mine, a plant) that has appeared in at
// least one appointment's details.employees[].sites[]. Populated/refreshed hourly by
// syncSiteDirectory (src/lib/sync/site-directory.ts). Admin-portal only.
export interface SiteDirectoryEntry {
  _id?: string;
  name: string; // most-recently-seen casing/spelling, for display
  normalizedNameKey: string; // trim + lowercase + collapse internal whitespace — the dedup/match key this row is upserted on
  companyIds: string[]; // distinct production.companies.id values whose appointments have referenced this site
  firstSeenAt: Date;
  lastUsedAt: Date;
  appointmentCount: number; // running count of appointments (not employees) referencing this site at least once
  // --- Admin-editable metadata. Never auto-derived from production data — every field here
  // defaults to null (or [] for none-set) until an admin explicitly fills it in via PATCH
  // /api/admin/sites/[id]. The sync job must never overwrite any of these once set.
  address: string | null;
  gpsCoordinates: { lat: number; lng: number } | null;
  region: string | null;
  siteType: string | null;
  // Optional daily-appointment-style cap, FOR FUTURE USE ONLY — deliberately not wired into any
  // capacity/availability logic. Unrelated to systemSettings.limits.Hendrina/.Churchill and to
  // src/lib/availability.ts; do not let this field influence booking availability anywhere.
  capacity: number | null;
  onSiteContactName: string | null;
  onSiteContactPhone: string | null;
  accessRequirements: string | null;
  accessCardTypicallyRequired: boolean | null;
  notes: string | null;
  // 'dormant' when this site's own days-since-lastUsedAt exceeds 2x its own historical average
  // booking interval — same DORMANCY_MULTIPLIER logic as dormancy.ts, scoped to this site's own
  // cadence rather than a company's. See computeSiteStatus in site-directory.ts for the exact
  // (simplified) heuristic used, since a site's true per-visit interval isn't cheaply computable
  // in this job the way a company's is — documented there.
  status: 'active' | 'dormant';
  lastSyncedAt: Date;
}

// cp_companion.siteDirectoryDuplicateFlags — review queue for near-identical site names (e.g.
// "Hendrina" vs "hendrina mine" vs "Hendrina Colliery") surfaced by syncSiteDirectory's fuzzy
// pass over normalizedNameKey. Deliberately NOT auto-merged — a wrong merge silently corrupts
// appointmentCount/companyIds history for two genuinely different sites, which is worse than
// leaving a duplicate unresolved. Resolved only via POST /api/admin/sites/merge (status:
// 'merged') or the dismiss route (status: 'dismissed', "these are actually different sites").
export interface SiteDirectoryDuplicateFlag {
  _id?: string;
  siteIdA: string; // SiteDirectoryEntry._id (string form)
  siteIdB: string; // SiteDirectoryEntry._id (string form)
  nameA: string;
  nameB: string;
  // Token-overlap (Jaccard-style) similarity in [0, 1] — see computeSimilarity in
  // site-directory.ts for the exact method and why it was chosen over edit-distance.
  similarityScore: number;
  status: 'pending' | 'merged' | 'dismissed';
  flaggedAt: Date;
  resolvedAt?: Date;
  resolvedByAdminId?: string;
}

// --- Admin: Messaging thread management (per-appointment) ---
// cp_companion.appointmentThreadMeta — one row per appointment that an admin has touched from the
// Messaging page (status set, or an internal note added). Absence of a row means the thread has
// never been triaged — the UI must treat that as 'open', not assume a default silently.
export type ThreadStatus = 'open' | 'needs_follow_up' | 'resolved';

export interface AppointmentThreadMeta {
  _id?: string;
  appointmentId: string; // production.appointments.id
  status: ThreadStatus;
  updatedAt: Date;
  updatedByAdminId: string;
}

// cp_companion.appointmentInternalNotes — append-only, admin-staff-only notes on an appointment's
// thread. Never surfaced to the client/user — a completely separate collection from
// production.appointments.messages (the client-visible thread) so there is no code path that
// could accidentally leak a note into the client-visible array.
export interface AppointmentInternalNote {
  _id?: string;
  appointmentId: string;
  note: string;
  authorAdminId: string;
  authorAdminName: string;
  createdAt: Date;
}

// --- New centralized audit-event system (cp_companion.audit_events) ---
// This is deliberately a SEPARATE system from cp_companion.auditLog (camelCase collection, ~15
// ad hoc write sites across appointments/companies/profile routes — see audit-log/route.ts) and
// from production.appointments[].tracking / production.companies[].tracking (written only by the
// legacy clinicplus-server-latest-stable-version Express/Socket.IO server, never by this repo).
// None of those are touched, removed, or renamed by this addition — audit-log/route.ts keeps
// merging them exactly as before. audit_events (snake_case, on purpose, to stay visually distinct
// from auditLog) is meant to eventually be the one place all audit-worthy activity — new writes
// from this app, cp-redesign, cp-redesign-admin, AND a backfilled/re-synced copy of the legacy
// .tracking data (see scripts/backfill-audit-events.mjs and src/lib/audit-legacy-sync.ts) — lives
// together, so a single entity or actor timeline can be read from one collection.
//
// entityType is intentionally limited to the three production entities that have a real
// create/update/delete-style lifecycle and existing .tracking precedent (appointment, company,
// user). Other collections in this file (RosterEmployee, EmployeeGroup, CreditTransaction, etc.)
// are cp_companion-only, already have their own audit trail shape (e.g. CreditTransaction), or
// don't have an equivalent lifecycle — extend this union later only once a concrete need shows up
// rather than speculatively now.
export type AuditEntityType = 'appointment' | 'user' | 'company';

// actorType 'system' covers events with no human actor (e.g. cron-driven state changes, or
// legacy-import rows where the original tracking entry had no doer). actorId/actorName are
// nullable for exactly that case.
export type AuditActorType = 'user' | 'admin' | 'system';

// Free-form string, not a strict union, so a new call site can log a new action without a type
// change here — but the expected vocabulary is documented so consumers (e.g. cp-redesign-admin's
// timeline UI) can build a stable icon/label map instead of falling back to a raw string for
// everything. This list is a superset of the real legacy .tracking `type` values (left column)
// plus the richer action vocabulary the new system adds (right column) — legacy values are passed
// through into `action` completely unchanged during import, never renamed/mapped, so the same
// action string always means the same thing whether it came from today's write or a 2019 import:
//   Legacy (.tracking type, passed through as-is):      New (used by cp-companion/cp-redesign/-admin):
//   USER_SIGNUP                                          created
//   CREATED                                              updated
//   ADD_NEW_APPOINTMENT_TO_MANAGE                         field_changed
//   ADD_NEW_COMPANY_TO_MANAGE                             status_changed
//   ADD_NEW_MANAGER                                       approved
//   REMOVE_APPOINTMENT_FROM_MANAGER                       declined
//   REMOVE_COMPANY_FROM_MANAGER                            cancelled
//   REMOVE_MANAGER                                        deleted
//                                                          message_sent
//                                                          login
//                                                          manager_added
//                                                          manager_removed
export type AuditAction = string;

// cp_companion.audit_events. id is a crypto.randomUUID() string (matches the id-generation
// pattern used elsewhere in this codebase, e.g. src/lib/yoco.ts's transaction ids and the
// `GEN-${crypto.randomUUID()}` idNumber fallback in employees/import routes) — NOT the Mongo
// _id, so callers/consumers can reference a stable id without depending on ObjectId serialization
// (the same rationale as RosterEmployee's string _id comment above).
//
// changes: documented shape is an array of per-field diffs, `{ field, before, after }[]` — chosen
// over a single `{ before, after }` object because most real edits here (status changes, field
// edits) touch one or two fields, and an array lets a timeline UI render "status: pending →
// approved" per line without re-diffing two arbitrary objects. Optional — omitted for events with
// no meaningful diff (e.g. created, message_sent, login).
//
// metadata: free-form, action-specific extra context (e.g. companyId for an appointment event so
// GET /api/audit/events can filter by company without a schema change — see route comments;
// or the legacy tracking entry's own `entityId` field for legacy-import rows, since in legacy
// company/appointment tracking that field sometimes names a *different* related entity, e.g. the
// user being added as a manager, which must never collide with this document's own top-level
// entityId).
export interface AuditEvent {
  id: string;
  entityType: AuditEntityType;
  entityId: string; // the primary entity's own id (appointment.id / company.id / user.id) — never a related entity's id, see metadata above for that case
  action: AuditAction;
  actorType: AuditActorType;
  actorId: string | null;
  actorName: string | null;
  changes?: { field: string; before: unknown; after: unknown }[];
  metadata?: Record<string, unknown>;
  source: 'cp-redesign' | 'cp-redesign-admin' | 'legacy-import' | 'system';
  createdAt: Date;
}

// --- cp_companion.invoices: authoritative invoice/quote records, computed server-side ---
// Replaces the legacy round-trip where cp-redesign-admin's/cp-redesign's quote page generated a
// fresh `uuid()` invoiceId on every mount (never persisted, never idempotent — two PDF downloads
// of the same appointment got two different "invoice numbers") and emitted SEND_INVOICE to the
// legacy clinicplus-server-latest-stable-version Express/Socket.IO server, which appended a doc
// (shape: { appointment, company, client, payment: { amount }, url, date }) to its own legacy
// invoices collection — read here for the field names cp-redesign-admin's invoices list view
// (src/views/invoices/index.js) already expected, but NOT the source of truth going forward.
// That legacy handler is left completely untouched (out of scope, and other consumers may still
// read it) — this collection is a new, parallel, authoritative record populated by
// POST /api/admin/invoices, and GET /api/admin/invoices/compute is the only place `amount` is
// ever computed, always via calculateBookingPrice() (src/lib/pricing.ts) so it can never drift
// from the same formula the anomaly-watchdog uses to flag legacy payment.amount mismatches.
//
// amount is typed as a plain `number`, never optional/nullable: every write path that produces an
// Invoice document MUST catch pricing computation failures before insert (see compute/route.ts's
// try/catch around calculateBookingPrice) rather than ever persisting a doc whose amount could be
// undefined — the client's `formatPrice` calls `.toFixed(2)` directly on this field with no
// runtime guard, so an undefined amount here would crash the whole invoices list render exactly
// like the pre-fix cp-redesign-admin bug this collection exists to eliminate.
export interface Invoice {
  _id?: string;
  // Stable, human-readable, generated once per appointment and reused on every subsequent
  // lookup/re-fetch (see compute/route.ts's find-or-create). Scheme: `INV-{year}-{6 hex chars
  // derived from appointmentId}` — deterministic from appointmentId (not a random uuid) so the
  // *same* appointment always resolves to the *same* invoiceId even if the compute endpoint's
  // find-or-create races or is called before the DB write is visible, without needing a separate
  // counter/sequence collection. {year} is the year the invoice number was first generated (not
  // necessarily the appointment date), matching how a real invoice-numbering scheme is normally
  // read (year the invoice was raised).
  invoiceId: string;
  appointmentId: string; // production.appointments.id
  companyId: string; // production.appointments.details.company.id
  companyName: string; // production.appointments.details.company.name, denormalized for list/search display
  // Best available proxy for "the client" on an appointment document, which has no dedicated
  // client/createdBy field — production.appointments.usersWhoCanEdit[0] (the booking's primary
  // owner), matching the same usersWhoCanEdit/usersWhoCanManage[0] convention already used
  // elsewhere in this codebase (e.g. admin/messaging/threads/route.ts's userName). Assumption,
  // documented here since AppointmentDocument itself does not name a canonical "client" field.
  clientUserId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  amount: number; // ALWAYS a number — see class docblock above. Equal to servicesBreakdown.grandTotal.
  servicesBreakdown: {
    // Per selected MEDICAL_SERVICES id (see clinicplus-constants.ts), mirrors the quote page's
    // "Service prices" section: how many employees have that service, and the subtotal charged.
    services: { serviceId: string; title: string; count: number; subtotal: number }[];
    servicesSubtotal: number;
    doverEmployeeCount: number;
    doverSubtotal: number;
    xrayEmployeeCount: number;
    xraySubtotal: number;
    // servicesSubtotal + doverSubtotal + xraySubtotal — always equal to calculateBookingPrice()'s
    // return value and to the top-level `amount` field above.
    grandTotal: number;
  };
  pdfUrl: string | null; // set once the client uploads the generated PDF; null for a computed-but-not-yet-sent invoice
  sentAt: Date;
  sentByActorId: string | null; // admin id, or null for a legacy-import/system row
  sentByActorName: string | null;
  emailedTo: string[];
}
