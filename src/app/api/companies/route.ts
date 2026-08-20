import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import { sendNewCompanyEmail, sendNewCompanyEmailInternal } from '@/lib/mailjet';
import { chargeForAction } from '@/lib/credits';
import { assertPlatformControlAllows, PlatformControlBlockedError } from '@/lib/platform-controls';
import type { Company } from '@/lib/types';

interface CreateCompanyBody {
  name: string;
  userId: string;
  userName: string;
  registrationName?: string;
  registrationNumber?: string;
  vat?: string;
  physicalAddress?: string;
  postalAddress?: string;
}

/**
 * List companies the given user manages or can edit (production.users.companiesManaging is the
 * cheap source for the appointment-form dropdowns; this route reads the full company documents
 * for the dedicated Companies page instead of just the { id, name } pairs on the session).
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companies = await prodDb
    .collection<Company>('companies')
    .find({
      isDecomissioned: { $ne: true },
      $or: [{ 'usersWhoCanManage.id': userId }, { 'usersWhoCanEdit.id': userId }],
    })
    .sort({ 'details.name': 1 })
    .toArray();

  return NextResponse.json(companies);
}

/**
 * Replicates saveNewCompany in clinicplus-server-latest-stable-version/lib/data/save/index.js
 * exactly: id = first 3 letters of name (uppercased) + a random 4-5 digit code, tracking =
 * [{ type: CREATED, date, doer, entityId }], and appends { id, name } onto the creating user's
 * production.users.companiesManaging. Used by both Part F.0's inline company react-selects and
 * the dedicated Companies page's "create company" form (the latter also sends the extra
 * details.* fields cp-redesign's own create form collects).
 */
export async function POST(req: NextRequest) {
  try {
    await assertPlatformControlAllows('block_new_companies');
  } catch (err) {
    if (err instanceof PlatformControlBlockedError) {
      return NextResponse.json(
        {
          error: err.message,
          platformControl: {
            key: err.control.key,
            enabled: true,
            publicMessage: err.control.publicMessage || err.message,
          },
        },
        { status: 423 }
      );
    }
    return NextResponse.json(
      { error: 'Company creation is temporarily unavailable. Please try again later.' },
      { status: 503 }
    );
  }

  const body: CreateCompanyBody = await req.json();
  const {
    name,
    userId,
    userName,
    registrationName,
    registrationNumber,
    vat,
    physicalAddress,
    postalAddress,
  } = body;

  if (!name?.trim() || !userId) {
    return NextResponse.json({ error: 'name and userId required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companionDb = await getCompanionDb();

  const trimmedName = name.trim();
  const code = Math.floor(1000 + Math.random() * 90000);
  const id = `${trimmedName.substring(0, 3).toUpperCase()}${code}`;

  const company: Omit<Company, '_id'> = {
    id,
    details: {
      name: trimmedName,
      registrationName: registrationName?.trim() || undefined,
      registrationNumber: registrationNumber?.trim() || undefined,
      vat: vat?.trim() || undefined,
      physicalAddress: physicalAddress?.trim() || undefined,
      postalAddress: postalAddress?.trim() || undefined,
    },
    usersWhoCanEdit: [],
    usersWhoCanManage: [{ id: userId, name: userName }],
    messages: [],
    isDecomissioned: false,
    tracking: [{ type: 'CREATED', date: new Date(), doer: userId, entityId: id }],
  };

  const usersCollection = prodDb.collection('users');
  const user = await usersCollection.findOne({ id: userId });
  if (!user) {
    return NextResponse.json({ error: 'User not found in production.users' }, { status: 404 });
  }

  const charge = await chargeForAction(userId, 'company.createNew');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  await prodDb.collection('companies').insertOne(company);
  await usersCollection.updateOne(
    { _id: user._id },
    {
      $set: {
        companiesManaging: [...(user.companiesManaging || []), { id, name: trimmedName }],
      },
    }
  );

  await companionDb.collection('auditLog').insertOne({
    action: 'CREATE_COMPANY',
    companyId: id,
    userId,
    at: new Date(),
  });

  try {
    await sendNewCompanyEmail(
      user as unknown as { details: { name: string; surname: string; email: string } },
      company
    );
    await sendNewCompanyEmailInternal(company);
  } catch (err) {
    console.error('Failed to send company creation emails', err);
  }

  return NextResponse.json({ id, name: trimmedName }, { status: 201 });
}

interface UpdateCompanyBody {
  id: string;
  userId: string;
  details: {
    name?: string;
    registrationName?: string;
    registrationNumber?: string;
    vat?: string;
    physicalAddress?: string;
    postalAddress?: string;
  };
}

/**
 * Edits an existing company's details.* fields only — unlike cp-redesign's updateCompany (which
 * blindly $sets every top-level field the client sends), this only ever touches `details`, never
 * usersWhoCanEdit/usersWhoCanManage/messages/tracking/isDecomissioned.
 */
export async function PATCH(req: NextRequest) {
  const body: UpdateCompanyBody = await req.json();
  const { id, userId, details } = body;

  if (!id || !userId || !details) {
    return NextResponse.json({ error: 'id, userId, and details required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const companies = prodDb.collection<Company>('companies');
  const company = await companies.findOne({ id });
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const canEdit =
    company.usersWhoCanManage.some((u) => u.id === userId) ||
    company.usersWhoCanEdit.some((u) => u.id === userId);
  if (!canEdit) {
    return NextResponse.json({ error: 'Not authorized to edit this company' }, { status: 403 });
  }

  const charge = await chargeForAction(userId, 'company.edit');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const updates: Record<string, string> = {};
  for (const [key, value] of Object.entries(details)) {
    if (value !== undefined) updates[`details.${key}`] = value.trim();
  }

  await companies.updateOne({ id }, { $set: updates });

  const companionDb = await getCompanionDb();
  await companionDb.collection('auditLog').insertOne({
    action: 'EDIT_COMPANY',
    companyId: id,
    userId,
    at: new Date(),
  });

  return NextResponse.json({ ok: true });
}
