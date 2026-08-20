/**
 * Recovers a malformed `details.date` string into a real "YYYY-MM-DD" date, or returns null if
 * the value carries no recoverable signal at all. Never guesses — every rule below only fires
 * when it produces exactly one unambiguous, calendar-valid candidate; anything else returns null
 * and the caller falls back to the appointment's creation date (see lib/sync/date-cleanup.ts).
 *
 * Patterns confirmed against real production.appointments data (34,101 docs surveyed): the HTML
 * date picker occasionally duplicates the month into the year field, or drops/adds a stray digit
 * in the year, or writes a year missing its leading "20" (e.g. "0025" instead of "2025"). All
 * three are narrow, well-defined corruptions — not generic string noise — which is what makes
 * pattern recovery viable here rather than reckless.
 */

const MIN_SANE_YEAR = 2015;
const MAX_SANE_YEAR = 2035;

function isSaneYear(y: number): boolean {
  return Number.isInteger(y) && y >= MIN_SANE_YEAR && y <= MAX_SANE_YEAR;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * Year segment is longer than 4 digits (e.g. "202608", "20225"). Two independent recovery
 * strategies, tried in order; each only accepts an unambiguous match:
 *
 *  - "leftover matches month": splitting the year segment into a leading/trailing 4-digit chunk
 *    plus a 2-digit leftover that equals the appointment's own month field means the month was
 *    almost certainly duplicated into the year box by the date picker (e.g. "202608" for month
 *    "08" -> year "2026", leftover "08" == month -> confirmed).
 *  - "single stray digit": removing exactly one character yields exactly one sane 4-digit year
 *    (e.g. "20026" -> removing one "0" -> "2026", and there's no other removal that also lands
 *    in the sane range) -> confirmed. If more than one removal position yields a sane year that
 *    isn't identical, it's ambiguous and is left unrecovered.
 */
function recoverOverlongYear(yearPart: string, month: string): string | null {
  if (yearPart.length <= 4) return null;

  const first4 = yearPart.slice(0, 4);
  const last4 = yearPart.slice(-4);
  const leftoverAfterFirst4 = yearPart.slice(4);
  const leftoverBeforeLast4 = yearPart.slice(0, yearPart.length - 4);

  if (isSaneYear(Number(first4)) && leftoverAfterFirst4 === month) return first4;
  if (isSaneYear(Number(last4)) && leftoverBeforeLast4 === month) return last4;

  const nRemove = yearPart.length - 4;
  if (nRemove === 1) {
    const saneRemovals = new Set<string>();
    for (let i = 0; i < yearPart.length; i++) {
      const candidate = yearPart.slice(0, i) + yearPart.slice(i + 1);
      if (isSaneYear(Number(candidate))) saneRemovals.add(candidate);
    }
    if (saneRemovals.size === 1) return [...saneRemovals][0];
  }

  return null;
}

/** Year segment is exactly 4 digits but out of sane range, missing its leading "20" (e.g. "0025", "0026"). */
function recoverMissingLeadingDigits(yearPart: string): string | null {
  if (yearPart.length !== 4) return null;
  if (!yearPart.startsWith('00')) return null;
  const candidate = `20${yearPart.slice(2)}`;
  return isSaneYear(Number(candidate)) ? candidate : null;
}

/**
 * Attempts to recover a valid "YYYY-MM-DD" from a malformed details.date string. Returns null if
 * the value has no month/day structure to work with, or if the year can't be recovered
 * unambiguously, or if the recovered date isn't a real calendar date.
 */
export function tryRecoverDate(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+)-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, yearPart, month, day] = match;
  if (yearPart.length === 0) return null;

  let recoveredYear: string | null = null;
  if (yearPart.length === 4) {
    const y = Number(yearPart);
    recoveredYear = isSaneYear(y) ? yearPart : recoverMissingLeadingDigits(yearPart);
  } else {
    recoveredYear = recoverOverlongYear(yearPart, month);
  }

  if (!recoveredYear) return null;

  const year = Number(recoveredYear);
  const monthNum = Number(month);
  const dayNum = Number(day);
  if (!isValidCalendarDate(year, monthNum, dayNum)) return null;

  return `${recoveredYear}-${month}-${day}`;
}

/** True if `value` is already a well-formed, calendar-valid "YYYY-MM-DD" string. */
export function isValidAppointmentDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, y, m, d] = match;
  return isValidCalendarDate(Number(y), Number(m), Number(d));
}
