/**
 * South African ID number validation — format + check-digit only, warn-not-block per the roster
 * spec (the ID/passport field is shared with actual passport numbers, which won't match this
 * 13-digit pattern at all and must be skipped, not flagged invalid).
 */
export function isValidSouthAfricanId(value: string): boolean | null {
  const trimmed = (value || '').trim();
  if (!/^\d{13}$/.test(trimmed)) {
    return null; // not a 13-digit numeric string — assume passport, skip the check entirely
  }

  const digits = trimmed.split('').map(Number);
  const checkDigit = digits[12];

  let oddSum = 0;
  for (let i = 0; i < 12; i += 2) {
    oddSum += digits[i];
  }

  let evenConcat = '';
  for (let i = 1; i < 12; i += 2) {
    evenConcat += digits[i];
  }
  const evenDoubled = String(Number(evenConcat) * 2);
  const evenSum = evenDoubled.split('').reduce((acc, d) => acc + Number(d), 0);

  const total = oddSum + evenSum;
  const computedCheckDigit = (10 - (total % 10)) % 10;

  return computedCheckDigit === checkDigit;
}
