import { NextRequest, NextResponse } from 'next/server';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import { getCompanionDb } from '@/lib/mongodb';

export function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days') || 30), 1), 365);
  const since = new Date(Date.now() - days * 86400000);
  const db = await getCompanionDb();
  const events = await db
    .collection('userJourneyEvents')
    .find({ createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();

  const by = (selector: (event: Record<string, unknown>) => string) => {
    const counts = new Map<string, number>();
    for (const event of events as Record<string, unknown>[]) {
      const key = selector(event) || 'Unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  };

  return withAdminStatsCors(
    NextResponse.json({
      days,
      total: events.length,
      byEventType: by((event) => String(event.eventType || 'Unknown')),
      bySource: by((event) => String(event.source || 'Unknown')),
      byDevice: by((event) => String((event.device as Record<string, unknown> | undefined)?.deviceType || 'Unknown')),
      byBrowser: by((event) => String((event.device as Record<string, unknown> | undefined)?.browser || 'Unknown')),
      byOs: by((event) => String((event.device as Record<string, unknown> | undefined)?.os || 'Unknown')),
      byLocationPermission: by((event) => String(event.locationPermission || 'unknown')),
      events: events.map((event) => ({
        _id: event._id,
        eventType: event.eventType,
        userId: event.userId,
        userName: event.userName,
        email: event.email,
        source: event.source,
        device: event.device,
        location: event.location,
        locationPermission: event.locationPermission,
        ip: event.ip,
        createdAt: event.createdAt,
      })),
    })
  );
}
