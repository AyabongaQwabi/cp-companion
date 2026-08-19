'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckSquare, Search, UserPlus, UsersRound, X } from 'lucide-react';
import { motion } from 'framer-motion';
import Pagination from './Pagination';
import LoadingState from './LoadingState';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { RosterEmployee, EmployeeGroup, Company } from '@/lib/types';

interface EmployeeSelectionModalProps {
  userId: string;
  groups: EmployeeGroup[];
  /** When provided, adds a "company" filter (occupation/group filters remain available too). */
  companies?: Company[];
  /** Roster employee ids already added to the appointment — shown as disabled/checked, not re-added. */
  alreadyAddedIds: Set<string>;
  onClose: () => void;
  onConfirm: (employees: RosterEmployee[]) => void;
}

/**
 * Dedicated search/filter modal for choosing which roster employees to add to an in-progress
 * appointment (replaces the old flat "here's your whole roster" checkbox list). Server-searched
 * and paginated per the site-wide standard; "select all" always means "select all matching the
 * current search/filter," fetched from the server rather than assumed to be the current page.
 */
export default function EmployeeSelectionModal({
  userId,
  groups,
  companies = [],
  alreadyAddedIds,
  onClose,
  onConfirm,
}: EmployeeSelectionModalProps) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [occupation, setOccupation] = useState('');
  const [groupId, setGroupId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [occupationOptions, setOccupationOptions] = useState<string[]>([]);
  const [employees, setEmployees] = useState<RosterEmployee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedRecords, setSelectedRecords] = useState<Map<string, RosterEmployee>>(new Map());
  const [selectingAll, setSelectingAll] = useState(false);

  useEffect(() => {
    fetch(`/api/employees/occupations-in-use?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => setOccupationOptions(d.occupations));
  }, [userId]);

  const load = useCallback(
    async (opts: {
      search: string;
      occupation: string;
      groupId: string;
      companyId: string;
      page: number;
      pageSize: number;
    }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          userId,
          page: String(opts.page),
          pageSize: String(opts.pageSize),
        });
        if (opts.search) params.set('search', opts.search);
        if (opts.occupation) params.set('occupation', opts.occupation);
        if (opts.groupId) params.set('groupId', opts.groupId);
        if (opts.companyId) params.set('companyId', opts.companyId);
        const res = await fetch(`/api/employees?${params.toString()}`);
        const data = await res.json();
        setEmployees(data.employees);
        setTotal(data.total);
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  // Debounce free-text search, resetting to page 1 on any filter change.
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    // Data fetch triggered by search/occupation/groupId/companyId/page/pageSize changing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load({ search, occupation, groupId, companyId, page, pageSize });
  }, [search, occupation, groupId, companyId, page, pageSize, load]);

  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  const toggle = (emp: RosterEmployee) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(emp._id!)) next.delete(emp._id!);
      else next.add(emp._id!);
      return next;
    });
    setSelectedRecords((prev) => {
      const next = new Map(prev);
      if (next.has(emp._id!)) next.delete(emp._id!);
      else next.set(emp._id!, emp);
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelectedIds((prev) => new Set([...prev, ...employees.map((e) => e._id!)]));
    setSelectedRecords((prev) => {
      const next = new Map(prev);
      employees.forEach((e) => next.set(e._id!, e));
      return next;
    });
  };

  // Fetches every matching id from the server (not just the current page) and their full
  // records in one shot, respecting whatever search/occupation/group filter is active.
  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const idParams = new URLSearchParams({ userId });
      if (search) idParams.set('search', search);
      if (occupation) idParams.set('occupation', occupation);
      if (groupId) idParams.set('groupId', groupId);
      if (companyId) idParams.set('companyId', companyId);
      const idsRes = await fetch(`/api/employees/matching-ids?${idParams.toString()}`);
      const idsData = await idsRes.json();

      const allParams = new URLSearchParams({ userId, page: '1', pageSize: String(total || 1) });
      if (search) allParams.set('search', search);
      if (occupation) allParams.set('occupation', occupation);
      if (groupId) allParams.set('groupId', groupId);
      if (companyId) allParams.set('companyId', companyId);
      const allRes = await fetch(`/api/employees?${allParams.toString()}`);
      const allData = await allRes.json();

      setSelectedIds(new Set(idsData.ids));
      setSelectedRecords((prev) => {
        const next = new Map(prev);
        (allData.employees as RosterEmployee[]).forEach((e) => next.set(e._id!, e));
        return next;
      });
    } finally {
      setSelectingAll(false);
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectedRecords(new Map());
  };

  const confirm = () => {
    onConfirm([...selectedRecords.values()]);
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="bg-white max-w-2xl w-full rounded-card shadow-md border border-gray-200 p-6 max-h-[85vh] overflow-y-auto flex flex-col"
      >
        <h2 className="font-semibold text-gray-900 mb-3 inline-flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-red-500" aria-hidden="true" />
          Select employees
        </h2>

        <div className="flex gap-2 mb-3 flex-wrap items-center">
          <Search className="h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, ID, occupation…"
            className="flex-1 min-w-[160px]"
          />
          <Select
            value={occupation}
            onChange={(e) => handleFilterChange(setOccupation, e.target.value)}
          >
            <option value="">Any occupation</option>
            {occupationOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
          {groups.length > 0 && (
            <Select
              value={groupId}
              onChange={(e) => handleFilterChange(setGroupId, e.target.value)}
            >
              <option value="">Any group</option>
              {groups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </Select>
          )}
          {companies.length > 0 && (
            <Select
              value={companyId}
              onChange={(e) => handleFilterChange(setCompanyId, e.target.value)}
            >
              <option value="">Any company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.details.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="flex gap-3 mb-2 text-xs items-center">
          <button onClick={selectAllOnPage} className="inline-flex items-center gap-1 text-red-500 hover:text-red-600 transition-colors">
            <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
            Select all on this page
          </button>
          <button
            onClick={selectAllMatching}
            disabled={selectingAll}
            className="inline-flex items-center gap-1 text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
            {selectingAll ? 'Selecting…' : `Select all matching (${total})`}
          </button>
          <button onClick={clearSelection} className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear selection
          </button>
          <span className="text-gray-400">{selectedIds.size} selected</span>
        </div>

        {loading && <LoadingState label="Loading employees..." className="py-4" />}

        {!loading && (
          <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card mb-2 flex-1 overflow-y-auto">
            {employees.map((emp) => {
              const isAlreadyAdded = alreadyAddedIds.has(emp._id!);
              return (
                <li
                  key={emp._id}
                  className={`flex items-center gap-2 px-3 py-2 text-sm ${
                    isAlreadyAdded ? 'opacity-50' : 'hover:bg-gray-50 transition-colors'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(emp._id!) || isAlreadyAdded}
                    disabled={isAlreadyAdded}
                    onChange={() => toggle(emp)}
                    className="accent-red-500"
                  />
                  <span className="font-medium text-gray-900">{emp.name}</span>
                  <span className="text-gray-500">
                    {emp.idNumber} · {emp.occupation}
                  </span>
                  {isAlreadyAdded && (
                    <span className="text-[10px] text-gray-400 ml-auto">already added</span>
                  )}
                </li>
              );
            })}
            {employees.length === 0 && (
              <li className="px-3 py-4 text-sm text-gray-500">No matching employees.</li>
            )}
          </ul>
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

        <div className="flex gap-3 mt-4">
          <Button onClick={confirm} disabled={selectedIds.size === 0} variant="primary" className="px-3 py-2">
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Add {selectedIds.size || ''} selected
          </Button>
          <Button onClick={onClose} variant="secondary" className="px-3 py-2">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Cancel
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
