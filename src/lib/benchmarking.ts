import type { Db } from 'mongodb';
import { MEDICAL_SERVICES } from './clinicplus-constants';
import type { CompanyProfile, BookingPattern } from './types';

/**
 * Section 1 — cross-company benchmarking ("companies like yours"), built entirely on top of
 * Section 0's derived cp_companion.companyProfiles/bookingPatterns collections (never queries
 * production directly — same read-cost reasoning as the rest of this feature: benchmarking is a
 * cross-company aggregate query, exactly the kind of load the sync pipeline exists to keep off
 * production and off the live request path).
 *
 * HARD GUARDRAIL, not a tunable default: a benchmark is never computed, let alone returned, for a
 * cohort smaller than MIN_COHORT_SIZE. Below that size, an "average for companies like yours"
 * statistic is one or two real companies' numbers with a thin disguise, not a genuine aggregate.
 * This is enforced at the data layer (computeBenchmarks returns null) so no caller — current or
 * future — can accidentally bypass it by skipping a UI-level check.
 */
export const MIN_COHORT_SIZE = 5;

export interface Benchmarks {
  cohortSize: number;
  avgSpendPerEmployeePerYear: number;
  xrayAttachRate: number; // fraction of cohort companies whose bookings include an x-ray-tracked service
  typicalRebookingIntervalDays: number;
  typicalRosterSize: number;
  ownBookingIntervalDays: number | null;
  positioning: 'above-average' | 'below-average' | 'average' | 'not-enough-data';
  dominantServiceType: string | null;
  dominantServiceTitle: string | null;
}

/**
 * Never returns any other company's name, id, or raw figures — only cohort-level aggregates
 * (averages, rates, counts) and this company's own position relative to them. If the cohort
 * (companies sharing this company's peerCohortKey, excluding itself) has fewer than
 * MIN_COHORT_SIZE members, returns null — the caller must treat null as "no benchmark available",
 * never fall back to a smaller/different grouping to force a number out.
 */
export async function computeBenchmarks(companionDb: Db, companyId: string): Promise<Benchmarks | null> {
  const profiles = companionDb.collection<CompanyProfile>('companyProfiles');
  const patterns = companionDb.collection<BookingPattern>('bookingPatterns');

  const ownProfile = await profiles.findOne({ companyId });
  if (!ownProfile || !ownProfile.peerCohortKey) return null;

  const cohortProfiles = await profiles
    .find({ peerCohortKey: ownProfile.peerCohortKey, companyId: { $ne: companyId } })
    .toArray();

  if (cohortProfiles.length < MIN_COHORT_SIZE) return null;

  const cohortCompanyIds = cohortProfiles.map((p) => p.companyId);
  const cohortPatterns = await patterns.find({ companyId: { $in: cohortCompanyIds } }).toArray();
  const patternByCompany = new Map(cohortPatterns.map((p) => [p.companyId, p]));

  // Spend per employee per year: totalHistoricalSpend / currentEmployeeCount, annualized using
  // each company's own tenure (firstSeenAt -> now) so a brand-new company with one big booking
  // doesn't skew the average as hard as a company with years of steady spend.
  const now = Date.now();
  const spendPerEmployeePerYearValues: number[] = [];
  const xrayAttachRates: number[] = [];
  const rebookingIntervals: number[] = [];
  const rosterSizes: number[] = [];

  for (const profile of cohortProfiles) {
    if (profile.currentEmployeeCount > 0) {
      const tenureYears = Math.max(
        (now - new Date(profile.firstSeenAt).getTime()) / (365 * 86400000),
        1 / 12 // floor at one month of tenure to avoid a divide-by-near-zero spike
      );
      spendPerEmployeePerYearValues.push(
        profile.totalHistoricalSpend / profile.currentEmployeeCount / tenureYears
      );
      rosterSizes.push(profile.currentEmployeeCount);
    }

    const pattern = patternByCompany.get(profile.companyId);
    if (pattern) {
      if (pattern.avgDaysBetweenBookings != null) {
        rebookingIntervals.push(pattern.avgDaysBetweenBookings);
      }
      xrayAttachRates.push(pattern.xrayAttachRate ?? 0);
    }
  }

  if (spendPerEmployeePerYearValues.length === 0 || rebookingIntervals.length === 0) return null;

  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

  const avgSpendPerEmployeePerYear = Math.round(avg(spendPerEmployeePerYearValues) * 100) / 100;
  const xrayAttachRate = xrayAttachRates.length > 0 ? Math.round(avg(xrayAttachRates) * 1000) / 1000 : 0;
  const typicalRebookingIntervalDays = Math.round(avg(rebookingIntervals));
  const typicalRosterSize = Math.round(avg(rosterSizes));

  const ownInterval = ownProfile.avgBookingIntervalDays;
  let positioning: Benchmarks['positioning'] = 'not-enough-data';
  if (ownInterval != null) {
    // Lower interval = booking more frequently = "above average" activity, not "above average
    // interval" — framed from the business meaning, not the raw number direction.
    const diffRatio = (typicalRebookingIntervalDays - ownInterval) / typicalRebookingIntervalDays;
    if (diffRatio > 0.1) positioning = 'above-average';
    else if (diffRatio < -0.1) positioning = 'below-average';
    else positioning = 'average';
  }

  const dominantServiceType = ownProfile.dominantServiceType;

  return {
    cohortSize: cohortProfiles.length,
    avgSpendPerEmployeePerYear,
    xrayAttachRate,
    typicalRebookingIntervalDays,
    typicalRosterSize,
    ownBookingIntervalDays: ownInterval,
    positioning,
    dominantServiceType,
    dominantServiceTitle: dominantServiceType ? MEDICAL_SERVICES[dominantServiceType]?.title ?? dominantServiceType : null,
  };
}
