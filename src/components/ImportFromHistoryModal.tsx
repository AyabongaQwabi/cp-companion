'use client';

import { useEffect, useState, useCallback } from 'react';
import { CalendarClock, CheckSquare, Download, Search, X } from 'lucide-react';
import { motion } from 'framer-motion';
import ConfirmSpendModal from './ConfirmSpendModal';
import LoadingState from './LoadingState';
import Pagination from './Pagination';
import { useChargedAction } from '@/lib/useChargedAction';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface Candidate {
  name: string;
  idNumber: string;
  occupation: string;
}

interface AppointmentGroup {
  appointmentId: string;
  date: string;
  clinic: string;
  companyName: string;
  employees: Candidate[];
}

interface ImportFromHistoryModalProps {
  userId: string;
  onClose: () => void;
  onImported: () => void;
}

const formatDate = (date: string) => {
  const d = new Date(date);
  return Number.isNaN(d.getTime())
    ? date || 'Unknown date'
    : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * Loads a company's past-appointment history by default, grouped by appointment (most recent
 * first) — one collapsible section per appointment, each with its own employees and its own
 * "select all in this appointment" control. Still paginated by appointment per the site-wide
 * standard, and an optional search narrows to appointments containing a matching employee;
 * search is no longer required to see results.
 */
