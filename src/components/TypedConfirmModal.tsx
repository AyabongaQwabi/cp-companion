'use client';

import { useState } from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/Input';

interface TypedConfirmModalProps {
  title: string;
  description: string;
  confirmText: string;
  confirmButtonLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
  error?: string;
}

/**
 * Danger-zone confirm requiring the user to type an exact phrase, not just click a button —
 * used for account deletion and the three settings-page bulk deletes, all of which are
 * destructive at a scale a single misclick shouldn't be able to trigger. Deliberately plain, same
 * spirit as ConfirmSpendModal: no urgency/persuasion styling, just the facts and a typed gate.
 */
export default function TypedConfirmModal({
  title,
  description,
  confirmText,
  confirmButtonLabel,
  onConfirm,
  onCancel,
  confirming = false,
  error,
}: TypedConfirmModalProps) {
  const [typed, setTyped] = useState('');
  const matches = typed === confirmText;

  return (
    <div className="fixed inset-0 bg-gray-900/40 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="bg-white max-w-sm w-full rounded-card border border-gray-200 shadow-md p-6"
      >
        <h2 className="font-semibold text-gray-900 mb-2 inline-flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-600" aria-hidden="true" />
          {title}
        </h2>
        <p className="text-sm text-gray-600 mb-4 leading-relaxed">{description}</p>

        <label className="block text-xs text-gray-500 mb-1">
          Type <span className="font-mono font-semibold text-gray-900">{confirmText}</span> to confirm
        </label>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full mb-4"
          autoFocus
        />

        {error && (
          <p className="text-sm text-red-600 mb-4">
            <AlertTriangle className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={!matches || confirming}
            className="bg-red-600 text-white rounded-input px-3 py-2 text-sm disabled:opacity-50 flex-1"
          >
            <AlertTriangle className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
            {confirming ? 'Processing…' : confirmButtonLabel}
          </button>
          <button
            onClick={onCancel}
            className="border border-gray-300 rounded-input px-3 py-2 text-sm text-gray-700"
          >
            <X className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}
