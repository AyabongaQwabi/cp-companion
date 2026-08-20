import { getCompanionDb } from './mongodb';
import type { CompanionUser } from './types';

// Bump when the terms substantively change so previously-accepting users are re-prompted.
// 2026-08-20: added the cross-company anonymized benchmarking clause (Section 1 of the
// production-sync/benchmarking phase) — /terms section 5 and /privacy sections 3-4. DRAFT
// legal copy, not reviewed by counsel — flagged explicitly per the spec's own instruction not to
// ship this silently. Bumping this re-prompts every existing user for consent before they can use
// the app again, which is what makes the benchmarking feature live for them.
export const CURRENT_TERMS_VERSION = '2026-08-20';

export async function getTermsStatus(productionUserId: string) {
  const db = await getCompanionDb();
  const companionUser = await db
    .collection<CompanionUser>('companionUsers')
    .findOne({ productionUserId });

  const accepted =
    !!companionUser?.termsAcceptedAt && companionUser.termsVersion === CURRENT_TERMS_VERSION;

  return {
    accepted,
    version: CURRENT_TERMS_VERSION,
    emailConsent: companionUser?.emailConsent ?? false,
  };
}

export async function acceptTerms(productionUserId: string, emailConsent: boolean) {
  const db = await getCompanionDb();
  const now = new Date();
  await db.collection<CompanionUser>('companionUsers').updateOne(
    { productionUserId },
    {
      $set: {
        termsAcceptedAt: now,
        termsVersion: CURRENT_TERMS_VERSION,
        emailConsent,
      },
    },
    { upsert: true }
  );
  return { accepted: true, version: CURRENT_TERMS_VERSION, emailConsent };
}
