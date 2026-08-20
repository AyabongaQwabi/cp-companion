import type { Db } from 'mongodb';
import type { CompanyProfile, DormancyFlag } from '../types';

/**
 * A company is dormant when its days-since-last-booking meaningfully exceeds its own historical
 * average interval — "meaningfully" fixed at 2x, so a company that books every ~30 days isn't
 * flagged until ~60 days of silence, not the moment it's one day late. Requires at least 2 prior
 * bookings (avgBookingIntervalDays != null) — a company with 0-1 bookings has no cadence to be
 * dormant relative to, so it's left to the new-company-lead / general adoption tracking instead.
 * Superadmin-only outreach list, not an automated client-facing email.
 */
const DORMANCY_MULTIPLIER = 2;

export async function syncDormancyFlags(companionDb: Db): Promise<{ processed: number; errors: number }> {
  const profiles = await companionDb
    .collection<CompanyProfile>('companyProfiles')
    .find({ avgBookingIntervalDays: { $ne: null }, lastActiveAt: { $ne: null } })
    .toArray();

  const flags = companionDb.collection<DormancyFlag>('dormancyFlags');
  await flags.deleteMany({}); // re-derived fresh each run from current companyProfiles state

  const now = new Date();
  let processed = 0;
  let errors = 0;
  const newFlags: DormancyFlag[] = [];

  for (const profile of profiles) {
    try {
      if (!profile.avgBookingIntervalDays || !profile.lastActiveAt) continue;
      const daysSinceLastBooking = Math.round((now.getTime() - new Date(profile.lastActiveAt).getTime()) / 86400000);
      const threshold = profile.avgBookingIntervalDays * DORMANCY_MULTIPLIER;

      if (daysSinceLastBooking > threshold) {
        newFlags.push({
          companyId: profile.companyId,
          companyName: profile.companyName,
          avgBookingIntervalDays: profile.avgBookingIntervalDays,
          daysSinceLastBooking,
          lastBookingDate: new Date(profile.lastActiveAt).toISOString().slice(0, 10),
          flaggedAt: now,
        });
        processed++;
      }
    } catch {
      errors++;
    }
  }

  if (newFlags.length > 0) {
    await flags.insertMany(newFlags, { ordered: false });
  }

  return { processed, errors };
}
