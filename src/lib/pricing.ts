import { DOVER_PRICE, XRAYS_PRICE, MEDICAL_SERVICES } from './clinicplus-constants';
import type { AppointmentEmployee } from './types';

/**
 * Reimplements calculateBookingPrice() from
 * cp-redesign/src/pages/appointments/appointment/create/index.js exactly:
 * sum of selected MEDICAL_SERVICES prices across all employees, plus DOVER_PRICE per employee
 * with dover.required, plus XRAYS_PRICE per employee with xray.required. Sites/access cards are
 * priced at 0 (removed in cp-redesign commit 11d3db1) — see clinicplus-constants.ts.
 */
export function calculateBookingPrice(employees: AppointmentEmployee[]): number {
  const allServices = employees.flatMap((e) => e.services).filter((s) => s.id !== 'vienna-test');

  const servicesPrice = Object.keys(MEDICAL_SERVICES).reduce((acc, serviceId) => {
    const matching = allServices.filter((s) => s.id === serviceId);
    const sum = matching.reduce((a, s) => a + s.price, 0);
    return acc + sum;
  }, 0);

  const doverPrice = employees.reduce((acc, e) => (e.dover?.required ? acc + DOVER_PRICE : acc), 0);
  const xrayPrice = employees.reduce((acc, e) => (e.xray?.required ? acc + XRAYS_PRICE : acc), 0);

  return servicesPrice + doverPrice + xrayPrice;
}
