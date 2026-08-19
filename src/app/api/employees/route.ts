import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import { isValidSouthAfricanId } from '@/lib/sa-id';
import type { RosterEmployee } from '@/lib/types';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const db = await getCompanionDb();
  const collection = db.collection<RosterEmployee>('employees');

  const pageParam = req.nextUrl.searchParams.get('page');
  const search = req.nextUrl.searchParams.get('search')?.trim();
  const groupId = req.nextUrl.searchParams.get('groupId');
  const occupation = req.nextUrl.searchParams.get('occupation');
  const companyId = req.nextUrl.searchParams.get('companyId');
  // Default excludes inactive/terminated employees from every selection surface; pass
  // includeInactive=1 to show them (e.g. a roster-page "show inactive" toggle).
  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === '1';

  // Callers that don't opt into pagination keep getting a plain array, unchanged — this must
  // only be used for small, genuinely-need-everything cases, never for rendering a table.
  if (!pageParam) {
    const employees = await collection
      .find(includeInactive ? { userId } : { userId, status: { $nin: ['inactive', 'terminated'] } })
      .sort({ name: 1 })
      .toArray();
    return NextResponse.json(employees);
  }

  const page = Math.max(1, parseInt(pageParam, 10) || 1);
  const pageSize = Math.min(250, Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '20', 10)));

  const query: Record<string, unknown> = includeInactive
    ? { userId }
    : { userId, status: { $nin: ['inactive', 'terminated'] } };
  if (groupId) {
    query.groupIds = groupId;
  }
  if (occupation) {
    query.occupation = occupation;
  }
  if (companyId) {
    query.companyIds = companyId;
  }
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = { $regex: escaped, $options: 'i' };
    query.$or = [{ name: regex }, { idNumber: regex }, { occupation: regex }];
  }

  const [employees, total] = await Promise.all([
    collection
      .find(query)
      .sort({ name: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection.countDocuments(query),
  ]);

  return NextResponse.json({ employees, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    userId,
    name,
    idNumber,
    occupation,
    defaultServices,
    defaultSites,
    groupIds,
    companyIds,
    jobSpecFile,
    extraJobSpecFiles,
    notes,
  } = body;

  if (!userId || !name) {
    return NextResponse.json({ error: 'userId and name required' }, { status: 400 });
  }

  const charge = await chargeForAction(userId, 'employee.add');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const db = await getCompanionDb();
  const now = new Date();
  const employee: Omit<RosterEmployee, '_id'> = {
    userId,
    name,
    idNumber: (idNumber && String(idNumber).trim()) || `GEN-${crypto.randomUUID()}`,
    occupation: occupation || '',
    defaultServices: defaultServices || [],
    defaultSites: defaultSites || [],
    groupIds: groupIds || [],
    companyIds: companyIds || [],
    jobSpecFile: jobSpecFile || undefined,
    extraJobSpecFiles: extraJobSpecFiles || [],
    notes: notes || '',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection('employees').insertOne(employee);
  const idWasProvided = Boolean(idNumber && String(idNumber).trim());
  const idWarning = idWasProvided && isValidSouthAfricanId(employee.idNumber) === false
    ? "This doesn't look like a valid SA ID number, please double-check."
    : undefined;
  return NextResponse.json({ ...employee, _id: result.insertedId, idWarning }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  // userId + chargeUserAction are only sent by genuine user-initiated edits (EmployeeModal);
  // internal system writes (e.g. JobSpecChooser auto-saving a fresh upload back onto the roster
  // record) omit them and aren't charged again — that upload was already billed as
  // file.uploadNew, so charging employee.edit too would double-charge one user action.
  const { _id, userId, chargeUserAction, ...updates } = body;
  if (!_id) {
    return NextResponse.json({ error: '_id required' }, { status: 400 });
  }

  if (chargeUserAction && userId) {
    const charge = await chargeForAction(userId, 'employee.edit');
    if (!charge.ok) {
      return NextResponse.json(charge, { status: 402 });
    }
  }

  const db = await getCompanionDb();
  await db.collection('employees').updateOne(
    { _id: new ObjectId(_id) },
    { $set: { ...updates, updatedAt: new Date() } }
  );
  const idWarning = typeof updates.idNumber === 'string' && isValidSouthAfricanId(updates.idNumber) === false
    ? "This doesn't look like a valid SA ID number, please double-check."
    : undefined;
  return NextResponse.json({ ok: true, idWarning });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('_id');
  const userId = req.nextUrl.searchParams.get('userId');
  if (!id) {
    return NextResponse.json({ error: '_id required' }, { status: 400 });
  }

  if (userId) {
    const charge = await chargeForAction(userId, 'employee.remove');
    if (!charge.ok) {
      return NextResponse.json(charge, { status: 402 });
    }
  }

  const db = await getCompanionDb();
  await db
    .collection('employees')
    .updateOne({ _id: new ObjectId(id) }, { $set: { status: 'inactive', updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
