import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { computeComplianceChampion } from '@/lib/compliance-champion';
import type { CompanyCompliancePreferences, Company } from '@/lib/types';

/**
 * Fully public, unauthenticated — the token itself is the only access control. Returns strictly
 * aggregate data: a compliant-employee count and a date, nothing else. Never a name, ID number,
 * or any other roster detail — see the "no personal data" requirement in the spec this implements.
 * Any lookup miss (bad token, or a real token whose company has since disabled the page)
 * responds identically (404) so a guessed/former token can't be used to distinguish
 * "never existed" from "was turned off".
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const companionDb = await getCompanionDb();
  const prefs = await companionDb
    .collection<CompanyCompliancePreferences>('companyCompliancePreferences')
    .findOne({ publicToken: token, publicPageEnabled: true });

  if (!prefs) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const productionDb = await getProductionDb();
  const company = await productionDb.collection<Company>('companies').findOne({ id: prefs.companyId });

  const champion = await computeComplianceChampion(companionDb, prefs.companyId);

  return NextResponse.json({
    companyName: company?.details?.name || 'This company',
    compliantCount: champion.compliantCount,
    totalTrackedCount: champion.totalTrackedCount,
    trackedServiceCount: champion.trackedServiceCount,
    totalServiceCount: champion.totalServiceCount,
    asOfDate: champion.asOfDate,
  });
}
