import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt-nodejs';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';

interface ChangePasswordBody {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

/**
 * Changes production.users.hash (and the pre-existing plaintext `password` field the legacy
 * server also writes alongside it — see lib/data/login/index.js resetPassword, lines 185-191).
 * Must hash with bcrypt-nodejs's hashSync(password) — no explicit salt rounds — the exact same
 * call the legacy server uses, so the resulting hash format stays compatible with loginUser's
 * bcrypt.compare against `hash` in cp-redesign/cp-redesign-admin. Requires the current password
 * to verify (same compare call as verifyLogin in lib/auth.ts) before allowing a change.
 */
export async function PATCH(req: NextRequest) {
  const body: ChangePasswordBody = await req.json();
  const { userId, currentPassword, newPassword } = body;

  if (!userId || !currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'userId, currentPassword, and newPassword required' },
      { status: 400 }
    );
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const usersCollection = prodDb.collection('users');
  const user = await usersCollection.findOne({ id: userId });
  if (!user) {
    return NextResponse.json({ error: 'User not found in production.users' }, { status: 404 });
  }

  const currentIsValid = await new Promise<boolean>((resolve, reject) => {
    bcrypt.compare(currentPassword, user.hash, (err: Error | null, res: boolean) => {
      if (err) reject(err);
      else resolve(!!res);
    });
  });
  if (!currentIsValid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
  }

  const charge = await chargeForAction(userId, 'profile.changePassword');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const newHash = bcrypt.hashSync(newPassword);
  await usersCollection.updateOne(
    { _id: user._id },
    { $set: { hash: newHash, password: newPassword } }
  );

  const companionDb = await getCompanionDb();
  await companionDb.collection('auditLog').insertOne({
    action: 'CHANGE_PASSWORD',
    userId,
    at: new Date(),
  });

  return NextResponse.json({ ok: true });
}
