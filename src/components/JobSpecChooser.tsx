'use client';

import { useState } from 'react';
import FileUploadField from './FileUploadField';
import ConfirmSpendModal from './ConfirmSpendModal';
import { useChargedAction } from '@/lib/useChargedAction';

interface JobSpecChooserProps {
  userId: string;
  rosterEmployeeId: string;
  /** The job spec file already saved on this roster employee's record, if any. */
  existingJobSpecFile?: string;
  existingExtraJobSpecFiles?: string[];
  /** Current choice for this appointment. */
  jobSpecFile: string;
  extraJobSpecFiles: string[];
  onChange: (next: { jobSpecFile: string; extraJobSpecFiles: string[] }) => void;
  /** Called when a fresh upload should also be saved back onto the roster employee's record. */
  onSaveToRoster?: (next: { jobSpecFile?: string; extraJobSpecFiles?: string[] }) => void;
}

type Mode = 'existing' | 'new';

/**
 * Part F.7 — per-employee, per-appointment job spec chooser. If the roster employee already has
 * a saved job spec file, offers "use existing" (free, no new upload) or "upload new" (priced per
 * F.1, 5 credits/file — confirmed before the upload runs). If they have none saved, only
 * "upload new" is offered, and per F.7's recommended default, that upload is also saved back
 * onto the roster employee's record so it becomes "existing" for next time — flagged to Aya as
 * a default, not a hardcoded requirement (see the build report).
 */
export default function JobSpecChooser({
  userId,
  existingJobSpecFile,
  existingExtraJobSpecFiles,
  jobSpecFile,
  extraJobSpecFiles,
  onChange,
  onSaveToRoster,
}: JobSpecChooserProps) {
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(userId);
  const [mode, setMode] = useState<Mode>(existingJobSpecFile ? 'existing' : 'new');

  const selectExisting = () => {
    requestAction('file.reuseExisting', 'Reuse existing job spec file', () => {
      setMode('existing');
      onChange({
        jobSpecFile: existingJobSpecFile || '',
        extraJobSpecFiles: existingExtraJobSpecFiles || [],
      });
    });
  };

  const selectNew = () => {
    setMode('new');
  };

  // FileUploadField performs the upload itself and hands back the resulting URL(s) — the file
  // is already stored by the time onChange fires. Charging here (before accepting the result
  // into appointment/roster state) still gates whether the upload is actually used, even though
  // the storage write already happened; rejecting on insufficient credits simply discards the
  // uploaded URL rather than adopting it.
  const handleNewJobSpec = (url: string) => {
    requestAction('file.uploadNew', 'Upload new job spec file', () => {
      onChange({ jobSpecFile: url, extraJobSpecFiles });
      if (!existingJobSpecFile) {
        onSaveToRoster?.({ jobSpecFile: url });
      }
    });
  };

  const handleNewExtras = (urls: string[]) => {
    const newCount = urls.length - extraJobSpecFiles.length;
    if (newCount <= 0) {
      onChange({ jobSpecFile, extraJobSpecFiles: urls });
      return;
    }
    requestAction('file.uploadNew', `Upload ${newCount} new job spec file(s)`, () => {
      onChange({ jobSpecFile, extraJobSpecFiles: urls });
      if (!existingExtraJobSpecFiles?.length) {
        onSaveToRoster?.({ extraJobSpecFiles: urls });
      }
    });
  };

  return (
    <div className="border border-gray-200 rounded-card p-3 bg-white">
      <p className="text-xs font-medium text-gray-900 mb-2">Job spec file (required)</p>

      {existingJobSpecFile && (
        <div className="flex gap-4 mb-3 text-xs text-gray-700">
          <label className="flex items-center gap-1">
            <input type="radio" checked={mode === 'existing'} onChange={selectExisting} className="accent-red-500" />
            Use existing file
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={mode === 'new'} onChange={selectNew} className="accent-red-500" />
            Upload a new file for this appointment
          </label>
        </div>
      )}

      {mode === 'existing' && existingJobSpecFile && (
        <p className="text-xs text-gray-600 truncate">
          Reusing:{' '}
          <a href={existingJobSpecFile} target="_blank" rel="noreferrer" className="text-red-500 hover:text-red-600 transition-colors underline">
            {decodeURIComponent(existingJobSpecFile.split('/').pop() || existingJobSpecFile)}
          </a>
        </p>
      )}

      {mode === 'new' && (
        <FileUploadField label="" value={jobSpecFile} onChange={handleNewJobSpec} />
      )}

      <div className="mt-3">
        <FileUploadField
          label="Extra job spec files (optional)"
          value={extraJobSpecFiles}
          onChange={handleNewExtras}
          multiple
        />
      </div>

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
