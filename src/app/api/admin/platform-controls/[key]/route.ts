import { NextRequest, NextResponse } from 'next/server';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { isPlatformControlKey, setPlatformControl } from '@/lib/platform-controls';
import { logAuditEvent } from '@/lib/audit';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const { key } = await params;
  if (!isPlatformControlKey(key)) {
    return withAdminStatsCors(NextResponse.json({ error: 'Unknown platform control' }, { status: 404 }));
  }

  try {
    const body = await req.json();
    const confirmText = String(body.confirmText || '');
    if (confirmText !== key) {
      return withAdminStatsCors(
        NextResponse.json({ error: `Type ${key} to confirm this platform-control change` }, { status: 400 })
      );
    }

    const { before, after } = await setPlatformControl(key, {
      enabled: Boolean(body.enabled),
      reason: String(body.reason || ''),
      publicMessage: typeof body.publicMessage === 'string' ? body.publicMessage : '',
      expiresAt: body.expiresAt || null,
      setBy: body.actorId || null,
    });

    await logAuditEvent({
      entityType: 'platform_control',
      entityId: key,
      action: 'platform_control_changed',
      actorType: 'admin',
      actorId: body.actorId || null,
      actorName: body.actorName || null,
      source: 'cp-redesign-admin',
      changes: [{ field: 'enabled', before: before.enabled, after: after.enabled }],
      metadata: { before, after, reason: after.reason, publicMessage: after.publicMessage },
    });

    return withAdminStatsCors(NextResponse.json({ control: after }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
