import type { Db } from 'mongodb';
import type { SiteDirectoryEntry, SiteDirectoryDuplicateFlag } from '../types';

/**
 * cp_companion.siteDirectory — platform-wide directory of real-world client worksites, mined from
 * production.appointments.details.employees[].sites[] (the free-text {id, name, hasAccessCard}
 * entries typed per-employee on a booking — see the Site interface in types.ts). NOT the same
 * thing as ClinicPlus's own two physical clinics ("Hendrina"/"Churchill" — config/clinics.json,
 * CLINIC_LOCATIONS, systemSettings.limits, availability.ts) and NOT the same collection as
 * cp_companion.sites (RosterSite — one user's personal roster convenience list). See the
 * SiteDirectoryEntry doc comment in types.ts for the full disambiguation. This job never writes
 * to production and never touches clinic capacity/availability data.
 *
 * Scope choice — full scan, not incremental-since-cutoff:
 * runSyncPipeline already computes changedAppointmentIds (appointments whose tracking[] moved
 * since the last successful run — see sync/index.ts) and this job accepts that same list so it
 * CAN run incrementally. But unlike syncCompanyProfiles (which is keyed by companyId and only
 * needs to touch the small number of companies that changed), a site's identity here is a
 * normalized name that any appointment, for any company, could reference — there's no cheap
 * "which sites changed" filter upstream of scanning appointments themselves. Given
 * syncDataQualitySweep and syncComplianceCache already do full/near-full scans every hour without
 * an incremental cutoff (see their file headers), and appointment volume here is the same order
 * of magnitude, a full scan of approved appointments is the simpler, defensible choice — it keeps
 * the job correct even if an appointment's sites[] were edited without changing
 * details.company.id (which wouldn't show up in getChangedAppointmentCompanyIds). If
 * changedAppointmentIds is passed and non-empty, we still use it to scope the *upsert* pass for
 * speed (cheaper on typical hourly runs where little changed), but the dedup/status passes below
 * always operate over the full siteDirectory collection regardless, since duplicate detection and
 * dormancy are properties of the whole directory, not of one run's delta.
 */

const DORMANCY_MULTIPLIER = 2; // matches dormancy.ts's own constant, applied to a site's own cadence instead of a company's

// Above this many distinct sites, the O(n^2) pairwise duplicate-detection pass below should be
// replaced with a blocking strategy (e.g. bucket by first 3 chars of normalizedNameKey, or a
// trigram index) rather than comparing every pair. At a few thousand distinct site names this is
// still comfortably sub-second; flagging here so it's not silently forgotten if the directory
// grows far beyond what a single hourly job should spend on it.
const PAIRWISE_DEDUP_WARN_THRESHOLD = 3000;

const SIMILARITY_THRESHOLD = 0.6; // see computeSimilarity — token-overlap ratio in [0, 1]

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Token-overlap (Jaccard) similarity over whitespace-split words of the normalized names, chosen
 * over edit-distance/Levenshtein because site names are short multi-word phrases where word order
 * and extra qualifier words ("mine", "colliery", "plant") matter more than character-level
 * closeness — "Hendrina" vs "Hendrina Colliery" share the whole first token and should score high,
 * while a pure Levenshtein ratio penalizes the length difference heavily. Returns |A∩B| / |A∪B|.
 */
