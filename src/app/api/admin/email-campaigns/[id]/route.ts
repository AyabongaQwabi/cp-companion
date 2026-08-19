import { NextRequest, NextResponse } from 'next/server';
import {
  enrollMarketingCampaignAudience,
  previewMarketingCampaignAudience,
} from '@/lib/email-campaigns';
import { isSuperadmin } from '@/lib/roles';

async function canManageCampaign(req: NextRequest, userId?: string) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  return !!userId && (await isSuperadmin(userId));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.nextUrl.searchParams.get('userId') || undefined;
  if (!(await canManageCampaign(req, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(await previewMarketingCampaignAudience(id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (!(await canManageCampaign(req, body.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (body.dryRun) {
    return NextResponse.json(await previewMarketingCampaignAudience(id));
  }

  return NextResponse.json(await enrollMarketingCampaignAudience(id), { status: 201 });
}
