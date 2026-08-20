import { NextRequest, NextResponse } from 'next/server';
import { getCompanionDb, getProductionDb } from '@/lib/mongodb';
import { adminStatsCorsPreflight, checkAdminStatsSecret, withAdminStatsCors } from '@/lib/admin-stats-cors';

export async function OPTIONS() {
  return adminStatsCorsPreflight();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminStatsSecret(req);
  if (authError) return authError;

  const { id } = await params;
  try {
    const prodDb = await getProductionDb();
    const companionDb = await getCompanionDb();

    const company = await prodDb.collection('companies').findOne({ id });
    if (!company) {
      return withAdminStatsCors(NextResponse.json({ error: 'Company not found' }, { status: 404 }));
    }

    const [appointments, deletedAppointments, invoices, companyProfile, bookingPattern, sites, auditEvents] =
      await Promise.all([
        prodDb
          .collection('appointments')
          .find({ 'details.company.id': id })
          .sort({ 'tracking.0.date': -1, 'details.date': -1 })
          .limit(100)
          .toArray(),
        prodDb
          .collection('deleted_appointments')
          .find({ 'details.company.id': id })
          .sort({ 'tracking.0.date': -1, 'details.date': -1 })
          .limit(100)
          .toArray(),
        companionDb.collection('invoices').find({ companyId: id }).sort({ sentAt: -1 }).limit(100).toArray(),
        companionDb.collection('companyProfiles').findOne({ companyId: id }),
        companionDb.collection('bookingPatterns').findOne({ companyId: id }),
        companionDb.collection('siteDirectory').find({ companyIds: id }).sort({ lastUsedAt: -1 }).toArray(),
        companionDb
          .collection('audit_events')
          .find({ entityType: 'company', entityId: id })
          .sort({ createdAt: -1 })
          .limit(100)
          .toArray(),
      ]);

    const managerIds = [
      ...new Set([...(company.usersWhoCanManage || []), ...(company.usersWhoCanEdit || [])].map((u: { id?: string }) => u.id).filter(Boolean)),
    ];
    const managers = managerIds.length
      ? await prodDb.collection('users').find({ id: { $in: managerIds } }).toArray()
      : [];
    const managerById = new Map(managers.map((manager) => [manager.id, manager]));

    const deletedCount = deletedAppointments.length;
    const cancelledCount = appointments.filter((a) => ['cancelled', 'declined'].includes(String(a.status || '').toLowerCase())).length;
    const needsAttention = [
      !company.details?.vat && { key: 'missing_vat', label: 'Missing VAT number' },
      !company.details?.registrationNumber && {
        key: 'missing_registration_number',
        label: 'Missing registration number',
      },
      !(company.usersWhoCanManage || []).length && { key: 'no_manager', label: 'No manager assigned' },
      managers.some((manager) => manager?.isSuspended || manager?.isDeleted) && {
        key: 'manager_inactive',
        label: 'Manager is suspended or deleted',
      },
      sites.length === 0 && { key: 'no_sites', label: 'No linked sites' },
      appointments.length === 0 && { key: 'no_recent_appointments', label: 'No live appointments found' },
      deletedCount + cancelledCount >= 10 && {
        key: 'high_deleted_cancelled',
        label: 'High deleted/declined appointment count',
      },
      invoices.some((invoice) => !invoice.pdfUrl) && {
        key: 'invoice_missing_pdf',
        label: 'Invoice records missing uploaded PDFs',
      },
    ].filter(Boolean);

    return withAdminStatsCors(
      NextResponse.json({
        company,
        managers: managers.map((manager) => ({ ...manager, _id: String(manager._id) })),
        sites: sites.map((site) => ({ ...site, _id: String(site._id) })),
        appointments: [
          ...appointments.map((appointment) => ({ ...appointment, deleted: false })),
          ...deletedAppointments.map((appointment) => ({ ...appointment, deleted: true })),
        ],
        invoices: invoices.map((invoice) => ({ ...invoice, _id: String(invoice._id) })),
        companyProfile,
        bookingPattern,
        auditEvents: auditEvents.map((event) => ({ ...event, _id: String(event._id) })),
        needsAttention,
      })
    );
  } catch (err) {
    return withAdminStatsCors(
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    );
  }
}
