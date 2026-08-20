import { NextResponse } from 'next/server';
import { withAdminStatsCors } from '@/lib/admin-stats-cors';
import { isControlCurrentlyEnabled, listPlatformControls } from '@/lib/platform-controls';

export async function OPTIONS() {
  return withAdminStatsCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    const controls = await listPlatformControls();
    return withAdminStatsCors(
      NextResponse.json({
        controls: controls.map((control) => ({
          key: control.key,
          enabled: isControlCurrentlyEnabled(control),
          publicMessage: control.publicMessage || '',
          expiresAt: control.expiresAt || null,
        })),
      })
    );
  } catch {
    return withAdminStatsCors(
      NextResponse.json({
        controls: [],
        unavailable: true,
        message: 'Platform status is temporarily unavailable.',
      })
    );
  }
}
