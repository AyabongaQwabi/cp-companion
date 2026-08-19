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
