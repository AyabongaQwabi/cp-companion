'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, ExternalLink } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import { CLINIC_LOCATIONS } from '@/lib/clinicplus-constants';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import LoadingState from '@/components/LoadingState';
import Pagination from '@/components/Pagination';
import { Input, Select } from '@/components/ui/Input';
import dashboardPages from '../../../config/dashboard-pages.json';

interface AppointmentRow {
  id: string;
  details: {
    date: string;
    clinic: string;
    employees: { id: string }[];
  };
  status: 'pending' | 'approved' | 'declined';
  payment: { amount: number };
  lifecycleStatus?: 'expired' | 'approved' | 'completed';
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  declined: 'bg-red-50 text-red-700',
};

const LIFECYCLE_STATUS_STYLES: Record<string, string> = {
  expired: 'bg-gray-100 text-gray-500',
  approved: 'bg-green-50 text-green-700',
  completed: 'bg-blue-50 text-blue-700',
};

/**
 * Appointments list — every appointment belonging to the companies/appointments this user
 * manages (usersWhoCanManage scoping, enforced server-side in /api/appointments). Distinct from
 * Insights (aggregates) and /book (creation) — this is for managing appointments that already
 * exist. Read view, free (appointment.view: 0 credits).
 */
export default function AppointmentsPage() {
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState('');
  const [clinic, setClinic] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (uid: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          userId: uid,
          page: String(page),
          pageSize: String(pageSize),
        });
        if (status) params.set('status', status);
        if (clinic) params.set('clinic', clinic);
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        const res = await fetch(`/api/appointments?${params.toString()}`);
        const data = await res.json();
        setAppointments(data.appointments || []);
        setTotal(data.total || 0);
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, status, clinic, dateFrom, dateTo]
  );

  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) load(session.id);
  }, [session, load]);

  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  if (!session) return null;

  return (
    <main className="flex-1 p-6 max-w-5xl mx-auto w-full bg-background">
      <NavBar session={session} />
      <PageIntro
        title={dashboardPages.appointments.title}
        description={dashboardPages.appointments.description}
        icon={CalendarDays}
      />

      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">{dashboardPages.appointments.helpers.filters}</p>
        <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <Select value={status} onChange={(e) => handleFilterChange(setStatus, e.target.value)}>
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
          </Select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Clinic</label>
          <Select value={clinic} onChange={(e) => handleFilterChange(setClinic, e.target.value)}>
            <option value="">Any clinic</option>
            {CLINIC_LOCATIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date from</label>
          <Input type="date" value={dateFrom} onChange={(e) => handleFilterChange(setDateFrom, e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date to</label>
          <Input type="date" value={dateTo} onChange={(e) => handleFilterChange(setDateTo, e.target.value)} />
        </div>
        </div>
      </div>

      {loading && <LoadingState label="Loading appointments..." className="mb-4" />}

      {!loading && (
        <>
        <p className="text-xs text-gray-500 mb-2">{dashboardPages.appointments.helpers.table}</p>
        <div className="border border-gray-200 rounded-card overflow-x-auto mb-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-medium">Appointment ID</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Clinic</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Employees</th>
                <th className="px-3 py-2 font-medium">Total price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {appointments.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2">
                    <Link href={`/appointments/${a.id}`} className="text-red-500 hover:text-red-600 transition-colors font-mono text-xs">
                      <ExternalLink className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
                      {a.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{a.details?.date}</td>
                  <td className="px-3 py-2 text-gray-700">{a.details?.clinic}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-pill px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[a.status] || 'bg-gray-100 text-gray-700'}`}>
                      {a.status}
                    </span>
                    {a.lifecycleStatus && (
                      <span className={`ml-1 inline-block rounded-pill px-2 py-0.5 text-xs font-medium ${LIFECYCLE_STATUS_STYLES[a.lifecycleStatus] || 'bg-gray-100 text-gray-700'}`}>
                        {a.lifecycleStatus}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{a.details?.employees?.length ?? 0}</td>
                  <td className="px-3 py-2 text-gray-900 font-medium">
                    R{(a.payment?.amount ?? 0).toFixed(2)}
                  </td>
                </tr>
              ))}
              {appointments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-sm text-gray-500">
                    No appointments match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </main>
  );
}