export default function ImportFromHistoryModal({
  userId,
  onClose,
  onImported,
}: ImportFromHistoryModalProps) {
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(userId);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<AppointmentGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [unmatched, setUnmatched] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedCandidates, setSelectedCandidates] = useState<Map<string, Candidate>>(new Map());
  const [importing, setImporting] = useState(false);

  const load = useCallback(
    async (term: string, p: number, size: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          userId,
          page: String(p),
          pageSize: String(size),
        });
        if (term) params.set('search', term);
        const res = await fetch(`/api/import-employees?${params.toString()}`);
        const data = await res.json();
        setGroups(data.groups ?? []);
        setTotal(data.total ?? 0);
        setUnmatched(data.unmatched ?? 0);
        // All appointment sections start expanded on a fresh load — the whole point of loading
        // by default is to see who's in each appointment without an extra click per section.
        setExpandedIds(new Set((data.groups ?? []).map((g: AppointmentGroup) => g.appointmentId)));
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  // Debounce search input, resetting to page 1 on a new search.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    // Data fetch triggered on mount and by search/page/pageSize changing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(search, page, pageSize);
  }, [search, page, pageSize, load]);

  const toggleExpanded = (appointmentId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(appointmentId)) next.delete(appointmentId);
      else next.add(appointmentId);
      return next;
    });
  };

  const toggle = (candidate: Candidate) => {
    const { idNumber } = candidate;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idNumber)) next.delete(idNumber);
      else next.add(idNumber);
      return next;
    });
    setSelectedCandidates((prev) => {
      const next = new Map(prev);
      if (next.has(idNumber)) next.delete(idNumber);
      else next.set(idNumber, candidate);
      return next;
    });
  };

  // Selects (or deselects, if all are already selected) every employee within one appointment
  // group only — leaves every other appointment's selections untouched.
  const toggleAllInGroup = (group: AppointmentGroup) => {
    const allSelected = group.employees.every((e) => selected.has(e.idNumber));
    setSelected((prev) => {
      const next = new Set(prev);
      group.employees.forEach((e) => (allSelected ? next.delete(e.idNumber) : next.add(e.idNumber)));
      return next;
    });
    setSelectedCandidates((prev) => {
      const next = new Map(prev);
      group.employees.forEach((e) => (allSelected ? next.delete(e.idNumber) : next.set(e.idNumber, e)));
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      groups.forEach((g) => g.employees.forEach((e) => next.add(e.idNumber)));
      return next;
    });
    setSelectedCandidates((prev) => {
      const next = new Map(prev);
      groups.forEach((g) => g.employees.forEach((e) => next.set(e.idNumber, e)));
      return next;
    });
  };
  const selectNone = () => {
    setSelected(new Set());
    setSelectedCandidates(new Map());
  };

  const doImport = () => {
    if (selected.size === 0) return;
    requestAction(
      'import.commitEmployee',
      `Import ${selected.size} employee(s)`,
      async () => {
        setImporting(true);
        try {
          const toImport = [...selectedCandidates.values()];
          await fetch('/api/import-employees/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, candidates: toImport }),
          });
          onImported();
        } finally {
          setImporting(false);
        }
      },
      { chargeSeparately: true, quantity: selected.size }
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="bg-white max-w-lg w-full rounded-card shadow-md border border-gray-200 p-6 max-h-[85vh] overflow-y-auto"
      >
        <h2 className="font-semibold text-gray-900 mb-2 inline-flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-red-500" aria-hidden="true" />
          Import from past appointments
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Employees from appointments you&apos;ve managed who aren&apos;t in your roster yet,
          across every company you&apos;ve booked for — grouped by appointment, most recent first.
          Nothing is imported automatically.
        </p>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Narrow by name, ID, or occupation…"
            autoFocus
            className="w-full pl-9"
          />
        </div>

        {loading && <LoadingState label="Loading appointment history..." className="py-2" />}

        {!loading && groups.length === 0 && (
          <p className="text-sm text-gray-500">
            {search ? 'No matching employees found.' : 'No importable appointment history found.'}
          </p>
        )}

        {!loading && groups.length > 0 && (
          <>
            <div className="flex gap-3 mb-2 text-xs items-center">
              <button onClick={selectAllOnPage} className="inline-flex items-center gap-1 text-red-500 hover:text-red-600 transition-colors">
                <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                Select all on this page
              </button>
              <button onClick={selectNone} className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Select none
              </button>
              <span className="text-gray-400">{selected.size} selected total</span>
            </div>

            <div className="flex flex-col gap-2 mb-2">
              {groups.map((group) => {
                const isExpanded = expandedIds.has(group.appointmentId);
                const allSelected = group.employees.every((e) => selected.has(e.idNumber));
                return (
                  <div key={group.appointmentId} className="border border-gray-200 rounded-card overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                      <button
                        onClick={() => toggleExpanded(group.appointmentId)}
                        className="text-xs text-gray-400 w-4"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? '▾' : '▸'}
                      </button>
                      <button
                        onClick={() => toggleExpanded(group.appointmentId)}
                        className="flex-1 text-left text-xs"
                      >
                        <span className="font-medium text-gray-900">
                          {group.companyName || 'Unknown company'}
                        </span>{' '}
                        <span className="text-gray-500">
                          · {formatDate(group.date)} · {group.clinic || 'Unknown clinic'} ·{' '}
                          {group.employees.length} employee{group.employees.length === 1 ? '' : 's'}
                        </span>
                      </button>
                      <button
                        onClick={() => toggleAllInGroup(group)}
                        className="text-[11px] text-red-500 hover:text-red-600 transition-colors whitespace-nowrap"
                      >
                        {allSelected ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>
                    {isExpanded && (
                      <ul className="divide-y divide-gray-200">
                        {group.employees.map((c) => (
                          <li key={c.idNumber} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors">
                            <input
                              type="checkbox"
                              checked={selected.has(c.idNumber)}
                              onChange={() => toggle(c)}
                              className="accent-red-500"
                            />
                            <span className="font-medium text-gray-900">{c.name}</span>
                            <span className="text-gray-500">
                              {c.idNumber} · {c.occupation || 'No occupation on record'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

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
            {unmatched > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                {unmatched} additional entries were skipped across your history — they had no
                ID/passport number on record, so they can&apos;t be safely deduped or imported
                automatically.
              </p>
            )}
          </>
        )}

        <div className="flex gap-3 mt-4">
          <Button onClick={doImport} disabled={importing || selected.size === 0} variant="primary" className="px-3 py-2">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {importing ? 'Importing…' : `Import ${selected.size || ''}`}
          </Button>
          <Button onClick={onClose} variant="secondary" className="px-3 py-2">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Close
          </Button>
        </div>
      </motion.div>

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
