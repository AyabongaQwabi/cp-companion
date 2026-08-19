'use client';

import { Trash2, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface DeleteAppointmentModalProps {
  appointmentId: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting?: boolean;
}

/**
 * Explicit confirm step before a real, high-consequence production write with no undo button of
 * its own (the appointment moves to production.deleted_appointments, but nothing in this app
 * offers to move it back). Deliberately plain, same non-persuasive pattern as ConfirmSpendModal —
 * exact action, exact consequence, one confirm button, no urgency or styling that nudges the
 * click. The credit cost/balance confirmation for the appointment.delete charge happens
 * separately via the normal ConfirmSpendModal flow, chained after this one.
 */
export default function DeleteAppointmentModal({
  appointmentId,
  onConfirm,
  onCancel,
  deleting = false,
}: DeleteAppointmentModalProps) {
  return (
    <div className="fixed inset-0 bg-gray-900/40 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="bg-white max-w-sm w-full rounded-card border border-gray-200 shadow-md p-6"
      >
        <h2 className="font-semibold text-gray-900 mb-4 inline-flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" />
          Delete appointment
        </h2>
        <p className="text-sm text-gray-700 mb-6">
          This will permanently remove appointment <span className="font-mono">{appointmentId}</span>{' '}
          from active appointments. There is no undo for this action.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="bg-gray-900 text-white rounded-input px-3 py-2 text-sm disabled:opacity-50"
          >
            <Trash2 className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
            {deleting ? 'Deleting…' : 'Delete appointment'}
          </button>
          <button onClick={onCancel} className="border border-gray-300 rounded-input px-3 py-2 text-sm text-gray-700">
            <X className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}
