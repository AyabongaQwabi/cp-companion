import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import type { RosterEmployee, RosterEmployeeSite } from '@/lib/types';

interface BulkAddSiteBody {
  userId: string;
  employeeIds: string[];
  site: { id: string; name: string; hasAccessCard?: boolean };
}

/**
 * Adds one site to defaultSites on every given employee — additive (via each employee's
 * existing sites, deduped by site id), never replaces an employee's other sites. Priced per
 * employee actually added (F.1) — employees who already have the site are skipped and not
 * charged again for a no-op.
 */
export async function POST(req: NextRequest) {
  const body: BulkAddSiteBody = await req.json();
  const { userId, employeeIds, site } = body;

  if (!userId || !Array.isArray(employeeIds) || employeeIds.length === 0 || !site?.id || !site?.name) {
    return NextResponse.json({ error: 'userId, employeeIds and site required' }, { status: 400 });
  }

  const db = await getCompanionDb();
  const collection = db.collection('employees');
  const objectIds = employeeIds.map((id) => new ObjectId(id));

  const employees = (await collection
    .find({ _id: { $in: objectIds } })
    .toArray()) as unknown as (RosterEmployee & { _id: ObjectId })[];

  const newSite: RosterEmployeeSite = {
    id: site.id,
    name: site.name,
    hasAccessCard: !!site.hasAccessCard,
  };

  const toAdd = employees.filter((emp) => !(emp.defaultSites || []).some((s) => s.id === newSite.id));

  if (toAdd.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const charge = await chargeForAction(userId, 'site.bulkAddEmployee');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }
  // Per-employee pricing: chargeForAction already debited once for the base action key; charge
  // the remaining (toAdd.length - 1) units individually so the total matches "1 credit per
  // employee added" rather than a single flat fee regardless of count.
  for (let i = 1; i < toAdd.length; i++) {
    const extraCharge = await chargeForAction(userId, 'site.bulkAddEmployee');
    if (!extraCharge.ok) {
      // Partial charge succeeded for i employees; proceed only with those already paid for.
      const affordable = toAdd.slice(0, i);
      await applySiteToEmployees(collection, affordable, newSite);
      return NextResponse.json(
        { updated: affordable.length, error: 'Insufficient credits for the full batch', creditCost: extraCharge.creditCost },
        { status: 402 }
      );
    }
  }

  await applySiteToEmployees(collection, toAdd, newSite);

  return NextResponse.json({ updated: toAdd.length });
}

async function applySiteToEmployees(
  collection: ReturnType<Awaited<ReturnType<typeof getCompanionDb>>['collection']>,
  employees: (RosterEmployee & { _id: ObjectId })[],
  newSite: RosterEmployeeSite
) {
  const now = new Date();
  await Promise.all(
    employees.map((emp) =>
      collection.updateOne(
        { _id: emp._id },
        { $set: { defaultSites: [...(emp.defaultSites || []), newSite], updatedAt: now } }
      )
    )
  );
}
