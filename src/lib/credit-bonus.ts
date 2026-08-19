/**
 * Bonus tiers per Part E: 15% of credits purchased, capped at a flat 150-credit bonus once the
 * purchase reaches 1,000 credits (and staying flat at 150 above that too). The 700-credit tier
 * was confirmed as 805 total (105 bonus), following the 15% rule like every other tier. Values
 * live in config/credit-purchasing.json so a rate/cap change is a data edit, not a code change.
 */
import creditPurchasingConfig from '../../config/credit-purchasing.json';

const { pricePerCreditZAR, bonusRate, bonusCap, bonusCapThreshold } = creditPurchasingConfig;

export function calculateBonus(creditsPurchased: number): number {
  if (creditsPurchased >= bonusCapThreshold) {
    return bonusCap;
  }
  return Math.round(creditsPurchased * bonusRate);
}

export function calculateTotalCredited(creditsPurchased: number): number {
  return creditsPurchased + calculateBonus(creditsPurchased);
}

export function calculatePriceZAR(creditsPurchased: number): number {
  return Math.round(creditsPurchased * pricePerCreditZAR * 100) / 100;
}

export function isValidBundle(creditsPurchased: number): boolean {
  return creditsPurchased > 0 && creditsPurchased % 100 === 0;
}
