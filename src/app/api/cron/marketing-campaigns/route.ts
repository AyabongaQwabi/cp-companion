import { NextRequest, NextResponse } from 'next/server';
import { sendDueMarketingCampaignEmails } from '@/lib/email-campaigns';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const campaignId =
    req.nextUrl.searchParams.get('campaignId') || 'clinicplus-companion-client-invite';
  const limit = Number(req.nextUrl.searchParams.get('limit') || 0) || undefined;
  return NextResponse.json(await sendDueMarketingCampaignEmails(campaignId, limit));
}
