'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  ClipboardList,
  Download,
  Edit3,
  FileSpreadsheet,
  History,
  MapPin,
  Plus,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import type { RosterEmployee, RosterSite, EmployeeGroup } from '@/lib/types';
import EmployeeModal from '@/components/EmployeeModal';
import EmployeeInsights from '@/components/EmployeeInsights';
import ImportFromHistoryModal from '@/components/ImportFromHistoryModal';
import ImportFromCsvModal from '@/components/ImportFromCsvModal';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import CheckAvailability from '@/components/CheckAvailability';
import RecurringRemindersCard from '@/components/RecurringRemindersCard';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import Pagination from '@/components/Pagination';
import { useChargedAction } from '@/lib/useChargedAction';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import dashboardPages from '../../../config/dashboard-pages.json';

export default function RosterPage() {
  const router = useRouter();
  // getSession() reads localStorage synchronously; the lazy initializer runs once on mount and
  // is null during SSR (matching the unauthenticated-redirect branch below), so this doesn't
  // need to live in an effect.
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [employees, setEmployees] = useState<RosterEmployee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [sites, setSites] = useState<RosterSite[]>([]);
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [newSiteName, setNewSiteName] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<RosterEmployee | null | undefined>(
    undefined
  );
  const [showImport, setShowImport] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSiteId, setBulkSiteId] = useState('');
  const [applyingBulkSite, setApplyingBulkSite] = useState(false);
  const [complianceSummary, setComplianceSummary] = useState<Record<string, 'expired' | 'expiring-soon' | 'valid'>>({});

  const loadCatalogs = useCallback(async (uid: string) => {
    const [siteRes, groupRes] = await Promise.all([
      fetch(`/api/sites?userId=${encodeURIComponent(uid)}`),
      fetch(`/api/employee-groups?userId=${encodeURIComponent(uid)}`),
    ]);
    setSites(await siteRes.json());
    setGroups(await groupRes.json());
  }, []);

  const loadEmployees = useCallback(
    async (uid: string, opts: { page: number; pageSize: number; search: string; groupId: string }) => {
      setLoadingEmployees(true);
      try {
        const params = new URLSearchParams({
          userId: uid,
          page: String(opts.page),
          pageSize: String(opts.pageSize),
        });
        if (opts.search) params.set('search', opts.search);
        if (opts.groupId) params.set('groupId', opts.groupId);
        const res = await fetch(`/api/employees?${params.toString()}`);
        const data = await res.json();
        setEmployees(data.employees);
        setTotal(data.total);
      } finally {
        setLoadingEmployees(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  useEffect(() => {
    // Data fetch triggered on mount once session resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) loadCatalogs(session.id);
  }, [session, loadCatalogs]);

  useEffect(() => {
    if (!session) return;
    fetch(`/api/compliance/summary?userId=${encodeURIComponent(session.id)}`)
      .then((r) => r.json())
      .then((d) => {
        setComplianceSummary(d.summary || {});
      })
      .catch(() => {});
  }, [session]);

  // Debounce free-text search input before it hits the server; resetting to page 1 here (not
  // in a separate effect keyed on `search`) avoids a second cascading render.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    // Data fetch triggered by page/pageSize/search/groupFilter changing — the standard case for
    // setState-in-effect, not a redundant derivation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) loadEmployees(session.id, { page, pageSize, search, groupId: groupFilter });
  }, [session, page, pageSize, search, groupFilter, loadEmployees]);

  const refreshCurrentPage = useCallback(() => {
    if (session) loadEmployees(session.id, { page, pageSize, search, groupId: groupFilter });
  }, [session, page, pageSize, search, groupFilter, loadEmployees]);

  const groupNameById = useMemo(
    () => Object.fromEntries(groups.map((g) => [g._id, g.name])),
    [groups]
  );

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  const exportCsv = async () => {
    if (!session) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/roster/export?userId=${encodeURIComponent(session.id)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Could not export roster.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roster-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const removeEmployee = (id: string) => {
    requestAction(
      'employee.remove',
      'Remove employee',
      async () => {
        await fetch(`/api/employees?_id=${id}&userId=${encodeURIComponent(session!.id)}`, {
          method: 'DELETE',
        });
        refreshCurrentPage();
      },
      { chargeSeparately: true }
    );
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBulkSite = () => {
    if (!bulkSiteId || selectedIds.size === 0 || !session) return;
    const site = sites.find((s) => s._id === bulkSiteId);
    if (!site) return;
    requestAction(
      'site.bulkAddEmployee',
      `Add ${selectedIds.size} employee(s) to site`,
      async () => {
        setApplyingBulkSite(true);
        try {
          await fetch('/api/employees/bulk-add-site', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: session.id,
              employeeIds: [...selectedIds],
              site: { id: site._id, name: site.name, hasAccessCard: site.hasAccessCard },
            }),
          });
          setSelectedIds(new Set());
          setBulkSiteId('');
          refreshCurrentPage();
        } finally {
          setApplyingBulkSite(false);
        }
      },
      { chargeSeparately: true, quantity: selectedIds.size }
    );
  };

  const addSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim() || !session) return;
    requestAction(
      'site.add',
      'Add site',
      async () => {
        await fetch('/api/sites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: session.id, name: newSiteName }),
        });
        setNewSiteName('');
        loadCatalogs(session.id);
      },
      { chargeSeparately: true }
    );
  };

  const removeSite = async (id: string) => {
    if (!session) return;
    requestAction(
      'site.remove',
      'Remove site',
      async () => {
        await fetch(`/api/sites?_id=${id}&userId=${encodeURIComponent(session.id)}`, { method: 'DELETE' });
        loadCatalogs(session.id);
      },
      { chargeSeparately: true }
    );
  };

  if (!session) return null;

  return (
    <main className="flex-1 p-6 max-w-3xl mx-auto w-full bg-background">
      <NavBar session={session} />
      <PageIntro
        title={dashboardPages.roster.title}
        description={dashboardPages.roster.description}
        icon={ClipboardList}
      />

      <RecurringRemindersCard userId={session.id} />

      <div className="mb-10">
        <CheckAvailability userId={session.id} />
      </div>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Employees ({total})</h2>
            <p className="text-xs text-gray-500 mt-1 max-w-xl">
              {dashboardPages.roster.helpers.employees}
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, ID, occupation…"
              className="w-48 text-xs"
            />
            {groups.length > 0 && (
              <Select
                value={groupFilter}
                onChange={(e) => {
                  setGroupFilter(e.target.value);
                  setPage(1);
                }}
                className="text-xs"
              >
                <option value="">All groups</option>
                {groups.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            )}
            <Button variant="secondary" onClick={() => setShowImport(true)} className="text-xs px-3 py-1.5">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Import from past appointments
            </Button>
            <Button variant="secondary" onClick={() => setShowCsvImport(true)} className="text-xs px-3 py-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
              Import CSV
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={exporting} className="text-xs px-3 py-1.5">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
            <Button variant="primary" onClick={() => setEditingEmployee(null)} className="text-xs px-3 py-1.5">
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Add employee
            </Button>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="rounded-card border border-gold-300/50 bg-gold-50/40 p-3 mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-800">
              {selectedIds.size} selected — add to site:
            </span>
            <Select
              value={bulkSiteId}
              onChange={(e) => setBulkSiteId(e.target.value)}
              className="text-xs"
            >
              <option value="">Choose a site…</option>
              {sites.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              onClick={applyBulkSite}
              disabled={!bulkSiteId || applyingBulkSite}
              className="text-xs px-3 py-1.5"
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {applyingBulkSite ? 'Adding…' : 'Add to site'}
            </Button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center gap-1 text-xs underline text-gray-500 hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear selection
            </button>
          </div>
        )}

        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card min-h-[4rem] overflow-hidden">
          {employees.map((emp) => (
            <li
              key={emp._id}
              className="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(emp._id!)}
                  onChange={() => toggleSelected(emp._id!)}
                  className="mt-1 accent-red-500"
                />
                <div>
                  <span className="font-medium text-gray-900">{emp.name}</span>{' '}
                  <span className="text-gray-500">
                    {emp.idNumber} · {emp.occupation}
                  </span>
                  {emp._id && complianceSummary[emp._id] && complianceSummary[emp._id] !== 'valid' && (
                    <>
                      <Badge tone={complianceSummary[emp._id] === 'expired' ? 'red' : 'gold'}>
                        {complianceSummary[emp._id] === 'expired' ? 'Expired' : 'Expiring soon'}
                      </Badge>
                    </>
                  )}
                  {emp.groupIds?.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {emp.groupIds.map((gid) => (
                        <Badge key={gid} tone="neutral">
                          {groupNameById[gid] || gid}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                {emp._id && (
                  <EmployeeInsights
                    userId={session.id}
                    employeeId={emp._id}
                    employeeName={emp.name}
                  />
                )}
                <button
                  onClick={() => setEditingEmployee(emp)}
                  className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-red-500 transition-colors"
                >
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </button>
                <button
                  onClick={() => removeEmployee(emp._id!)}
                  className="inline-flex items-center gap-1 text-red-600 text-xs hover:text-red-700 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove
                </button>
              </div>
            </li>
          ))}
          {!loadingEmployees && employees.length === 0 && (
            <li className="px-3 py-4 text-sm text-gray-500">No employees found.</li>
          )}
        </ul>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </section>

      <div className="mb-3">
        <Link href="/roster/groups" className="inline-flex items-center gap-1 text-sm text-red-500 hover:text-red-600 transition-colors">
          Manage groups
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Sites ({sites.length})</h2>
        <p className="text-xs text-gray-500 mb-3 max-w-xl">
          {dashboardPages.roster.helpers.sites}
        </p>
        <form onSubmit={addSite} className="flex gap-2 mb-4">
          <Input
            placeholder="Site name"
            value={newSiteName}
            onChange={(e) => setNewSiteName(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="primary" className="text-sm px-3 py-1.5">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </Button>
        </form>
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card overflow-hidden">
          {sites.map((site) => (
            <li
              key={site._id}
              className="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors"
            >
              <Link href={`/roster/sites/${site._id}`} className="inline-flex items-center gap-1 text-gray-800 hover:text-red-500 transition-colors">
                <MapPin className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                {site.name}
              </Link>
              <button
                onClick={() => removeSite(site._id!)}
                className="inline-flex items-center gap-1 text-red-600 text-xs hover:text-red-700 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Remove
              </button>
            </li>
          ))}
          {sites.length === 0 && (
            <li className="px-3 py-4 text-sm text-gray-500">No sites yet.</li>
          )}
        </ul>
      </section>

      {editingEmployee !== undefined && (
        <EmployeeModal
          userId={session.id}
          employee={editingEmployee}
          onClose={() => setEditingEmployee(undefined)}
          onSaved={() => {
            setEditingEmployee(undefined);
            refreshCurrentPage();
          }}
        />
      )}

      {showImport && (
        <ImportFromHistoryModal
          userId={session.id}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            refreshCurrentPage();
          }}
        />
      )}

      {showCsvImport && (
        <ImportFromCsvModal
          userId={session.id}
          onClose={() => setShowCsvImport(false)}
          onImported={() => {
            setShowCsvImport(false);
            refreshCurrentPage();
          }}
        />
      )}

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
    </main>
  );
}
