/**
 * Thin typed wrapper over config/clinics.json and config/medical-services.json — the actual
 * clinic list, service catalog, and prices live there as plain JSON so a price change or new
 * clinic is a data edit, not a code change. Originally copied verbatim from
 * cp-redesign/src/constants/index.js (the live client app's constants — NOT
 * clinicplus-server-latest-stable-version/lib/data/get/index.js, which has stale
 * DOVER_PRICE/XRAYS_PRICE values that have drifted from what the client app actually charges).
 * Do not hand-edit prices in the JSON without re-checking that file first.
 */

import clinicsConfig from '../../config/clinics.json';
import medicalServicesConfig from '../../config/medical-services.json';

export const CLINIC_LOCATIONS = clinicsConfig as readonly string[];
export type Clinic = string;

export const DOVER_PRICE = medicalServicesConfig.doverPrice;
export const XRAYS_PRICE = medicalServicesConfig.xraysPrice;

// Deliberately unused in pricing — see cp-redesign commit 11d3db1, "Remove pricing for sites and
// access cards from appointment invoicing". Kept here only for reference; do not import into
// calculateBookingPrice.
export const SITE_SECOND_SITE_PRICE = 43.95;
export const ACCESS_CARD_PRICE = 55.29;

export interface MedicalService {
  price: number;
  title: string;
  id: string;
  showInfo?: boolean;
  info: string;
}

export const MEDICAL_SERVICES: Record<string, MedicalService> = Object.fromEntries(
  medicalServicesConfig.services.map((svc) => [svc.id, svc as MedicalService])
);
