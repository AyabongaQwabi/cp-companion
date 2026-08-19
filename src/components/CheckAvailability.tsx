'use client';

import { useState } from 'react';
import { CalendarSearch } from 'lucide-react';
import { CLINIC_LOCATIONS } from '@/lib/clinicplus-constants';
import BookingStatus from './BookingStatus';
import ConfirmSpendModal from './ConfirmSpendModal';
import { useChargedAction } from '@/lib/useChargedAction';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface CheckAvailabilityProps {
  userId: string;
}

/**
 * Standalone capacity lookup — pick any clinic/date to see remaining slots, independent of an
 * in-progress booking. Addresses admins repeatedly hitting the daily limit by surprise; this
 * lets them check ahead of time for any day, not just the one they're currently booking.
 * Priced per F.1 ("check clinic/date availability" = 10 credits) — gated behind an explicit
 * "Check" click and confirm, unlike BookingStatus's free automatic display while booking.
 */
export default function CheckAvailability({ userId }: CheckAvailabilityProps) {
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(userId);
  const [clinic, setClinic] = useState<string>(CLINIC_LOCATIONS[0]);
  const [date, setDate] = useState('');
  const [checkedFor, setCheckedFor] = useState<{ clinic: string; date: string } | null>(null);
  const [nonce, setNonce] = useState(0);

  const runCheck = () => {
    requestAction('booking.checkAvailability', 'Check availability', () => {
      setCheckedFor({ clinic, date });
      setNonce((n) => n + 1); // Force BookingStatus to refetch even if clinic/date are unchanged.
    });
  };

  return (
    <div className="border border-gray-200 rounded-card p-4 bg-white shadow-sm">
      <p className="text-sm font-semibold text-gray-900 mb-3 inline-flex items-center gap-2">
        <CalendarSearch className="h-4 w-4 text-red-500" aria-hidden="true" />
        Check availability for any day
      </p>
      <div className="flex gap-3 mb-3 flex-wrap items-center">
        <Select value={clinic} onChange={(e) => setClinic(e.target.value)}>
          {CLINIC_LOCATIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Button onClick={runCheck} disabled={!date} variant="secondary" className="text-sm px-3 py-1.5">
          <CalendarSearch className="h-3.5 w-3.5" aria-hidden="true" />
          Check
        </Button>
      </div>
      {checkedFor ? (
        <BookingStatus key={nonce} clinic={checkedFor.clinic} date={checkedFor.date} />
      ) : (
        <p className="text-xs text-gray-500">Choose a date and click Check to see remaining capacity.</p>
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
    </div>
  );
}
