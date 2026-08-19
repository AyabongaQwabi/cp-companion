/**
 * Reimplements clinicplus-server-latest-stable-version/lib/helpers/appointment.js
 * getAppointmentId exactly: first 2 letters of company name (uppercased) + 2 random letters +
 * 6 random digits + first 3 letters of clinic (uppercased). Falls back to a 4-letter + 6-digit +
 * "NCS" format if company/clinic are missing, matching the source.
 */

function generateOrderId(length: number): string {
  const characters = '0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result.toUpperCase();
}

function generateOrderIdSTR(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result.toUpperCase();
}

export function getAppointmentId(companyName?: string | null, clinic?: string | null): string {
  const exists = (i: unknown) => i !== null && i !== undefined && i !== '';
  if (!exists(companyName) || !exists(clinic)) {
    const orderIdSTR = generateOrderIdSTR(4);
    const orderId = generateOrderId(6);
    return `${orderIdSTR}${orderId}NCS`;
  }
  const regStr = companyName!.trim().slice(0, 2).toUpperCase();
  const clinicStr = clinic!.slice(0, 3).toUpperCase();
  const orderIdSTR = generateOrderIdSTR(2);
  const orderId = generateOrderId(6);
  return `${regStr}${orderIdSTR}${orderId}${clinicStr}`;
}
