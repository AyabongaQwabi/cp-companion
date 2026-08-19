/**
 * Exact NDA text from cp-redesign/src/pages/appointments/appointment/create/index.js:859-950,
 * with the same variable substitution. This text must not be altered — the resulting PDF must be
 * indistinguishable from one the real app would have produced.
 */
export function buildNdaText(vars: {
  userName: string;
  userSurname: string;
  companyName: string;
  userEmail: string;
}): string {
  const { userName, userSurname, companyName, userEmail } = vars;
  return `This non-disclosure agreement is entered into the parties above for the purpose of preventing unauthorized disclosure of confidential information. This agreement is for non-medical professional staff that in the course of their duties are required to deal with potentially sensitive confidential employee information and records.

I ${userName} ${userSurname} am fully authorised by ${companyName} to request and receive the medical information of the employees of ${companyName} who have done their medical screening for fitness to work at ClinicPlus, Witbank. The information will only be used for the purpose of verification of these medicals at other clinics. The email address to be used for this purpose: ${userEmail}

I am aware that I deal with confidential medical and other information of the employees. I agree to keep confidential all information which I may become aware of in dealing with medical records of employees. This includes direct disclosure as well as indirect disclosure to any person.

I hereby declare that the employees of ${companyName} have been informed of the fact that I will be dealing with their medical records and that they have given their consent to this.`;
}
