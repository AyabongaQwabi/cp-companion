/**
 * Grouping of MEDICAL_SERVICES ids into logical categories for the redesigned service selector
 * (Part F.6) — presentation-only, not part of the constants file itself (which stays verbatim
 * per clinicplus-constants.ts's own comment). Every id in MEDICAL_SERVICES must appear in exactly
 * one category here.
 */
export const SERVICE_CATEGORIES: { label: string; serviceIds: string[] }[] = [
  {
    label: 'Medicals',
    serviceIds: [
      'mine-medical-with-induction',
      'mine-medical-no-induction',
      'black-wattle-atoll-medical',
      'power-construction-other-medical',
      'induction',
    ],
  },
  {
    label: 'Screening & tests',
    serviceIds: [
      '6-in-1-drug-test',
      'cannabis',
      'pregnancy-test',
      'sugar-test',
      'hiv',
      'covid-19-screen-questionnaire',
    ],
  },
  {
    label: 'Exit / clearance',
    serviceIds: ['clearance', 'full-exit-medical', 'short-exit-medical'],
  },
  {
    label: 'Other',
    serviceIds: ['other'],
  },
];
