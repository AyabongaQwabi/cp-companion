'use client';

import { useEffect, useState } from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import { motion } from 'framer-motion';
import ConfirmSpendModal from './ConfirmSpendModal';
import LoadingState from './LoadingState';
import { useChargedAction } from '@/lib/useChargedAction';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface UserResult {
  id: string;
  name: string;
  email: string;
}

interface AddAppointmentManagerModalProps {
  userId: string;
  appointmentId: string;
  onClose: () => void;
  onAdded: () => void;
}

/**
 * Search production.users (read-only, by name/email) and add the selected user's id into this
 * appointment's usersWhoCanManage array. A real write to an existing field on an existing
 * appointment, priced (appointment.addManager) and confirmed like every other write here.
 */
export default function AddAppointmentManagerModal({
  userId,
  appointmentId,
  onClose,
  onAdded,
}: AddAppointmentManagerModalProps) {
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(userId);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (!search) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    setLoading(true);
    fetch(
      `/api/appointments/${appointmentId}/managers?userId=${encodeURIComponent(userId)}&search=${encodeURIComponent(search)}`
    )
      .then((r) => r.json())
      .then((d) => setResults(d.users ?? []))
      .finally(() => setLoading(false));
  }, [search, appointmentId, userId]);

  const addUser = (target: UserResult) => {
    setAdding(target.id);
    requestAction(
      'appointment.addManager',
      `Add ${target.name} to this appointment's managers`,
      async () => {
        try {
          await fetch(`/api/appointments/${appointmentId}/managers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, targetUserId: target.id, targetUserName: target.name }),
          });
          onAdded();
        } finally {
          setAdding(null);
        }
      },
      { chargeSeparately: true }
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
        <h2 className="font-semibold text-gray-900 mb-3 inline-flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-red-500" aria-hidden="true" />
          Add a user to this appointment
        </h2>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email…"
            autoFocus
            className="w-full pl-9"
          />
        </div>

        {loading && <LoadingState label="Searching users..." className="py-2" />}
        {!loading && search && results.length === 0 && (
          <p className="text-sm text-gray-500">No matching users found.</p>
        )}

        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card mb-2">
          {results.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-gray-900">{u.name}</span>{' '}
                <span className="text-gray-500">{u.email}</span>
              </span>
              <button
                onClick={() => addUser(u)}
                disabled={adding === u.id}
              className="text-red-600 text-xs hover:text-red-700 transition-colors"
            >
              <UserPlus className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
              {adding === u.id ? 'Adding…' : 'Add'}
            </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-3 mt-4">
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
