import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb } from '@/lib/mongodb';
import type { AppointmentDocument } from '@/lib/types';

/**
 * "Duplicate last appointment" shortcut — returns a draft payload (employees, clinic, company)
 * reshaped for prefilling a new booking. Free to fetch (appointment.view already covers 0-cost
 * appointment reads); the actual charge happens at submit time via the normal appointment.create
 * flow, same as any other creation. Deliberately omits date/id/status/tracking — the user must
 * pick a new date and the appointment still goes through the full creation/charge/NDA flow.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const prodDb = await getProductionDb();
  const appointment = await prodDb
    .collection<AppointmentDocument>('appointments')
    .findOne({ id, 'usersWhoCanManage.id': userId });

  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  return NextResponse.json({
    clinic: appointment.details.clinic,
    company: appointment.details.company,
    employees: appointment.details.employees,
  });
}
