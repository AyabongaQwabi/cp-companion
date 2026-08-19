import { getCompanionDb } from './mongodb';
import actionPricingConfig from '../../config/action-pricing.json';
import creditPurchasingConfig from '../../config/credit-purchasing.json';
import { resolveCampaignInviteBonus } from './email-campaigns';
import type { ActionPricing, CreditTransaction, CreditWallet } from './types';

interface ActionPricingSeed {
  actionKey: string;
  label: string;
  creditCost: number;
  locked: boolean;
}

// Pricing is intentionally config-only. The database stores wallet balances and immutable
// transactions, but action costs live in config/action-pricing.json so price changes are reviewed
// as code/config changes instead of silent production data edits.
const ACTION_PRICING_CONFIG: ActionPricingSeed[] = actionPricingConfig;

const SIGNUP_BONUS_CREDITS = creditPurchasingConfig.signupBonusCredits;
const DEFAULT_ACTION_CREDIT_COST = 1;

function normalizeActionPrice(actionKey: string, price: ActionPricing): ActionPricing {
  if (actionKey === 'auth.login' || price.creditCost >= DEFAULT_ACTION_CREDIT_COST) {
    return price;
  }
  return { ...price, creditCost: DEFAULT_ACTION_CREDIT_COST };
}

export async function getActionPrice(actionKey: string): Promise<ActionPricing> {
  const configured = ACTION_PRICING_CONFIG.find((row) => row.actionKey === actionKey);
  if (configured) {
    return normalizeActionPrice(actionKey, {
      actionKey: configured.actionKey,
      label: configured.label,
      creditCost: configured.creditCost,
      isActive: true,
    });
  }

  return {
    actionKey,
    label: actionKey,
    creditCost: DEFAULT_ACTION_CREDIT_COST,
    isActive: true,
  };
}

export async function getOrCreateWallet(userId: string): Promise<CreditWallet> {
  const db = await getCompanionDb();
  const collection = db.collection<CreditWallet>('creditWallets');
  const existing = await collection.findOne({ userId });
  if (existing) return existing;

  const now = new Date();
  const wallet: Omit<CreditWallet, '_id'> = { userId, balance: 0, createdAt: now, updatedAt: now };
  const result = await collection.insertOne(wallet);
  return { ...wallet, _id: result.insertedId.toString() };
}

/**
 * Part F.5 — grants the one-time 50-credit signup bonus on a production.users person's first
 * Companion login. Idempotent: keyed to companionUsers.productionUserId, so it can never be
 * granted twice for the same person even if called on every login.
 */
export async function grantSignupBonusIfFirstLogin(
  productionUserId: string,
  companyIdAtSignup?: string,
  inviteToken?: string
): Promise<boolean> {
  const db = await getCompanionDb();
  const companionUsers = db.collection('companionUsers');

  const already = await companionUsers.findOne({ productionUserId });
  if (already) return false;

  const now = new Date();
  const campaignInvite = await resolveCampaignInviteBonus(db, productionUserId, inviteToken);
  const bonusCredits = campaignInvite?.firstLoginBonusCredits || SIGNUP_BONUS_CREDITS;
  try {
    await companionUsers.insertOne({
      productionUserId,
      firstLoginAt: now,
      signupBonusGrantedAt: now,
      signupBonusCredits: bonusCredits,
      companyIdAtSignup,
      campaignIdAtSignup: campaignInvite?.campaignId,
    });
  } catch {
    // Unique-constraint-style race (two simultaneous first logins) — whichever insert lost,
    // the bonus was already granted by the winner, so just don't grant twice.
    return false;
  }

  await creditWallet(
    productionUserId,
    bonusCredits,
    campaignInvite ? `signup-bonus:${campaignInvite.campaignId}` : 'signup-bonus'
  );
  if (campaignInvite) {
    await db.collection('emailCampaignInvites').updateOne(
      { _id: campaignInvite._id, bonusClaimedAt: { $exists: false } },
      { $set: { bonusClaimedAt: now } }
    );
  }
  return true;
}

async function creditWallet(userId: string, credits: number, actionKey: string) {
  const db = await getCompanionDb();
  const wallets = db.collection<CreditWallet>('creditWallets');
  const wallet = await getOrCreateWallet(userId);
  const newBalance = wallet.balance + credits;

  await wallets.updateOne(
    { userId },
    { $set: { balance: newBalance, updatedAt: new Date() } },
    { upsert: true }
  );

  const transaction: Omit<CreditTransaction, '_id'> = {
    userId,
    type: 'topup',
    credits,
    action: actionKey,
    balanceAfter: newBalance,
    createdAt: new Date(),
  };
  await db.collection<CreditTransaction>('creditTransactions').insertOne(transaction);
}

export interface ChargeResult {
  ok: boolean;
  error?: string;
  balanceAfter?: number;
  creditCost?: number;
}

/**
 * Fail-closed debit: checks the action's price and the wallet's balance, and only writes the
 * debit transaction + balance update if there's enough credit — never allows a negative balance,
 * never partially completes. No refund path exists for the resulting transaction (Part E).
 *
 * Missing pricing defaults to 1 credit, so an unlisted action never runs free by accident.
 */
export async function chargeForAction(userId: string, actionKey: string): Promise<ChargeResult> {
  const price = await getActionPrice(actionKey);
  const creditCost = price.creditCost;

  if (creditCost === 0) {
    return { ok: true, creditCost: 0 };
  }

  const db = await getCompanionDb();
  const wallets = db.collection<CreditWallet>('creditWallets');
  const wallet = await getOrCreateWallet(userId);

  if (wallet.balance < creditCost) {
    return { ok: false, error: 'Insufficient credits', creditCost, balanceAfter: wallet.balance };
  }

  const newBalance = wallet.balance - creditCost;
  await wallets.updateOne(
    { userId },
    { $set: { balance: newBalance, updatedAt: new Date() } }
  );

  const transaction: Omit<CreditTransaction, '_id'> = {
    userId,
    type: 'debit',
    credits: -creditCost,
    action: actionKey,
    balanceAfter: newBalance,
    createdAt: new Date(),
  };
  await db.collection<CreditTransaction>('creditTransactions').insertOne(transaction);

  return { ok: true, creditCost, balanceAfter: newBalance };
}
