import { getCompanionDb } from './mongodb';
import type { CompanionUser } from './types';

/**
 * Superadmin is never self-service — the role is seeded directly into cp_companion.companionUsers
 * for Aya's own production.users id only (see scripts/seed-superadmin.mjs, run once, not part of
 * the deployed app). Every route touching a cross-company config surface (serviceValidityPeriods)
 * must call this server-side and fail closed (403) — never trust a client-sent role claim.
 */
export async function isSuperadmin(productionUserId: string): Promise<boolean> {
  if (!productionUserId) return false;
  const db = await getCompanionDb();
  const user = await db
    .collection<CompanionUser>('companionUsers')
    .findOne({ productionUserId });
  return user?.role === 'superadmin';
}
