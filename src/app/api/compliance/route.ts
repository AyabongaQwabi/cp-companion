import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import { computeRosterCompliance } from '@/lib/compliance';
import type { RosterEmployee, ServiceValidityPeriod } from '@/lib/types';

/**
 * Company-scoped-by-filter: base query is the logged-in user's own roster (userId), with an
 * optional companyId filter using the same { companyIds: id } pattern as
 * /api/companies/[id]/employees — mirrors how the rest of the app already scopes, since wallets
 * and roster data are user-scoped by design, not company-scoped.
 *
 * Charges compliance.open (5 credits) once per dashboard load, not per employee/row.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const companyId = req.nextUrl.searchParams.get('companyId');
  const statusFilter = req.nextUrl.searchParams.get('status'); // 'expired' | 'expiring-soon' | 'valid'
  const leadDays = parseInt(req.nextUrl.searchParams.get('leadDays') || '30', 10);
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(250, Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '20', 10)));
  const shouldCharge = req.nextUrl.searchParams.get('charge') === '1';

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  if (shouldCharge) {
    const charge = await chargeForAction(userId, 'compliance.open');
    if (!charge.ok) {
      return NextResponse.json(charge, { status: 402 });
    }
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();

  const rosterQuery: Record<string, unknown> = { userId, status: { $ne: 'terminated' } };
  if (companyId) rosterQuery.companyIds = companyId;

  const [rosterEmployees, validityPeriods] = await Promise.all([
    companionDb.collection<RosterEmployee>('employees').find(rosterQuery).toArray(),
    companionDb.collection<ServiceValidityPeriod>('serviceValidityPeriods').find().toArray(),
  ]);

  let entries = await computeRosterCompliance(prodDb, rosterEmployees, validityPeriods, leadDays);

  if (statusFilter) {
    entries = entries.filter((e) => e.status === statusFilter);
  }

  entries.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  const total = entries.length;
  const paged = entries.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({ entries: paged, total, page, pageSize, inert: validityPeriods.length === 0 });
}
