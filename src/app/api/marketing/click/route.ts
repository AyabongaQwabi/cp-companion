import { NextRequest, NextResponse } from 'next/server';
import { markMarketingInviteClicked } from '@/lib/email-campaigns';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const invite = await markMarketingInviteClicked(token);
  if (!invite) {
    return NextResponse.redirect(new URL('/login?invite=invalid', req.url));
  }

  return NextResponse.redirect(new URL(`/login?invite=${encodeURIComponent(token)}`, req.url));
}
