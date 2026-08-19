import bcrypt from 'bcrypt-nodejs';
import { getProductionDb } from './mongodb';

/**
 * Verifies against production.users the same way
 * clinicplus-server-latest-stable-version/lib/data/login/index.js loginUser does: lookup by
 * details.email, compare against user.hash with bcrypt. Read-only — never writes to
 * production.users here (the appointmentsManaging write happens only at appointment-creation
 * time, mirroring saveNewAppointment).
 */
export interface ClinicPlusUser {
  id: string;
  _id: unknown;
  details: { name: string; surname: string; email: string; contactNumber?: string };
  companiesCanEdit: { id: string; name: string }[];
  companiesManaging: { id: string; name: string }[];
  role: string;
}

export async function verifyLogin(email: string, password: string): Promise<ClinicPlusUser | null> {
  const db = await getProductionDb();
  const users = db.collection('users');
  const user = await users.findOne({ 'details.email': email });
  if (!user) return null;

  const isValid = await new Promise<boolean>((resolve, reject) => {
    bcrypt.compare(password, user.hash, (err: Error | null, res: boolean) => {
      if (err) reject(err);
      else resolve(!!res);
    });
  });

  if (!isValid) return null;
  if (user.role !== 'client') return null;

  return user as unknown as ClinicPlusUser;
}

export function companiesForUser(user: ClinicPlusUser): { id: string; name: string }[] {
  const seen = new Set<string>();
  const combined = [...(user.companiesCanEdit || []), ...(user.companiesManaging || [])];
  return combined.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}
