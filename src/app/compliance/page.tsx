'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import Pagination from '@/components/Pagination';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import { useChargedAction } from '@/lib/useChargedAction';
import { Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import type { ComplianceStatus } from '@/lib/compliance';
import dashboardPages from '../../../config/dashboard-pages.json';

interface ComplianceRow {
  rosterEmployeeId: string;
  employeeName: string;
  idNumber: string;
  serviceId: string;
  mostRecentDate: string;
  expiryDate: string;
  status: ComplianceStatus;
  daysUntilExpiry: number;
  isDraft: boolean;
}

const STATUS_TONE: Record<ComplianceStatus, 'red' | 'gold' | 'green'> = {
  expired: 'red',
  'expiring-soon': 'gold',
  valid: 'green',
};

const STATUS_LABEL: Record<ComplianceStatus, string> = {
  expired: 'Expired',
  'expiring-soon': 'Expiring soon',
  valid: 'Valid',
};

export default function CompliancePage() {
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [inert, setInert] = useState(false);
  const [loading, setLoading] = useState(false);
  const [charged, setCharged] = useState(false);

  const loadData = useCallback(
    async (opts: { page: number; pageSize: number; status: string; companyId: string }) => {
      if (!session) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          userId: session.id,
          page: String(opts.page),
          pageSize: String(opts.pageSize),
        });
        if (opts.status) params.set('status', opts.status);
        if (opts.companyId) params.set('companyId', opts.companyId);
        const res = await fetch(`/api/compliance?${params}`);
        const data = await res.json();
        setRows(data.entries || []);
        setTotal(data.total || 0);
        setInert(!!data.inert);
      } finally {
        setLoading(false);
      }
    },
    [session]
  );

  useEffect(() => {
    if (!session) {
      router.push('/login');
      return;
    }
    if (!charged) {
      // Charge once on first open of this page, not per filter/page change.
      requestAction('compliance.open', 'Open compliance dashboard', async () => {
        setCharged(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    // Data fetch triggered once charged, and by page/filter changes thereafter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (charged) loadData({ page, pageSize, status: statusFilter, companyId });
  }, [charged, page, pageSize, statusFilter, companyId, loadData]);

  if (!session) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 pb-12">
      <NavBar session={session} />
      <PageIntro
        title={dashboardPages.compliance.title}
        description={dashboardPages.compliance.description}
        icon={ShieldCheck}
      />

      {inert && (
        <div className="border border-amber-200 bg-amber-50 text-amber-800 text-sm rounded-card p-3 mb-4">
          No service validity periods are configured yet, so nothing is being tracked for expiry.
          This feature is built but inert until real validity periods are supplied per service.
        </div>
      )}

      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">{dashboardPages.compliance.helpers.filters}</p>
        <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-44">
          <option value="">All statuses</option>
          <option value="expired">Expired</option>
          <option value="expiring-soon">Expiring soon</option>
          <option value="valid">Valid</option>
        </Select>
        {session.companies.length > 0 && (
          <Select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setPage(1); }} className="w-56">
            <option value="">All companies</option>
            {session.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-2">{dashboardPages.compliance.helpers.table}</p>
      <div className={`overflow-x-auto ${loading ? 'opacity-50' : ''}`}>
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[26%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="font-normal py-2 pr-4">Employee</th>
              <th className="font-normal py-2 pr-4">Service</th>
              <th className="font-normal py-2 pr-4">Last completed</th>
              <th className="font-normal py-2 pr-4">Expires</th>
              <th className="font-normal py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.rosterEmployeeId}::${r.serviceId}`} className="border-b border-gray-100">
                <td className="py-3 pr-4 text-gray-800 truncate" title={r.employeeName}>{r.employeeName}</td>
                <td className="py-3 pr-4 text-gray-600 truncate" title={r.serviceId}>{r.serviceId}</td>
                <td className="py-3 pr-4 text-gray-600">{r.mostRecentDate?.slice(0, 10)}</td>
                <td className="py-3 pr-4 text-gray-600">{r.expiryDate}</td>
                <td className="py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-400">
                  Nothing to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
      />

      {pending && balance !== null && (
        <ConfirmSpendModal
          actionLabel={pending.label}
          creditCost={pending.creditCost}
          currentBalance={balance}
          onConfirm={confirm}
          onCancel={cancel}
          confirming={confirming}
        />
      )}
    </div>
  );
}
