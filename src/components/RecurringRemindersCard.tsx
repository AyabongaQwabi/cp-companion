'use client';

import { useEffect, useState } from 'react';
import { Bell, CalendarPlus } from 'lucide-react';
import type { RecurringBookingFlag } from '@/lib/types';

interface RecurringRemindersCardProps {
  userId: string;
}

/**
 * "Upcoming repeat bookings" dashboard card — surfaces recurring-flag reminders due within the
 * lead window. Never auto-creates an appointment: each row links to /book, which still requires
 * the full human confirm/NDA/job-spec flow to actually book anything.
 */
export default function RecurringRemindersCard({ userId }: RecurringRemindersCardProps) {
  const [flags, setFlags] = useState<RecurringBookingFlag[]>([]);

  useEffect(() => {
    fetch(`/api/recurring-flags?userId=${encodeURIComponent(userId)}&dueOnly=1`)
      .then((r) => r.json())
      .then((d) => setFlags(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [userId]);

  if (flags.length === 0) return null;

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-card p-4 mb-6">
      <h2 className="text-sm font-semibold text-amber-900 mb-2">
        <Bell className="inline-block h-4 w-4 mr-1.5" aria-hidden="true" />
        Upcoming repeat bookings ({flags.length})
      </h2>
      <ul className="flex flex-col gap-1">
        {flags.map((f) => (
          <li key={f._id} className="text-xs text-amber-800 flex items-center justify-between">
            <span>Due {f.nextDueDate}{f.serviceId ? ` · ${f.serviceId}` : ''}</span>
            <a href="/book" className="inline-flex items-center gap-1 underline hover:no-underline">
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Start booking
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
