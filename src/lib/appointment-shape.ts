import { CLINIC_LOCATIONS } from './clinicplus-constants';
import type { AppointmentDocument, AppointmentEmployee } from './types';

/**
 * Fail-closed shape validation for a document about to be inserted into production.appointments.
 * Every check here corresponds to a rule from the spec's "Appointment validity checklist" —
 * this must never let a malformed or invented-field document reach production.
 */
export function validateAppointmentShape(appt: AppointmentDocument): string[] {
  const errors: string[] = [];

  if (!appt.details?.company?.id || !appt.details?.company?.name) {
    errors.push('details.company.id and details.company.name are required');
  }
  if (!CLINIC_LOCATIONS.includes(appt.details?.clinic as (typeof CLINIC_LOCATIONS)[number])) {
    errors.push(`details.clinic must be one of ${CLINIC_LOCATIONS.join(', ')}`);
  }
  if (!appt.details?.date) {
    errors.push('details.date is required');
  }
  if (appt.details?.ndaAccepted !== true) {
    errors.push('details.ndaAccepted must be true');
  }
  if (!appt.details?.ndaPdf) {
    errors.push('details.ndaPdf must be a real uploaded URL');
  }
  if (!Array.isArray(appt.details?.employees) || appt.details.employees.length === 0) {
    errors.push('details.employees must be a non-empty array');
  } else {
    appt.details.employees.forEach((e: AppointmentEmployee, i: number) => {
      const requiredKeys: (keyof AppointmentEmployee)[] = [
        'id',
        'name',
        'idNumber',
        'comments',
        'occupation',
        'services',
        'sites',
        'isMinimized',
        'dover',
        'xray',
      ];
      const missing = requiredKeys.filter((k) => e[k] === undefined);
      if (missing.length > 0) {
        errors.push(`employees[${i}] missing fields: ${missing.join(', ')}`);
      }
      if (typeof e.dover?.required !== 'boolean') {
        errors.push(`employees[${i}].dover.required must be a boolean`);
      }
      if (typeof e.xray?.required !== 'boolean') {
        errors.push(`employees[${i}].xray.required must be a boolean`);
      }
      // Part F.7 — add-on-side business rule (not a schema requirement; jobSpecFile stays
      // optional-shaped on the document itself, same as cp-redesign). Every employee must have
      // at least one job spec file attached before the add-on will submit an appointment.
      if (!e.jobSpecFile) {
        errors.push(`employees[${i}] is missing a required job spec file`);
      }
    });
  }
  if (typeof appt.payment?.amount !== 'number') {
    errors.push('payment.amount must be a computed number');
  }
  if (appt.status !== 'pending') {
    errors.push("status must be 'pending'");
  }
  if (!Array.isArray(appt.usersWhoCanManage) || appt.usersWhoCanManage.length === 0) {
    errors.push('usersWhoCanManage must be non-empty');
  }

  // No extra top-level keys beyond what a real appointment document has.
  const allowedTopLevel = new Set([
    '_id',
    'id',
    'details',
    'usersWhoCanEdit',
    'usersWhoCanManage',
    'payment',
    'isVoided',
    'isComplete',
    'tracking',
    'messages',
    'status',
    'invoice',
    // Additive-only fields written by the daily lifecycle-status job (never set at creation,
    // but allowed here so a document that already has them can still pass a future re-validate).
    'lifecycleStatus',
    'lifecycleStatusReason',
    'lifecycleStatusSetAt',
    'pipelineComplete',
    'pipelineCompletedAt',
  ]);
  Object.keys(appt).forEach((k) => {
    if (!allowedTopLevel.has(k)) {
      errors.push(`unexpected top-level field: ${k}`);
    }
  });

  return errors;
}
