import { NextRequest, NextResponse } from 'next/server';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { logAuditEvent } from '@/lib/audit';
import { getProductionDb } from '@/lib/mongodb';

const EDITABLE_DETAIL_FIELDS = ['name', 'surname', 'email', 'contactNumber', 'picture'] as const;

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return withAdminStatsCors(NextResponse.json({ error: 'userId is required' }, { status: 400 }));
  }

  try {
    const db = await getProductionDb();
    const user = await db.collection('users').findOne({ id: userId });
    if (!user) {
      return withAdminStatsCors(NextResponse.json({ error: 'User not found' }, { status: 404 }));
    }

    return withAdminStatsCors(
      NextResponse.json({
        user: {
          id: user.id,
          role: user.role,
          details: {
            name: user.details?.name || '',
            surname: user.details?.surname || '',
            email: user.details?.email || '',
            contactNumber: user.details?.contactNumber || '',
            picture: user.details?.picture || '',
            adminType: user.details?.adminType || '',
          },
        },
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}

export async function PATCH(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const userId = String(body.userId || '');
    const details = body.details || {};
    if (!userId) {
      return withAdminStatsCors(NextResponse.json({ error: 'userId is required' }, { status: 400 }));
    }

    const updates: Record<string, string> = {};
    for (const field of EDITABLE_DETAIL_FIELDS) {
      if (details[field] !== undefined) {
        updates[`details.${field}`] = String(details[field]).trim();
      }
    }
    if (!Object.keys(updates).length) {
      return withAdminStatsCors(NextResponse.json({ error: 'No profile fields provided' }, { status: 400 }));
    }

    const db = await getProductionDb();
    const users = db.collection('users');
    const before = await users.findOne({ id: userId });
    if (!before) {
      return withAdminStatsCors(NextResponse.json({ error: 'User not found' }, { status: 404 }));
    }

    await users.updateOne({ _id: before._id }, { $set: updates });
    const updated = await users.findOne({ _id: before._id });

    await logAuditEvent({
      entityType: 'user',
      entityId: userId,
      action: 'profile_updated',
      actorType: 'admin',
      actorId: body.actorId || userId,
      actorName: body.actorName || null,
      source: 'cp-redesign-admin',
      changes: Object.keys(updates).map((path) => ({
        field: path,
        before: path.split('.').reduce((value: any, key) => value?.[key], before),
        after: path.split('.').reduce((value: any, key) => value?.[key], updated),
      })),
    });

    return withAdminStatsCors(
      NextResponse.json({
        user: {
          id: updated?.id,
          role: updated?.role,
          details: updated?.details || {},
        },
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
