'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { AlertTriangle, FileSpreadsheet, Upload, X } from 'lucide-react';
import { motion } from 'framer-motion';
import ConfirmSpendModal from './ConfirmSpendModal';
import LoadingState from './LoadingState';
import { useChargedAction } from '@/lib/useChargedAction';
import { Button } from '@/components/ui/Button';

interface ReviewedRow {
  name: string;
  idNumber: string;
  occupation?: string;
  idValid: boolean | null;
  duplicateOfExistingId: boolean;
}

interface ImportFromCsvModalProps {
  userId: string;
  onClose: () => void;
  onImported: () => void;
}

/**
 * Bulk CSV roster import — same review-before-commit pattern as ImportFromHistoryModal, but flat
 * (not grouped by appointment) since CSV rows have no natural grouping. Non-blocking checkboxes
 * flag invalid SA IDs and likely duplicates; the user decides whether to import them anyway.
 */
export default function ImportFromCsvModal({ userId, onClose, onImported }: ImportFromCsvModalProps) {
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(userId);
  const [fileName, setFileName] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewedRows, setReviewedRows] = useState<ReviewedRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    setReviewing(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = (results.data as Record<string, string>[]).map((r) => ({
            name: r.name || r.Name || '',
            idNumber: r.idNumber || r.idnumber || r['ID Number'] || r.id || '',
            occupation: r.occupation || r.Occupation || '',
          }));
          const res = await fetch('/api/roster/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, rows }),
          });
          const data = await res.json();
          setReviewedRows(data.rows || []);
          setSelected(new Set((data.rows || []).map((_: unknown, i: number) => i)));
        } catch {
          setError('Could not parse or review that file.');
        } finally {
          setReviewing(false);
        }
      },
      error: () => {
        setError('Could not parse that file.');
        setReviewing(false);
      },
    });
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const doImport = () => {
    if (selected.size === 0) return;
    requestAction(
      'roster.importCsvEmployee',
      `Import ${selected.size} employee(s) from CSV`,
      async () => {
        setImporting(true);
        try {
          const toImport = reviewedRows.filter((_, i) => selected.has(i));
          await fetch('/api/roster/import/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, rows: toImport }),
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
          <FileSpreadsheet className="h-4 w-4 text-red-500" aria-hidden="true" />
          Import roster from CSV
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Columns expected: name, idNumber, occupation. Nothing is imported until you review and
          confirm below.
        </p>

        <input type="file" accept=".csv" onChange={onFileChange} className="text-sm mb-3" />
        {fileName && <p className="text-xs text-gray-500 mb-2">{fileName}</p>}
        {error && (
          <p className="text-xs text-red-600 mb-2 inline-flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {error}
          </p>
        )}
        {reviewing && <LoadingState label="Reviewing CSV..." className="py-2" />}

        {!reviewing && reviewedRows.length > 0 && (
          <>
            <div className="flex gap-3 mb-2 text-xs items-center">
              <span className="text-gray-400">{selected.size} of {reviewedRows.length} selected</span>
            </div>
            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card overflow-hidden mb-3">
              {reviewedRows.map((r, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    className="accent-red-500"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">{r.name}</span>{' '}
                    <span className="text-gray-500">{r.idNumber} · {r.occupation || 'No occupation'}</span>
                    {r.idValid === false && (
                      <p className="text-[11px] text-amber-600 inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        Doesn&apos;t look like a valid SA ID number.
                      </p>
                    )}
                    {r.duplicateOfExistingId && (
                      <p className="text-[11px] text-amber-600 inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        Matches an existing roster entry — may be a duplicate.
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex gap-3 mt-4">
          <Button onClick={doImport} disabled={importing || selected.size === 0} variant="primary" className="px-3 py-2">
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
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
