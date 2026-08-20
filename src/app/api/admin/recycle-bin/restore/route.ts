import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { logAuditEvent } from '@/lib/audit';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

const MAP: Record<string, { deleted: string; live: string; entityType: 'appointment' | 'company' | 'user' }> = {
  appointment: { deleted: 'deleted_appointments', live: 'appointments', entityType: 'appointment' },
  company: { deleted: 'deleted_companies', live: 'companies', entityType: 'company' },
  user: { deleted: 'deleted_users', live: 'users', entityType: 'user' },
};

export async function POST(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const type = String(body.type || '');
    const id = String(body.id || '');
    const config = MAP[type];
    if (!config || !id) {
      return withAdminStatsCors(NextResponse.json({ error: 'type and id are required' }, { status: 400 }));
    }
    if (body.confirmText !== `RESTORE ${id}`) {
      return withAdminStatsCors(
        NextResponse.json({ error: `Type RESTORE ${id} to confirm restore` }, { status: 400 })
      );
    }

    const prodDb = await getProductionDb();
    const deletedCollection = prodDb.collection(config.deleted);
    const liveCollection = prodDb.collection(config.live);
    const query = ObjectId.isValid(id) ? { $or: [{ id }, { _id: new ObjectId(id) }] } : { id };
    const snapshot = await deletedCollection.findOne(query);
    if (!snapshot) {
      return withAdminStatsCors(NextResponse.json({ error: 'Deleted record not found' }, { status: 404 }));
    }

    const { _id, ...restored } = snapshot;
    await liveCollection.updateOne({ id: snapshot.id || id }, { $set: restored }, { upsert: true });
    await deletedCollection.deleteOne({ _id });

    await logAuditEvent({
      entityType: config.entityType,
      entityId: String(snapshot.id || id),
      action: 'entity_restored',
      actorType: 'admin',
      actorId: body.actorId || null,
      actorName: body.actorName || null,
      source: 'cp-redesign-admin',
      metadata: { snapshot },
    });

    return withAdminStatsCors(NextResponse.json({ ok: true, restored }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
