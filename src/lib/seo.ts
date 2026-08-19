/**
 * Shared SEO constants — canonical base URL and small helpers used by every public page's
 * `metadata` export and JSON-LD script tags, and reused as the CP_COMPANION_BASE_URL fallback for
 * Yoco checkout redirect URLs (see /api/billing/checkout) so a deployment without that env var
 * set doesn't accidentally send Yoco an http://localhost redirect.
 */
export const SITE_URL = 'https://cpc.qwbi.lat';
export const SITE_NAME = 'Clinicplus Bookings Companion';

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
