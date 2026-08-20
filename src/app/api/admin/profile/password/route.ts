import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt-nodejs';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { logAuditEvent } from '@/lib/audit';
import { getProductionDb } from '@/lib/mongodb';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function PATCH(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const userId = String(body.userId || '');
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');

    if (!userId || !currentPassword || !newPassword) {
      return withAdminStatsCors(
        NextResponse.json({ error: 'userId, currentPassword, and newPassword are required' }, { status: 400 })
      );
    }
    if (newPassword.length < 8) {
      return withAdminStatsCors(NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 }));
    }

    const db = await getProductionDb();
    const users = db.collection('users');
    const user = await users.findOne({ id: userId });
    if (!user) {
      return withAdminStatsCors(NextResponse.json({ error: 'User not found' }, { status: 404 }));
    }

    const currentIsValid = await new Promise<boolean>((resolve, reject) => {
      bcrypt.compare(currentPassword, user.hash, (err: Error | null, res: boolean) => {
        if (err) reject(err);
        else resolve(!!res);
      });
    });
    if (!currentIsValid) {
      return withAdminStatsCors(NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 }));
    }

    const newHash = bcrypt.hashSync(newPassword);
    await users.updateOne({ _id: user._id }, { $set: { hash: newHash, password: newPassword } });

    await logAuditEvent({
      entityType: 'user',
      entityId: userId,
      action: 'password_changed',
      actorType: 'admin',
      actorId: body.actorId || userId,
      actorName: body.actorName || null,
      source: 'cp-redesign-admin',
    });

    return withAdminStatsCors(NextResponse.json({ ok: true }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
