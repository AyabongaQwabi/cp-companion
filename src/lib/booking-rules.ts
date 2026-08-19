/**
 * Reimplements the date-blocking logic from
 * cp-redesign/src/pages/appointments/appointment/create/index.js (calculateEaster,
 * getSouthAfricanPublicHolidays, isDateBlocked) exactly, so the add-on rejects the same dates
 * cp-redesign would reject.
 */

function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getSouthAfricanPublicHolidays(year: number): Date[] {
  const easter = calculateEaster(year);
  const goodFriday = addDays(easter, -2);
  const familyDay = addDays(easter, 1);

  return [
    new Date(year, 0, 1), // New Year's Day
    new Date(year, 2, 21), // Human Rights Day
    goodFriday,
    familyDay,
    new Date(year, 3, 27), // Freedom Day
    new Date(year, 4, 1), // Workers' Day
    new Date(year, 5, 16), // Youth Day
    new Date(year, 7, 9), // National Women's Day
    new Date(year, 8, 24), // Heritage Day
    new Date(year, 11, 16), // Day of Reconciliation
    new Date(year, 11, 25), // Christmas Day
    new Date(year, 11, 26), // Day of Goodwill
  ];
}

export function isDateBlocked(dateString?: string | null): boolean {
  if (!dateString) return false;

  const date = new Date(dateString);
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return true;
  }

  const publicHolidays = getSouthAfricanPublicHolidays(date.getFullYear());
  return publicHolidays.some((holiday) => isSameDay(date, holiday));
}

export function blockedDateReason(dateString: string): string {
  const dayOfWeek = new Date(dateString).getDay();
  if (dayOfWeek === 0) {
    return 'Bookings are not available on Sundays. Please select a different date.';
  }
  if (dayOfWeek === 6) {
    return 'Bookings are not available on Saturdays. Please select a different date.';
  }
  return 'Bookings are not available on public holidays. Please select a different date.';
}

export const DEFAULT_CLINIC_LIMIT = 100;

/**
 * Mirrors clinicLimits[clinic] || 100, where clinicLimits comes from the production
 * systemSettings collection's `limits` field (see production.systemSettings, read via
 * getSystemSettings in clinicplus-server-latest-stable-version/lib/data/get/index.js) — not a
 * hardcoded constant in the client app.
 */
export function resolveClinicLimit(limits: Record<string, number> | undefined, clinic: string): number {
  return limits?.[clinic] ?? DEFAULT_CLINIC_LIMIT;
}
