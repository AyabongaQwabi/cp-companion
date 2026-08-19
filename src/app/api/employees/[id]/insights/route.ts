import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { chargeForAction } from '@/lib/credits';
import { DOVER_PRICE, MEDICAL_SERVICES, XRAYS_PRICE } from '@/lib/clinicplus-constants';
import { isValidSouthAfricanId } from '@/lib/sa-id';
import type {
  AppointmentDocument,
  AppointmentEmployee,
  EmployeeGroup,
  RosterEmployee,
  ServiceValidityPeriod,
} from '@/lib/types';

type RosterEmployeeDb = Omit<RosterEmployee, '_id'> & { _id: ObjectId };
type EmployeeGroupDb = Omit<EmployeeGroup, '_id'> & { _id: ObjectId };

const LEGACY_SERVICE_ID_MAP: Record<string, string> = {
  'medical-examination': 'full-exit-medical',
};

function normalizeServiceId(serviceId: string) {
  return LEGACY_SERVICE_ID_MAP[serviceId] ?? serviceId;
}

function employeePrice(employee: AppointmentEmployee): number {
  const servicesPrice = employee.services
    .filter((service) => service.id !== 'vienna-test')
    .reduce((sum, service) => sum + service.price, 0);
  const doverPrice = employee.dover?.required ? DOVER_PRICE : 0;
  const xrayPrice = employee.xray?.required ? XRAYS_PRICE : 0;
  return Math.round((servicesPrice + doverPrice + xrayPrice) * 100) / 100;
}

function normalizeDate(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return '';
}

function idNumberVariants(value: string): string[] {
  const trimmed = value.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  const variants = new Set<string>();
  if (trimmed) variants.add(trimmed);
  if (digitsOnly) variants.add(digitsOnly);
  if (digitsOnly.length === 13) {
    variants.add(`${digitsOnly.slice(0, 6)} ${digitsOnly.slice(6, 10)} ${digitsOnly.slice(10)}`);
  }
  return [...variants];
}

function sameIdNumber(left: string, right: string): boolean {
  return left.trim() === right.trim() || left.replace(/\D/g, '') === right.replace(/\D/g, '');
}

function humanServiceTitle(serviceId: string) {
  return MEDICAL_SERVICES[serviceId]?.title || serviceId;
}

