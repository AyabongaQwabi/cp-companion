import { NextRequest, NextResponse } from 'next/server';
import { acceptTerms, getTermsStatus } from '@/lib/terms';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  const status = await getTermsStatus(userId);
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  const { userId, emailConsent } = await req.json();
  if (!userId || typeof emailConsent !== 'boolean') {
    return NextResponse.json(
      { error: 'userId and boolean emailConsent required' },
      { status: 400 }
    );
  }
  const result = await acceptTerms(userId, emailConsent);
  return NextResponse.json(result);
}
