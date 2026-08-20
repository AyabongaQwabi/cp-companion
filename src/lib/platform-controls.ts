import { getCompanionDb } from '@/lib/mongodb';

export const PLATFORM_CONTROL_KEYS = [
  'block_new_appointments',
  'block_new_signups',
  'block_new_companies',
  'block_admin_creation',
] as const;

export type PlatformControlKey = (typeof PLATFORM_CONTROL_KEYS)[number];

export interface PlatformControl {
  key: PlatformControlKey;
  enabled: boolean;
  reason: string;
  publicMessage?: string;
  expiresAt?: Date | null;
  setBy?: string | null;
  setAt?: Date | null;
}

export class PlatformControlBlockedError extends Error {
  control: PlatformControl;

  constructor(control: PlatformControl) {
    super(
      control.publicMessage ||
        'This action is temporarily unavailable. Please try again later or contact support.'
    );
    this.name = 'PlatformControlBlockedError';
    this.control = control;
  }
}

export function isPlatformControlKey(value: string): value is PlatformControlKey {
  return PLATFORM_CONTROL_KEYS.includes(value as PlatformControlKey);
}

function defaultControl(key: PlatformControlKey): PlatformControl {
  return {
    key,
    enabled: false,
    reason: '',
    publicMessage: '',
    expiresAt: null,
    setBy: null,
    setAt: null,
  };
}

function normalizeControl(key: PlatformControlKey, doc?: Partial<PlatformControl> | null) {
  return {
    ...defaultControl(key),
    ...doc,
    key,
    enabled: Boolean(doc?.enabled),
    expiresAt: doc?.expiresAt ? new Date(doc.expiresAt) : null,
    setAt: doc?.setAt ? new Date(doc.setAt) : null,
  };
}

export async function listPlatformControls(): Promise<PlatformControl[]> {
  const db = await getCompanionDb();
  const docs = await db
    .collection<PlatformControl>('platformControls')
    .find({ key: { $in: [...PLATFORM_CONTROL_KEYS] } })
    .toArray();
  const byKey = new Map(docs.map((doc) => [doc.key, doc]));
  return PLATFORM_CONTROL_KEYS.map((key) => normalizeControl(key, byKey.get(key)));
}

export async function getPlatformControl(key: PlatformControlKey): Promise<PlatformControl> {
  const db = await getCompanionDb();
  const doc = await db.collection<PlatformControl>('platformControls').findOne({ key });
  return normalizeControl(key, doc);
}

export function isControlCurrentlyEnabled(control: PlatformControl): boolean {
  if (!control.enabled) return false;
  if (!control.expiresAt) return true;
  return new Date(control.expiresAt).getTime() > Date.now();
}

export async function assertPlatformControlAllows(key: PlatformControlKey): Promise<void> {
  const control = await getPlatformControl(key);
  if (isControlCurrentlyEnabled(control)) {
    throw new PlatformControlBlockedError(control);
  }
}

export async function setPlatformControl(
  key: PlatformControlKey,
  params: {
    enabled: boolean;
    reason: string;
    publicMessage?: string;
    expiresAt?: string | Date | null;
    setBy?: string | null;
  }
): Promise<{ before: PlatformControl; after: PlatformControl }> {
  const reason = params.reason?.trim();
  if (!reason) {
    throw new Error('A reason is required');
  }

  const before = await getPlatformControl(key);
  const after: PlatformControl = {
    key,
    enabled: Boolean(params.enabled),
    reason,
    publicMessage: params.publicMessage?.trim() || '',
    expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
    setBy: params.setBy || null,
    setAt: new Date(),
  };

  const db = await getCompanionDb();
  await db
    .collection<PlatformControl>('platformControls')
    .updateOne({ key }, { $set: after }, { upsert: true });

  return { before, after };
}

export async function setAllPlatformControls(
  params: {
    enabled: boolean;
    reason: string;
    publicMessage?: string;
    expiresAt?: string | Date | null;
    setBy?: string | null;
  }
): Promise<{ before: PlatformControl[]; after: PlatformControl[] }> {
  const before = await listPlatformControls();
  const after = await Promise.all(
    PLATFORM_CONTROL_KEYS.map((key) => setPlatformControl(key, params).then((result) => result.after))
  );
  return { before, after };
}