function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: Date, toDateStr: string) {
  const to = new Date(toDateStr);
  to.setHours(0, 0, 0, 0);
  const base = new Date(from);
  base.setHours(0, 0, 0, 0);
  return Math.round((to.getTime() - base.getTime()) / 86400000);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid employee id' }, { status: 400 });
  }

  const companionDb = await getCompanionDb();
  const employee = await companionDb.collection<RosterEmployeeDb>('employees').findOne({
    _id: new ObjectId(id),
    userId,
    status: { $ne: 'terminated' },
  });

  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }

  const charge = await chargeForAction(userId, 'employee.insights.view');
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 402 });
  }

  const companyIds = employee.companyIds || [];
  const groupObjectIds = (employee.groupIds || [])
    .filter((groupId) => ObjectId.isValid(groupId))
    .map((groupId) => new ObjectId(groupId));
  const groups = employee.groupIds?.length
    ? await companionDb
        .collection<EmployeeGroupDb>('employeeGroups')
        .find({ userId, _id: { $in: groupObjectIds } })
        .toArray()
    : [];

  const validityPeriods = await companionDb
    .collection<ServiceValidityPeriod>('serviceValidityPeriods')
    .find()
    .toArray();

  if (!employee.idNumber) {
    return NextResponse.json({
      employee: {
        id: employee._id?.toString(),
        name: employee.name,
        idNumber: employee.idNumber,
        occupation: employee.occupation,
        groupNames: groups.map((group) => group.name),
        companyIds,
      },
      stats: {
        totalBooked: 0,
        approved: 0,
        pending: 0,
        declined: 0,
        totalAmountSpent: 0,
      },
      topServices: [],
      clinicBreakdown: [],
      recentHistory: [],
      spendTrend: [],
      documents: {
        hasJobSpecFile: !!employee.jobSpecFile,
        extraJobSpecFileCount: employee.extraJobSpecFiles?.length ?? 0,
        ndaPdfCount: 0,
      },
      suggestedNextBooking: {
        configured: validityPeriods.length > 0,
        message: 'Add an ID or passport number before viewing appointment history.',
      },
      dataQuality: {
        idNumberValid: isValidSouthAfricanId(employee.idNumber),
        nameVariants: [],
      },
      mathCheck: null,
    });
  }

  const prodDb = await getProductionDb();
  const employeeIdNumberVariants = idNumberVariants(employee.idNumber);
  const query = {
    'usersWhoCanManage.id': userId,
    'details.employees.idNumber': { $in: employeeIdNumberVariants },
  };

  const [liveAppointments, deletedAppointments] = await Promise.all([
    prodDb.collection<AppointmentDocument>('appointments').find(query).toArray(),
    prodDb.collection<AppointmentDocument>('deleted_appointments').find(query).toArray(),
  ]);

  const rows = [...liveAppointments, ...deletedAppointments]
    .flatMap((appointment) =>
      appointment.details.employees
        .filter((appointmentEmployee) => sameIdNumber(appointmentEmployee.idNumber, employee.idNumber))
        .map((appointmentEmployee) => ({
          appointment,
          employee: appointmentEmployee,
          date: normalizeDate(appointment.details.date),
          employeePrice: employeePrice(appointmentEmployee),
        }))
    )
    .filter((row) => !!row.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  const approvedRows = rows.filter((row) => row.appointment.status === 'approved');
  const bookedRows = rows.filter((row) => row.appointment.status === 'approved' || row.appointment.status === 'pending');
  const declinedRows = rows.filter((row) => row.appointment.status === 'declined');

  const services = new Map<string, number>();
  for (const row of bookedRows) {
    for (const service of row.employee.services) {
      const serviceId = normalizeServiceId(service.id);
      if (serviceId === 'vienna-test') continue;
      services.set(serviceId, (services.get(serviceId) ?? 0) + 1);
    }
  }

  const clinics = new Map<string, number>();
  for (const row of bookedRows) {
    const clinic = row.appointment.details.clinic || 'Unknown clinic';
    clinics.set(clinic, (clinics.get(clinic) ?? 0) + 1);
  }

  const validityByService = new Map(validityPeriods.map((period) => [period.serviceId, period.validityMonths]));
  const latestTrackedAppointments = new Map<string, string>();
  for (const row of approvedRows) {
    for (const service of row.employee.services) {
      const serviceId = normalizeServiceId(service.id);
      if (!validityByService.has(serviceId)) continue;
      const existing = latestTrackedAppointments.get(serviceId);
      if (!existing || row.date > existing) latestTrackedAppointments.set(serviceId, row.date);
    }
  }

  const today = new Date();
  const suggestedCandidates = [...latestTrackedAppointments.entries()]
    .map(([serviceId, lastDate]) => {
      const validityMonths = validityByService.get(serviceId);
      if (!validityMonths) return null;
      const expiryDate = addMonths(lastDate, validityMonths);
      return {
        serviceId,
        title: humanServiceTitle(serviceId),
        lastCompletedDate: lastDate,
        expiryDate,
        daysUntilExpiry: daysBetween(today, expiryDate),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  const nameVariants = Array.from(new Set(rows.map((row) => row.employee.name).filter(Boolean)));
  const firstDate = rows.length ? rows[rows.length - 1].date : null;
  const mostRecentDate = rows.length ? rows[0].date : null;

  const mathCheckRow = rows.find((row) => row.appointment.details.employees.length > 1) ?? rows[0] ?? null;
  const mathCheck = mathCheckRow
    ? {
        appointmentId: mathCheckRow.appointment.id,
        appointmentEmployeeCount: mathCheckRow.appointment.details.employees.length,
        appointmentTotal: mathCheckRow.appointment.payment?.amount ?? 0,
        employeeServicesTotal: Math.round(
          mathCheckRow.employee.services.reduce((sum, service) => sum + service.price, 0) * 100
        ) / 100,
        dover: mathCheckRow.employee.dover?.required ? DOVER_PRICE : 0,
        xray: mathCheckRow.employee.xray?.required ? XRAYS_PRICE : 0,
        employeeAttributedPrice: mathCheckRow.employeePrice,
      }
    : null;

  return NextResponse.json({
    employee: {
      id: employee._id?.toString(),
      name: employee.name,
      idNumber: employee.idNumber,
      occupation: employee.occupation,
      groupNames: groups.map((group) => group.name),
      companyIds,
    },
    stats: {
      totalBooked: bookedRows.length,
      approved: approvedRows.length,
      pending: rows.filter((row) => row.appointment.status === 'pending').length,
      declined: declinedRows.length,
      totalAmountSpent: Math.round(
        approvedRows.reduce((sum, row) => sum + row.employeePrice, 0) * 100
      ) / 100,
      firstDate,
      mostRecentDate,
    },
    topServices: [...services.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([serviceId, count]) => ({ serviceId, title: humanServiceTitle(serviceId), count })),
    clinicBreakdown: [...clinics.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([clinic, count]) => ({ clinic, count })),
    recentHistory: rows.slice(0, 5).map((row) => ({
      appointmentId: row.appointment.id,
      date: row.date,
      clinic: row.appointment.details.clinic,
      status: row.appointment.status,
      attributedPrice: row.appointment.status === 'approved' ? row.employeePrice : 0,
    })),
    spendTrend: approvedRows
      .slice()
      .reverse()
      .map((row) => ({
        appointmentId: row.appointment.id,
        date: row.date,
        amount: row.employeePrice,
      })),
    documents: {
      hasJobSpecFile: !!employee.jobSpecFile,
      jobSpecFile: employee.jobSpecFile,
      extraJobSpecFileCount: employee.extraJobSpecFiles?.length ?? 0,
      ndaPdfCount: rows.filter((row) => !!row.appointment.details.ndaPdf).length,
      latestNdaPdf: rows.find((row) => !!row.appointment.details.ndaPdf)?.appointment.details.ndaPdf,
    },
    suggestedNextBooking:
      validityPeriods.length === 0
        ? { configured: false, message: 'Compliance tracking is not yet configured.' }
        : suggestedCandidates[0]
          ? { configured: true, ...suggestedCandidates[0] }
          : {
              configured: true,
              message: 'No tracked service history yet for this employee.',
            },
    dataQuality: {
      idNumberValid: isValidSouthAfricanId(employee.idNumber),
      nameVariants,
      nameVariantCount: nameVariants.length,
    },
    mathCheck,
  });
}
