import { NextRequest, NextResponse } from 'next/server';
import { verifyLogin, companiesForUser } from '@/lib/auth';
import { grantSignupBonusIfFirstLogin, getOrCreateWallet } from '@/lib/credits';
import { seedMissingServiceValidityPeriods } from '@/lib/compliance';

export async function POST(req: NextRequest) {
  const { email, password, inviteToken } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const user = await verifyLogin(email, password);
  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const companies = companiesForUser(user);

  await seedMissingServiceValidityPeriods();
  await grantSignupBonusIfFirstLogin(user.id, companies[0]?.id, inviteToken);
  const wallet = await getOrCreateWallet(user.id);

  return NextResponse.json({
    id: user.id,
    name: user.details.name,
    surname: user.details.surname,
    email: user.details.email,
    companies,
    creditBalance: wallet.balance,
  });
}
