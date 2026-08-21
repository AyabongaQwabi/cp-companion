import { NextRequest, NextResponse } from 'next/server';
import { verifyLogin, companiesForUser } from '@/lib/auth';
import { grantSignupBonusIfFirstLogin, getOrCreateWallet } from '@/lib/credits';
import { seedMissingServiceValidityPeriods } from '@/lib/compliance';
import { logUserLoginEvent } from '@/lib/usage-tracking';

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
  logUserLoginEvent({
    userId: user.id,
    role: 'client',
    source: 'cp-companion',
    userName: [user.details.name, user.details.surname].filter(Boolean).join(' '),
    email: user.details.email,
    companyIds: companies.map((company) => company.id),
    companyNames: companies.map((company) => company.name),
    metadata: inviteToken ? { inviteTokenPresent: true } : undefined,
  }).catch((error) => {
    console.warn('[usage] failed to record Companion login', error);
  });

  return NextResponse.json({
    id: user.id,
    name: user.details.name,
    surname: user.details.surname,
    email: user.details.email,
    companies,
    creditBalance: wallet.balance,
  });
}
