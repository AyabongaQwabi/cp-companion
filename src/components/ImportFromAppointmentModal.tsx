'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckSquare, Download, FileDown, X } from 'lucide-react';
import { motion } from 'framer-motion';
import ConfirmSpendModal from './ConfirmSpendModal';
import LoadingState from './LoadingState';
import { useChargedAction } from '@/lib/useChargedAction';
import { Button } from '@/components/ui/Button';

interface Candidate {
  name: string;
  idNumber: string;
  occupation: string;
}

interface ImportFromAppointmentModalProps {
  userId: string;
  appointmentId: string;
  onClose: () => void;
  onImported: () => void;
}

/**
 * Same mechanism as ImportFromHistoryModal (Part D), entry-pointed from a single appointment
 * instead of scanning the company's whole history — pulled from
 * /api/appointments/[id]/import-employees, which already dedupes against the roster server-side.
 * Review-and-select, same as the existing tool; nothing is imported automatically. Reuses the
 * existing import.commitEmployee price (3 credits/employee) — browsing here is free.
 */
export default function ImportFromAppointmentModal({
  userId,
  appointmentId,
  onClose,
  onImported,
}: ImportFromAppointmentModalProps) {
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(userId);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [generatedIds, setGeneratedIds] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/appointments/${appointmentId}/import-employees?userId=${encodeURIComponent(userId)}`
      );
      const data = await res.json();
      setCandidates(data.candidates ?? []);
      setGeneratedIds(data.generatedIds ?? 0);
    } finally {
      setLoading(false);
    }
  }, [appointmentId, userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const toggle = (idNumber: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idNumber)) next.delete(idNumber);
      else next.add(idNumber);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(candidates.map((c) => c.idNumber)));
  const selectNone = () => setSelected(new Set());

  const doImport = () => {
    if (selected.size === 0) return;
    const toImport = candidates.filter((c) => selected.has(c.idNumber));
    requestAction(
      'import.commitEmployee',
      `Import ${selected.size} employee(s) from this appointment`,
      async () => {
        setImporting(true);
        try {
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
        className="bg-white max-w-md w-full rounded-card shadow-md border border-gray-200 p-6 max-h-[85vh] overflow-y-auto"
      >
        <h2 className="font-semibold text-gray-900 mb-2 inline-flex items-center gap-2">
          <FileDown className="h-4 w-4 text-red-500" aria-hidden="true" />
          Import employees from this appointment
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Only employees not already in your roster are shown. Nothing is imported automatically.
        </p>

        {loading && <LoadingState label="Loading importable employees..." className="py-2" />}

        {!loading && candidates.length === 0 && (
          <p className="text-sm text-gray-500">
            Every employee on this appointment is already in your roster.
          </p>
        )}

        {!loading && candidates.length > 0 && (
          <>
            <div className="flex gap-3 mb-2 text-xs items-center">
              <button onClick={selectAll} className="inline-flex items-center gap-1 text-red-500 hover:text-red-600 transition-colors">
                <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                Select all
              </button>
              <button onClick={selectNone} className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Select none
              </button>
              <span className="text-gray-400">{selected.size} selected</span>
            </div>

            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card mb-2">
              {candidates.map((c) => (
                <li key={c.idNumber} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={selected.has(c.idNumber)}
                    onChange={() => toggle(c.idNumber)}
                    className="accent-red-500"
                  />
                  <span className="font-medium text-gray-900">{c.name}</span>
                  <span className="text-gray-500">
                    {c.idNumber} · {c.occupation || 'No occupation on record'}
                  </span>
                </li>
              ))}
            </ul>

            {generatedIds > 0 && (
              <p className="text-xs text-gray-400 mb-2">
                {generatedIds} employee(s) on this appointment have no ID/passport number on
                record — a unique placeholder ID was generated so they can still be imported.
                Update their real ID number once known.
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