function computeSimilarity(nameA: string, nameB: string): number {
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

/**
 * Scans production.appointments (optionally scoped to changedAppointmentIds when provided and
 * non-empty) and aggregates every details.employees[].sites[] entry into a per-normalized-name
 * summary, then upserts into cp_companion.siteDirectory. Only approved appointments count toward
 * appointmentCount/companyIds/lastUsedAt — matches the platform-wide convention (see AnomalyFlag,
 * CompanyProfile) that "did this actually happen" is read from appointment.status === 'approved',
 * not merely "was a booking submitted".
 */
export async function syncSiteDirectory(
  prodDb: Db,
  companionDb: Db,
  changedAppointmentIds?: string[]
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  const matchStage: Record<string, unknown> = { status: 'approved' };
  if (changedAppointmentIds && changedAppointmentIds.length > 0) {
    matchStage.id = { $in: changedAppointmentIds };
  }

  const directory = companionDb.collection<SiteDirectoryEntry>('siteDirectory');

  try {
    // Grouping/normalization (lowercase + whitespace-collapse) is done in JS below rather than in
    // the aggregation pipeline — a raw projected fetch keeps this simple and Mongo-version-safe,
    // and appointment volume here is the same order of magnitude as syncDataQualitySweep's
    // full-collection scans, so the extra round trip cost is in line with existing jobs.
    const rawDocs = await prodDb
      .collection('appointments')
      .find(matchStage)
      .project({ id: 1, 'details.date': 1, 'details.company.id': 1, 'details.employees.sites': 1 })
      .toArray();

    const bucket = new Map<
      string,
      { name: string; companyIds: Set<string>; appointmentIds: Set<string>; dates: string[] }
    >();

    for (const doc of rawDocs) {
      const companyId = (doc as { details?: { company?: { id?: string } } }).details?.company?.id;
      const date = (doc as { details?: { date?: string } }).details?.date;
      const appointmentId = (doc as { id?: string }).id;
      const employees = (doc as { details?: { employees?: { sites?: { name?: string }[] }[] } }).details
        ?.employees;
      if (!employees) continue;

      // A site referenced by multiple employees on the same appointment should only count once
      // toward this appointment's contribution — track seen normalized keys per-appointment.
      const seenThisAppointment = new Set<string>();

      for (const employee of employees) {
        for (const site of employee.sites || []) {
          const rawName = (site?.name || '').trim();
          if (!rawName) continue;
          const key = normalizeName(rawName);
          if (!key) continue;

          if (!bucket.has(key)) {
            bucket.set(key, { name: rawName, companyIds: new Set(), appointmentIds: new Set(), dates: [] });
          }
          const entry = bucket.get(key)!;
          entry.name = rawName; // last-seen casing wins, matches EmployeeDirectoryEntry.displayName convention
          if (companyId) entry.companyIds.add(companyId);
          if (appointmentId && !seenThisAppointment.has(key)) {
            entry.appointmentIds.add(appointmentId);
            seenThisAppointment.add(key);
          }
          if (date) entry.dates.push(date);
        }
      }
    }

    if (bucket.size === 0) return { processed: 0, errors: 0 };

    const keys = Array.from(bucket.keys());
    const existing = await directory.find({ normalizedNameKey: { $in: keys } }).toArray();
    const existingByKey = new Map(existing.map((e) => [e.normalizedNameKey, e]));

    const now = new Date();
    const operations = [];

    for (const [key, agg] of bucket.entries()) {
      try {
        const prior = existingByKey.get(key);
        const sortedDates = agg.dates.filter(Boolean).sort();
        const lastUsedAt = sortedDates.length > 0 ? new Date(sortedDates[sortedDates.length - 1]) : now;
        const mergedCompanyIds = new Set([...(prior?.companyIds || []), ...agg.companyIds]);

        // appointmentCount is a running total across all-time appointments, not just this batch —
        // when running incrementally (changedAppointmentIds scoped), agg.appointmentIds only
        // covers the changed subset, so we must ADD to the prior count rather than replace it. On
        // a full scan (no changedAppointmentIds), agg.appointmentIds already covers everything, so
        // treat it as the authoritative count instead of double-adding on every hourly run.
        const isIncremental = Boolean(changedAppointmentIds && changedAppointmentIds.length > 0);
        const appointmentCount = isIncremental
          ? (prior?.appointmentCount ?? 0) + agg.appointmentIds.size
          : agg.appointmentIds.size;

        operations.push({
          updateOne: {
            filter: { normalizedNameKey: key },
            update: {
              $set: {
                name: agg.name,
                normalizedNameKey: key,
                companyIds: Array.from(mergedCompanyIds),
                lastUsedAt,
                appointmentCount,
                lastSyncedAt: now,
              },
              $setOnInsert: {
                firstSeenAt: sortedDates.length > 0 ? new Date(sortedDates[0]) : now,
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
                status: 'active' as const,
              },
            },
            upsert: true,
          },
        });
        processed++;
      } catch {
        errors++;
      }
    }

    if (operations.length > 0) {
      await directory.bulkWrite(operations, { ordered: false });
    }
  } catch {
    errors++;
  }

  // --- Dormancy status pass — always runs over the full directory, independent of scope above.
  try {
    await computeDormancyStatus(companionDb);
  } catch {
    errors++;
  }

  // --- Fuzzy-duplicate detection pass — always runs over the full directory.
  try {
    await detectDuplicates(companionDb);
  } catch {
    errors++;
  }

  return { processed, errors };
}

/**
 * Dormancy heuristic for a site (simplified relative to dormancy.ts's company-level version):
 * a company's avgBookingIntervalDays is mined from that company's own full appointment-date
 * history (see company-profiles.ts's computeAvgIntervalDays over all its booking dates). Doing
 * the equivalent per-site here would mean re-aggregating every appointment date each site was
 * referenced on, which this job doesn't retain (siteDirectory only stores firstSeenAt/lastUsedAt,
 * not every individual visit date) — recomputing that per-run would mean re-scanning all
 * appointments a second time just for this, which isn't worth it for what is explicitly a
 * lower-stakes, admin-review-queue signal (per the task's own framing).
 *
 * The heuristic used instead: average interval = (lastUsedAt - firstSeenAt) / max(appointmentCount
 * - 1, 1) — i.e. spread the site's total observed lifespan evenly across its appointment count.
 * This is an approximation (assumes roughly even spacing rather than the true booking calendar)
 * but requires no extra data beyond what's already stored on the row, and is documented here so a
 * future author knows it's intentionally a heuristic, not the same rigor as company dormancy.
 * Same 2x-multiplier threshold and same "needs at least 2 appointments to have a cadence at all"
 * guard as dormancy.ts.
 */
async function computeDormancyStatus(companionDb: Db): Promise<void> {
  const directory = companionDb.collection<SiteDirectoryEntry>('siteDirectory');
  const sites = await directory.find({}).toArray();
  const now = new Date();
  const operations = [];

  for (const site of sites) {
    const lifespanDays = Math.max(
      0,
      (new Date(site.lastUsedAt).getTime() - new Date(site.firstSeenAt).getTime()) / 86400000
    );
    const intervalCount = Math.max(site.appointmentCount - 1, 1);
    const avgIntervalDays = site.appointmentCount >= 2 ? lifespanDays / intervalCount : null;

    let status: SiteDirectoryEntry['status'] = 'active';
    if (avgIntervalDays !== null && avgIntervalDays > 0) {
      const daysSinceLastUse = (now.getTime() - new Date(site.lastUsedAt).getTime()) / 86400000;
      const threshold = avgIntervalDays * DORMANCY_MULTIPLIER;
      if (daysSinceLastUse > threshold) status = 'dormant';
    }

    if (status !== site.status) {
      operations.push({
        updateOne: { filter: { _id: site._id as never }, update: { $set: { status } } },
      });
    }
  }

  if (operations.length > 0) {
    await directory.bulkWrite(operations, { ordered: false });
  }
}

/**
 * Bounded pairwise comparison over the full directory — see PAIRWISE_DEDUP_WARN_THRESHOLD above
 * for the complexity note. Skips pairs that already have a non-pending resolution recorded (an
 * admin who dismissed "Hendrina" vs "Hendrina Colliery" as genuinely-different sites should never
 * see that pair resurface), and skips re-inserting a flag that's still pending (upserted instead,
 * so similarityScore/names stay fresh without duplicating rows across runs).
 */
async function detectDuplicates(companionDb: Db): Promise<void> {
  const directory = companionDb.collection<SiteDirectoryEntry>('siteDirectory');
  const flags = companionDb.collection<SiteDirectoryDuplicateFlag>('siteDirectoryDuplicateFlags');

  const sites = await directory.find({}).project({ name: 1, normalizedNameKey: 1 }).toArray();
  if (sites.length < 2) return;

  if (sites.length > PAIRWISE_DEDUP_WARN_THRESHOLD) {
    // Not fatal — just means this run will be noticeably slower (O(n^2)). Left as a no-op guard
    // rather than skipping detection outright; if this ever fires in practice, replace the
    // pairwise loop below with a blocking strategy (see PAIRWISE_DEDUP_WARN_THRESHOLD comment).
  }

  // Resolved pairs (merged/dismissed) must never be re-flagged — build a lookup of resolved
  // unordered id-pairs to skip.
  const resolved = await flags
    .find({ status: { $in: ['merged', 'dismissed'] } })
    .project({ siteIdA: 1, siteIdB: 1 })
    .toArray();
  const resolvedPairKeys = new Set(
    resolved.map((f) => [f.siteIdA, f.siteIdB].sort().join('::'))
  );

  const now = new Date();
  const operations = [];

  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      const a = sites[i];
      const b = sites[j];
      if (a.normalizedNameKey === b.normalizedNameKey) continue; // shouldn't happen (unique upsert key), guard anyway

      const idA = String(a._id);
      const idB = String(b._id);
      const pairKey = [idA, idB].sort().join('::');
      if (resolvedPairKeys.has(pairKey)) continue;

      const score = computeSimilarity(a.name, b.name);
      if (score < SIMILARITY_THRESHOLD) continue;

      const [sortedIdA, sortedIdB] = [idA, idB].sort();
      const [sortedNameA, sortedNameB] = sortedIdA === idA ? [a.name, b.name] : [b.name, a.name];

      operations.push({
        updateOne: {
          filter: { siteIdA: sortedIdA, siteIdB: sortedIdB },
          update: {
            $set: {
              siteIdA: sortedIdA,
              siteIdB: sortedIdB,
              nameA: sortedNameA,
              nameB: sortedNameB,
              similarityScore: score,
            },
            $setOnInsert: { status: 'pending' as const, flaggedAt: now },
          },
          upsert: true,
        },
      });
    }
  }

  if (operations.length > 0) {
    await flags.bulkWrite(operations, { ordered: false });
  }
}
