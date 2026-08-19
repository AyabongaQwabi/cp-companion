import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { computeRosterCompliance } from '@/lib/compliance';
import type { RosterEmployee, ServiceValidityPeriod } from '@/lib/types';
import type { ComplianceStatus } from '@/lib/compliance';

/**
 * Batched worst-status-per-employee summary, backing the roster list's compliance badge — one
 * aggregation for the whole roster, not one compliance computation per row. Free (no charge):
 * this is a compact summary for a badge, not the full compliance dashboard view.
 */
const SEVERITY: Record<ComplianceStatus, number> = { expired: 2, 'expiring-soon': 1, valid: 0 };

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();

  const [rosterEmployees, validityPeriods] = await Promise.all([
    companionDb.collection<RosterEmployee>('employees').find({ userId, status: { $ne: 'terminated' } }).toArray(),
    companionDb.collection<ServiceValidityPeriod>('serviceValidityPeriods').find().toArray(),
  ]);

  const entries = await computeRosterCompliance(prodDb, rosterEmployees, validityPeriods, 30);

  const worstByEmployee: Record<string, ComplianceStatus> = {};
  const draftByEmployee: Record<string, boolean> = {};
  for (const entry of entries) {
    const current = worstByEmployee[entry.rosterEmployeeId];
    if (!current || SEVERITY[entry.status] > SEVERITY[current]) {
      worstByEmployee[entry.rosterEmployeeId] = entry.status;
    }
    if (entry.isDraft) draftByEmployee[entry.rosterEmployeeId] = true;
  }

  return NextResponse.json({ summary: worstByEmployee, draft: draftByEmployee });
}
