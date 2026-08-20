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

export interface DecodedSouthAfricanId {
  dateOfBirth: string; // YYYY-MM-DD
  age: number;
  gender: 'male' | 'female';
}

/**
 * Decodes DOB/age/gender from a 13-digit SA ID number: YYMMDD (digits 0-5), gender digit 6
 * (0-4 female, 5-9 male, per digits 7-10 of the number being a sequence number split at 5000).
 * Only ever call this after isValidSouthAfricanId() returns true — this function does not
 * re-validate the checksum itself, so an unchecked caller could decode a fabricated/mistyped
 * number as if it were real. Returns null for an ambiguous century (YY interpreted as the most
 * recent birth year not in the future) only in the sense that the guess could be wrong for
 * people who would be 100+; this is a inherent limitation of the 2-digit year in the ID format
 * itself, not a bug in this function.
 */
export function decodeSouthAfricanId(value: string): DecodedSouthAfricanId | null {
  const trimmed = (value || '').trim();
  if (!/^\d{13}$/.test(trimmed)) return null;

  const yy = Number(trimmed.slice(0, 2));
  const mm = Number(trimmed.slice(2, 4));
  const dd = Number(trimmed.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const currentYear = new Date().getFullYear();
  const currentCentury = Math.floor(currentYear / 100) * 100;
  let fullYear = currentCentury + yy;
  if (fullYear > currentYear) fullYear -= 100;

  const dob = new Date(Date.UTC(fullYear, mm - 1, dd));
  if (dob.getUTCFullYear() !== fullYear || dob.getUTCMonth() !== mm - 1 || dob.getUTCDate() !== dd) {
    return null; // e.g. 31 Feb — not a real calendar date
  }

  const genderSeq = Number(trimmed.slice(6, 10));
  const gender: 'male' | 'female' = genderSeq >= 5000 ? 'male' : 'female';

  const now = new Date();
  let age = now.getUTCFullYear() - fullYear;
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > mm - 1 || (now.getUTCMonth() === mm - 1 && now.getUTCDate() >= dd);
  if (!hasHadBirthdayThisYear) age -= 1;

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    dateOfBirth: `${fullYear}-${pad(mm)}-${pad(dd)}`,
    age,
    gender,
  };
}
