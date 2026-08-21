import { NextRequest, NextResponse } from 'next/server';
import { adminStatsCorsPreflight, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { getCompanionDb } from '@/lib/mongodb';
import { logUserLoginEvent, type LoginEventRole, type LoginEventSource } from '@/lib/usage-tracking';

const VALID_EVENTS = ['login', 'signup'] as const;
const VALID_ROLES: LoginEventRole[] = ['client', 'admin'];
const VALID_SOURCES: LoginEventSource[] = ['cp-redesign', 'cp-redesign-admin', 'cp-companion'];

export function OPTIONS() {
  return adminStatsCorsPreflight();
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const eventType = typeof body.eventType === 'string' ? body.eventType : '';
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const role = typeof body.role === 'string' ? body.role : '';
  const source = typeof body.source === 'string' ? body.source : '';

  if (!VALID_EVENTS.includes(eventType as (typeof VALID_EVENTS)[number])) {
    return withAdminStatsCors(NextResponse.json({ error: 'eventType must be login or signup' }, { status: 400 }));
  }
  if (!userId) {
    return withAdminStatsCors(NextResponse.json({ error: 'userId is required' }, { status: 400 }));
  }
  if (!VALID_ROLES.includes(role as LoginEventRole) || !VALID_SOURCES.includes(source as LoginEventSource)) {
    return withAdminStatsCors(NextResponse.json({ error: 'Invalid role or source' }, { status: 400 }));
  }

  const now = new Date();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const event = {
    eventType,
    userId,
    role,
    source,
    userName: typeof body.userName === 'string' ? body.userName : null,
    email: typeof body.email === 'string' ? body.email : null,
    companyIds: stringArray(body.companyIds),
    companyNames: stringArray(body.companyNames),
    userAgent: req.headers.get('user-agent'),
    ip,
    device: objectValue(body.device),
    location: objectValue(body.location),
    locationPermission: typeof body.locationPermission === 'string' ? body.locationPermission : 'unknown',
    metadata: objectValue(body.metadata),
    createdAt: now,
  };

  const db = await getCompanionDb();
  await db.collection('userJourneyEvents').insertOne(event);
  await db.collection('userJourneyEvents').createIndex({ createdAt: -1 });
  await db.collection('userJourneyEvents').createIndex({ eventType: 1, createdAt: -1 });
  await db.collection('userJourneyEvents').createIndex({ userId: 1, createdAt: -1 });

  if (eventType === 'login') {
    await logUserLoginEvent({
      userId,
      role: role as LoginEventRole,
      source: source as LoginEventSource,
      userName: event.userName,
      email: event.email,
      companyIds: event.companyIds,
      companyNames: event.companyNames,
      userAgent: event.userAgent,
      ip,
      metadata: {
        ...(event.metadata || {}),
        device: event.device,
        location: event.location,
        locationPermission: event.locationPermission,
      },
      createdAt: now,
    });
  }

  return withAdminStatsCors(NextResponse.json({ ok: true }, { status: 201 }));
}
