'use client';

import { AlertTriangle, Banknote, CheckCircle2, CircleDollarSign, WalletCards, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface ConfirmSpendModalProps {
  actionLabel: string;
  creditCost: number;
  currentBalance: number;
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
}

/**
 * Confirm-before-spending, per Part E. Deliberately plain — exact action, exact cost, exact
 * resulting balance, one confirm button, no persuasion technique. This is the safety/consent
 * moment that makes the no-refunds policy tolerable; do not add urgency, upsell, or styling that
 * nudges the click.
 */
export default function ConfirmSpendModal({
  actionLabel,
  creditCost,
  currentBalance,
  onConfirm,
  onCancel,
  confirming = false,
}: ConfirmSpendModalProps) {
  const resultingBalance = currentBalance - creditCost;
  const insufficientCredits = resultingBalance < 0;

  return (
    <div className="fixed inset-0 bg-gray-900/40 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="bg-white max-w-sm w-full rounded-card border border-gray-200 shadow-md p-6"
      >
        <h2 className="font-semibold text-gray-900 mb-4 inline-flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4 text-red-500" aria-hidden="true" />
          Confirm
        </h2>

        <dl className="text-sm mb-6">
          <div className="flex justify-between py-1">
            <dt className="text-gray-500">Action</dt>
            <dd className="text-gray-900">{actionLabel}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-gray-500 inline-flex items-center gap-1">
              <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
              Cost
            </dt>
            <dd className="text-gray-900">{creditCost} credits</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-gray-500 inline-flex items-center gap-1">
              <WalletCards className="h-3.5 w-3.5" aria-hidden="true" />
              Current balance
            </dt>
            <dd className="text-gray-900">{currentBalance} credits</dd>
          </div>
          <div className="flex justify-between py-1 font-medium">
            <dt className="text-gray-900">Balance after</dt>
            <dd className="text-gray-900">{resultingBalance} credits</dd>
          </div>
        </dl>

        {insufficientCredits ? (
          <>
            <p className="text-sm text-red-600 mb-4">
              <AlertTriangle className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
              You do not have enough credits for this action.
            </p>
            <div className="flex gap-3">
              <a
                href="/finances"
                className="bg-gray-900 text-white rounded-input px-3 py-2 text-sm text-center flex-1"
              >
                <Banknote className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Buy credits
              </a>
              <button onClick={onCancel} className="border border-gray-300 rounded-input px-3 py-2 text-sm text-gray-700">
                <X className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              disabled={confirming}
              className="bg-gray-900 text-white rounded-input px-3 py-2 text-sm disabled:opacity-50"
            >
              <CheckCircle2 className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
              {confirming ? 'Processing…' : 'Confirm'}
            </button>
            <button onClick={onCancel} className="border border-gray-300 rounded-input px-3 py-2 text-sm text-gray-700">
              <X className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Cancel
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
