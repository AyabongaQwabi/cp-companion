#!/usr/bin/env node

import fs from 'fs';
import { MongoClient } from 'mongodb';

/**
 * One-off backfill: applies the same additive-only lifecycle-status rules as the daily cron
 * (src/app/api/cron/lifecycle-status/route.ts / src/lib/sync/lifecycle-status.ts) to every
 * existing appointment in production.appointments, so historical data doesn't have to wait for
 * 90 days of daily runs to catch up. Never edits or removes any existing field — only $sets the
 * new lifecycleStatus / lifecycleStatusReason / lifecycleStatusSetAt / pipelineComplete /
 * pipelineCompletedAt fields. Idempotent: safe to re-run.
 *
 * Rules (details.date = appointment/service date, not creation date):
 *  - status 'pending', details.date > 3 months ago, no payment.proofOfPayment -> lifecycleStatus 'expired'
 *  - status 'pending', details.date > 3 months ago, has payment.proofOfPayment -> lifecycleStatus 'approved'
 *  - status 'approved', details.date > 3 months ago AND already passed -> lifecycleStatus 'completed' + pipelineComplete
 */
const STALE_MONTHS = 3;

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function hasProofOfPayment(proofOfPayment) {
  if (Array.isArray(proofOfPayment)) return proofOfPayment.length > 0;
  return typeof proofOfPayment === 'string' && proofOfPayment.trim().length > 0;
}

log('Lifecycle status backfill starting');

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2];
  }
}

const client = await new MongoClient(process.env.DATABASE_URL).connect();
const prodDb = client.db(process.env.SELECTED_DB || 'production');
const appointments = prodDb.collection('appointments');

const cutoff = new Date();
cutoff.setMonth(cutoff.getMonth() - STALE_MONTHS);
const cutoffIso = cutoff.toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);
const now = new Date();

log('Fetching candidate appointments', { cutoffIso });
const candidates = await appointments
  .find({ 'details.date': { $lt: cutoffIso }, status: { $in: ['pending', 'approved'] } })
  .project({ id: 1, status: 1, 'details.date': 1, 'payment.proofOfPayment': 1, lifecycleStatus: 1 })
  .toArray();
log('Fetched candidates', { count: candidates.length });

let processed = 0;
let skipped = 0;
let errors = 0;

for (const appt of candidates) {
  try {
    const appointmentDate = appt.details?.date;
    if (!appointmentDate) {
      skipped++;
      continue;
    }

    let nextLifecycleStatus = null;
    let reason = '';

    if (appt.status === 'pending') {
      if (hasProofOfPayment(appt.payment?.proofOfPayment)) {
        nextLifecycleStatus = 'approved';
        reason = 'pending appointment older than 3 months with proof of payment attached';
      } else {
        nextLifecycleStatus = 'expired';
        reason = 'pending appointment older than 3 months with no proof of payment; no longer relevant';
      }
    } else if (appt.status === 'approved' && appointmentDate < today) {
      nextLifecycleStatus = 'completed';
      reason = 'approved appointment older than 3 months whose service date has passed';
    }

    if (!nextLifecycleStatus || nextLifecycleStatus === appt.lifecycleStatus) {
      skipped++;
      continue;
    }

    const setFields = {
      lifecycleStatus: nextLifecycleStatus,
      lifecycleStatusReason: reason,
      lifecycleStatusSetAt: now,
    };
    if (nextLifecycleStatus === 'completed') {
      setFields.pipelineComplete = true;
      setFields.pipelineCompletedAt = now;
    }

    await appointments.updateOne({ _id: appt._id }, { $set: setFields });
    processed++;
    if (processed % 200 === 0) {
      log('Progress', { processed, skipped, total: candidates.length });
    }
  } catch (err) {
    errors++;
    log('ERROR processing appointment', { id: appt.id, error: err instanceof Error ? err.message : String(err) });
  }
}

log('Backfill complete', { processed, skipped, errors, totalCandidates: candidates.length });

await client.close();
