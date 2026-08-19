import { NextRequest } from 'next/server';
import { unsubscribeMarketingInvite } from '@/lib/email-campaigns';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return new Response('Missing unsubscribe token.', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  await unsubscribeMarketingInvite(token);
  return new Response('You have been unsubscribed from this ClinicPlus Companion invite sequence.', {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
