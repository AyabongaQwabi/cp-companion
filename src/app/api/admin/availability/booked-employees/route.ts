import { NextRequest, NextResponse } from 'next/server';
import { getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';
import type { AppointmentDocument, AppointmentEmployee } from '@/lib/types';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

function isoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthEnd(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function rangeFor(mode: string, date: string) {
  if (mode === 'day') return { startDate: date, endDate: date };
  if (mode === 'week') return { startDate: date, endDate: addDays(date, 6) };
  if (mode === 'month') return { startDate: date.slice(0, 8) + '01', endDate: monthEnd(date) };
  return null;
}

function employeeServiceIds(employee: AppointmentEmployee): string[] {
  const ids = (employee.services || []).map((service) => service.id).filter(Boolean);
  if (employee.dover?.required) ids.push('dover');
  if (employee.xray?.required) ids.push('x-ray');
  return Array.from(new Set(ids));
}

function employeeMatchesServices(employee: AppointmentEmployee, selectedServices: string[]) {
  if (!selectedServices.length) return true;
  const ids = employeeServiceIds(employee);
  return selectedServices.some((serviceId) => ids.includes(serviceId));
}

export async function GET(req: NextRequest) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const clinic = req.nextUrl.searchParams.get('clinic') || 'all';
  const mode = req.nextUrl.searchParams.get('mode') || 'day';
  const date = isoDate(req.nextUrl.searchParams.get('date'));
  const selectedServices = (req.nextUrl.searchParams.get('services') || '')
    .split(',')
    .map((service) => service.trim())
    .filter(Boolean);

  if (!date) {
    return withAdminStatsCors(NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 }));
  }

  const range = rangeFor(mode, date);
  if (!range) {
    return withAdminStatsCors(NextResponse.json({ error: 'mode must be day, week, or month' }, { status: 400 }));
  }

  try {
    const prodDb = await getProductionDb();
    const query: Record<string, unknown> = {
      'details.date': { $gte: range.startDate, $lte: range.endDate },
    };
    if (clinic !== 'all') query['details.clinic'] = clinic;

    const appointments = await prodDb
      .collection<AppointmentDocument>('appointments')
      .find(query)
      .project({
        id: 1,
        status: 1,
        'details.date': 1,
        'details.clinic': 1,
        'details.company.id': 1,
        'details.company.name': 1,
        'details.employees.id': 1,
        'details.employees.name': 1,
        'details.employees.idNumber': 1,
        'details.employees.occupation': 1,
        'details.employees.services': 1,
        'details.employees.dover': 1,
        'details.employees.xray': 1,
      })
      .sort({ 'details.date': 1, id: 1 })
      .toArray();

    const serviceCounts = new Map<string, number>();
    const rows = [];

    for (const appointment of appointments) {
      const appointmentDate = (appointment.details?.date || '').slice(0, 10);
      if (!appointmentDate || appointmentDate < range.startDate || appointmentDate > range.endDate) continue;

      for (const employee of appointment.details?.employees || []) {
        const serviceIds = employeeServiceIds(employee);
        for (const serviceId of serviceIds) {
          serviceCounts.set(serviceId, (serviceCounts.get(serviceId) || 0) + 1);
        }
        if (!employeeMatchesServices(employee, selectedServices)) continue;

        rows.push({
          appointmentId: appointment.id,
          date: appointmentDate,
          clinic: appointment.details?.clinic || null,
          companyId: appointment.details?.company?.id || null,
          companyName: appointment.details?.company?.name || null,
          status: appointment.status,
          employee: {
            id: employee.id || null,
            name: employee.name || '',
            idNumber: employee.idNumber || null,
            occupation: employee.occupation || null,
            services: serviceIds,
          },
        });
      }
    }

    const services = Array.from(serviceCounts.entries())
      .map(([id, count]) => ({ id, label: id, count }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return withAdminStatsCors(
      NextResponse.json({
        clinic,
        mode,
        date,
        startDate: range.startDate,
        endDate: range.endDate,
        selectedServices,
        services,
        employees: rows,
        appointmentCount: appointments.length,
        employeeCount: rows.length,
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
