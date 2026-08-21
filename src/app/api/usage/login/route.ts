import { NextRequest, NextResponse } from 'next/server';
import { adminStatsCorsPreflight, withAdminStatsCors } from '@/lib/admin-stats-cors';
import {
  logUserLoginEvent,
  type LoginEventRole,
  type LoginEventSource,
} from '@/lib/usage-tracking';

const VALID_ROLES: LoginEventRole[] = ['client', 'admin'];
const VALID_SOURCES: LoginEventSource[] = ['cp-redesign', 'cp-redesign-admin', 'cp-companion'];

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const role = typeof body.role === 'string' ? body.role : '';
  const source = typeof body.source === 'string' ? body.source : '';

  if (!userId) {
    return withAdminStatsCors(NextResponse.json({ error: 'userId is required' }, { status: 400 }));
  }
  if (!VALID_ROLES.includes(role as LoginEventRole)) {
    return withAdminStatsCors(
      NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 })
    );
  }
  if (!VALID_SOURCES.includes(source as LoginEventSource)) {
    return withAdminStatsCors(
      NextResponse.json({ error: `source must be one of: ${VALID_SOURCES.join(', ')}` }, { status: 400 })
    );
  }

  const companyIds = Array.isArray(body.companyIds)
    ? body.companyIds.filter((value): value is string => typeof value === 'string')
    : [];
  const companyNames = Array.isArray(body.companyNames)
    ? body.companyNames.filter((value): value is string => typeof value === 'string')
    : [];
  const createdAt =
    typeof body.createdAt === 'string' && !Number.isNaN(new Date(body.createdAt).getTime())
      ? new Date(body.createdAt)
      : new Date();

  await logUserLoginEvent({
    userId,
    role: role as LoginEventRole,
    source: source as LoginEventSource,
    userName: typeof body.userName === 'string' ? body.userName : null,
    email: typeof body.email === 'string' ? body.email : null,
    companyIds,
    companyNames,
    userAgent: req.headers.get('user-agent'),
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    metadata:
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : undefined,
    createdAt,
  });

  return withAdminStatsCors(NextResponse.json({ ok: true }, { status: 201 }));
}
