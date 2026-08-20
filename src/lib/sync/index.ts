import type { Db } from 'mongodb';
import short from 'short-uuid';
import { syncCompanyProfiles } from './company-profiles';
import { syncBookingPatterns } from './booking-patterns';
import { syncComplianceCache } from './compliance-cache';
import { syncDataQualitySweep } from './data-quality-sweep';
import { syncSiteDirectory } from './site-directory';
import { syncDormancyFlags } from './dormancy';
import { syncNewCompanyLeads } from './new-leads';
import { syncAnomalyWatchdog } from './anomaly-watchdog';
import { syncAdoptionMetric } from './adoption-metric';
import { syncFinanceAnalytics } from './finance-analytics';
import type { SyncLogEntry } from '../types';

/**
 * Incremental cursor: production.appointments/companies have no updatedAt field, only a
 * tracking[] array of {type, date, doer} events (confirmed against real data — see
 * clinicplus-server-latest-stable-version's save/update code, which only ever pushes to
 * tracking, never sets a top-level timestamp). "Changed since last run" is therefore: the last
 * entry in tracking has a date after the previous sync's cutoff. A small overlap window
 * (SAFETY_OVERLAP_MS) re-includes anything right at the boundary rather than risk missing a
 * write that landed mid-run.
 */
const SAFETY_OVERLAP_MS = 5 * 60 * 1000; // 5 minutes

async function getLastSuccessfulRunCutoff(companionDb: Db): Promise<Date> {
  const last = await companionDb
    .collection<SyncLogEntry>('syncLog')
    .find({ status: { $in: ['success', 'partial'] } })
    .sort({ startedAt: -1 })
    .limit(1)
    .toArray();

  if (last.length === 0) {
    // First-ever run: no prior cutoff, so treat everything as "changed" this one time. All
    // subsequent runs are incremental from here on.
    return new Date(0);
  }
  return new Date(last[0].startedAt.getTime() - SAFETY_OVERLAP_MS);
}

async function getChangedCompanyIds(prodDb: Db, since: Date): Promise<string[]> {
  const rows = await prodDb
    .collection('companies')
    .find({ 'tracking.date': { $gte: since } })
    .project({ id: 1 })
    .toArray();
  return rows.map((r) => (r as { id: string }).id);
}

async function getChangedAppointmentCompanyIds(prodDb: Db, since: Date): Promise<string[]> {
  const rows = await prodDb
    .collection('appointments')
    .find({ 'tracking.date': { $gte: since } })
    .project({ 'details.company.id': 1 })
    .toArray();
  return Array.from(
    new Set(rows.map((r) => (r as { details?: { company?: { id?: string } } }).details?.company?.id).filter(Boolean))
  ) as string[];
}

async function getChangedAppointmentIds(prodDb: Db, since: Date): Promise<string[]> {
  const rows = await prodDb
    .collection('appointments')
    .find({ 'tracking.date': { $gte: since }, status: 'approved' })
    .project({ id: 1 })
    .toArray();
  return rows.map((r) => (r as { id: string }).id).filter(Boolean);
}

export async function runSyncPipeline(prodDb: Db, companionDb: Db) {
  const runId = short.generate();
  const startedAt = new Date();
  const syncLog = companionDb.collection<SyncLogEntry>('syncLog');

  await syncLog.insertOne({
    runId,
    startedAt,
    status: 'running',
    jobs: [],
  });

  const jobs: SyncLogEntry['jobs'] = [];
  let hadErrors = false;
  let hadSuccesses = false;

  async function runJob(name: string, fn: () => Promise<{ processed: number; errors: number }>) {
    const jobStart = Date.now();
    try {
      const result = await fn();
      jobs.push({ name, processed: result.processed, errors: result.errors, durationMs: Date.now() - jobStart });
      if (result.errors > 0) hadErrors = true;
      hadSuccesses = true;
    } catch (err) {
      jobs.push({ name, processed: 0, errors: 1, durationMs: Date.now() - jobStart });
      hadErrors = true;
      await companionDb.collection('auditLog').insertOne({
        action: 'SYNC_JOB_FAILED',
        runId,
        job: name,
        error: err instanceof Error ? err.message : String(err),
        at: new Date(),
      });
    }
  }

  try {
    const cutoff = await getLastSuccessfulRunCutoff(companionDb);

    const [changedCompanyIdsFromCompanies, changedCompanyIdsFromAppointments, changedAppointmentIds] =
      await Promise.all([
        getChangedCompanyIds(prodDb, cutoff),
        getChangedAppointmentCompanyIds(prodDb, cutoff),
        getChangedAppointmentIds(prodDb, cutoff),
      ]);

    const changedCompanyIds = Array.from(
      new Set([...changedCompanyIdsFromCompanies, ...changedCompanyIdsFromAppointments])
    );

    await runJob('company-profiles', () => syncCompanyProfiles(prodDb, companionDb, changedCompanyIds));
    await runJob('booking-patterns', () => syncBookingPatterns(prodDb, companionDb, changedCompanyIds));
    await runJob('compliance-cache', () => syncComplianceCache(prodDb, companionDb));
    await runJob('data-quality-sweep', () => syncDataQualitySweep(prodDb, companionDb));
    await runJob('site-directory', () => syncSiteDirectory(prodDb, companionDb, changedAppointmentIds));
    await runJob('dormancy', () => syncDormancyFlags(companionDb));
    await runJob('new-leads', () => syncNewCompanyLeads(prodDb, companionDb, changedCompanyIds));
    await runJob('anomaly-watchdog', () => syncAnomalyWatchdog(prodDb, companionDb, changedAppointmentIds));
    await runJob('adoption-metric', () => syncAdoptionMetric(prodDb, companionDb));
    await runJob('finance-analytics', () => syncFinanceAnalytics(prodDb, companionDb));

    const status: SyncLogEntry['status'] = hadErrors ? (hadSuccesses ? 'partial' : 'failed') : 'success';

    await syncLog.updateOne(
      { runId },
      { $set: { finishedAt: new Date(), status, jobs } }
    );

    return { runId, status, jobs };
  } catch (err) {
    await syncLog.updateOne(
      { runId },
      {
        $set: {
          finishedAt: new Date(),
          status: 'failed',
          jobs,
          error: err instanceof Error ? err.message : String(err),
        },
      }
    );
    throw err;
  }
}
