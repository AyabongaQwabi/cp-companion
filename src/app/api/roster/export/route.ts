import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import type { RosterEmployee, EmployeeGroup } from '@/lib/types';

/**
 * Export the current roster to CSV — flat 3-credit charge per export (not per employee), reusing
 * the company's own data (POPIA-flavored reasoning doesn't change the confirmed price here, just
 * the original motivation for considering free). Defaults to excluding terminated employees,
 * matching every other list view's default; ?includeTerminated=1 overrides.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const includeTerminated = req.nextUrl.searchParams.get('includeTerminated') === '1';

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const charge = await chargeForAction(userId, 'roster.exportCsv');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const companionDb = await getCompanionDb();
  const prodDb = await getProductionDb();

  const query: Record<string, unknown> = includeTerminated ? { userId } : { userId, status: { $ne: 'terminated' } };
  const [employees, groups] = await Promise.all([
    companionDb.collection<RosterEmployee>('employees').find(query).sort({ name: 1 }).toArray(),
    companionDb.collection<EmployeeGroup>('employeeGroups').find({ userId }).toArray(),
  ]);

  const groupNameById = new Map(groups.map((g) => [g._id, g.name]));
  const allCompanyIds = Array.from(new Set(employees.flatMap((e) => e.companyIds || [])));
  const companies = allCompanyIds.length
    ? await prodDb.collection('companies').find({ id: { $in: allCompanyIds } }).toArray()
    : [];
  const companyNameById = new Map(companies.map((c) => [c.id, c.details?.name || c.id]));

  const rows = employees.map((e) => ({
    name: e.name,
    idNumber: e.idNumber,
    occupation: e.occupation,
    status: e.status,
    sites: (e.defaultSites || []).map((s) => s.name).join('; '),
    groups: (e.groupIds || []).map((gid) => groupNameById.get(gid) || gid).join('; '),
    companies: (e.companyIds || []).map((cid) => companyNameById.get(cid) || cid).join('; '),
  }));

  const csv = Papa.unparse(rows, { columns: ['name', 'idNumber', 'occupation', 'status', 'sites', 'groups', 'companies'] });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="roster-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
