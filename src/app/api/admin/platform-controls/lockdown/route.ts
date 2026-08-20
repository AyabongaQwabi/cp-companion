import { NextRequest, NextResponse } from 'next/server';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { setAllPlatformControls } from '@/lib/platform-controls';
import { logAuditEvent } from '@/lib/audit';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function POST(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const confirmText = String(body.confirmText || '');
    if (confirmText !== 'GLOBAL LOCKDOWN') {
      return withAdminStatsCors(
        NextResponse.json({ error: 'Type GLOBAL LOCKDOWN to confirm this action' }, { status: 400 })
      );
    }

    const { before, after } = await setAllPlatformControls({
      enabled: Boolean(body.enabled),
      reason: String(body.reason || ''),
      publicMessage: typeof body.publicMessage === 'string' ? body.publicMessage : '',
      expiresAt: body.expiresAt || null,
      setBy: body.actorId || null,
    });

    await logAuditEvent({
      entityType: 'platform_control',
      entityId: 'global_lockdown',
      action: 'platform_control_changed',
      actorType: 'admin',
      actorId: body.actorId || null,
      actorName: body.actorName || null,
      source: 'cp-redesign-admin',
      metadata: { before, after, reason: String(body.reason || '') },
    });

    return withAdminStatsCors(NextResponse.json({ controls: after }));
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
