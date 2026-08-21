import { getCompanionDb } from '@/lib/mongodb';

export type LoginEventSource = 'cp-redesign' | 'cp-redesign-admin' | 'cp-companion';
export type LoginEventRole = 'client' | 'admin';

export interface UserLoginEvent {
  _id?: string;
  userId: string;
  role: LoginEventRole;
  source: LoginEventSource;
  userName?: string | null;
  email?: string | null;
  companyIds?: string[];
  companyNames?: string[];
  userAgent?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

let indexesEnsured = false;

export async function ensureUsageIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const db = await getCompanionDb();
  const collection = db.collection<UserLoginEvent>('userLoginEvents');
  await Promise.all([
    collection.createIndex({ createdAt: -1 }),
    collection.createIndex({ role: 1, createdAt: -1 }),
    collection.createIndex({ source: 1, createdAt: -1 }),
    collection.createIndex({ userId: 1, createdAt: -1 }),
  ]);
  indexesEnsured = true;
}

export async function logUserLoginEvent(event: Omit<UserLoginEvent, 'createdAt'> & { createdAt?: Date }) {
  await ensureUsageIndexes();
  const db = await getCompanionDb();
  await db.collection<UserLoginEvent>('userLoginEvents').insertOne({
    ...event,
    createdAt: event.createdAt ?? new Date(),
  });
}
