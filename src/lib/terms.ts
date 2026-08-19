import { getCompanionDb } from './mongodb';
import type { CompanionUser } from './types';

// Bump when the terms substantively change so previously-accepting users are re-prompted.
export const CURRENT_TERMS_VERSION = '2026-08-19';

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
