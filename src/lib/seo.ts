/**
 * Shared SEO constants — canonical base URL and small helpers used by every public page's
 * `metadata` export and JSON-LD script tags. No canonical production domain exists yet in
 * .env.example or elsewhere in the repo (CP_COMPANION_BASE_URL defaults to localhost for Yoco
 * redirects), so this is a placeholder domain kept consistent across every page per
 * SEO-STRATEGY.md. Update this single constant once the real domain is live.
 */
export const SITE_URL = 'https://cpc.qwbi.lat';
export const SITE_NAME = 'Clinicplus Bookings Companion';

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
