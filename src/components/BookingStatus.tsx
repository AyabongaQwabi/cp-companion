'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarCheck, CheckCircle2, Clock3, UsersRound } from 'lucide-react';

interface BookingStatusData {
  limit: number;
  currentBookings: number;
  appointmentCount: number;
  remaining: number;
}

interface BookingStatusProps {
  clinic: string;
  date: string;
  employeeCount?: number;
}

/**
 * Replicates cp-redesign's RemainingSlots.js messaging (same thresholds and copy), backed by
 * /api/booking-status instead of the GET_SYSTEM_SETTINGS/GET_APPOINTMENTS_FOR_DATE_COUNT socket
 * events. When employeeCount is passed, shows how many of this in-progress appointment's
 * employees would still fit; omit it for a plain "how much room is left" lookup for any day.
 */
export default function BookingStatus({ clinic, date, employeeCount = 0 }: BookingStatusProps) {
  const [data, setData] = useState<BookingStatusData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Nothing to fetch or clear — the component renders null below while clinic/date are
    // unset, so stale `data` from a prior clinic/date simply won't be displayed.
    if (!clinic || !date) return;
    // Data fetch triggered by clinic/date changing — the standard case for setState-in-effect,
    // not a redundant derivation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/booking-status?clinic=${encodeURIComponent(clinic)}&date=${encodeURIComponent(date)}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [clinic, date]);

  if (!clinic || !date) return null;
  if (loading && !data) {
    return <p className="text-xs text-gray-500 inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 animate-pulse text-red-500" aria-hidden="true" />Checking availability...</p>;
  }
  if (!data) return null;

  const remainingSpots = Math.max(0, data.remaining - employeeCount);
  const canAddMore = remainingSpots > 0 || employeeCount === 0;
  const wouldExceed = employeeCount > 0 && data.currentBookings + employeeCount > data.limit;

  return (
    <div className="border border-gray-200 rounded-card p-3 text-sm bg-white">
      <p className="text-gray-600">
        <strong className="text-gray-900">
          <CalendarCheck className="inline-block h-4 w-4 mr-1.5 text-red-500" aria-hidden="true" />
          Booking status for {new Date(date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })} at {clinic}
        </strong>
      </p>
      <p className="text-gray-600">
        <UsersRound className="inline-block h-3.5 w-3.5 mr-1 text-gray-400" aria-hidden="true" />
        Employees already booked: <strong>{data.currentBookings}</strong> across{' '}
        <strong>{data.appointmentCount}</strong> appointment{data.appointmentCount === 1 ? '' : 's'}
      </p>
      {employeeCount > 0 && (
        <p className="text-gray-600">
          Employees in this appointment: <strong>{employeeCount}</strong>
        </p>
      )}
      <p className="text-gray-600">
        Clinic limit: <strong>{data.limit} employees per day</strong>
      </p>
      <p className="text-gray-600">
        Remaining spots available: <strong>{data.remaining}</strong>
      </p>
      {wouldExceed && (
        <p className="text-red-600 mt-1">
          <AlertTriangle className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
          <strong>Warning:</strong> This appointment would exceed the daily limit for {clinic}.
          Reduce the number of employees or choose a different date.
        </p>
      )}
      {!wouldExceed && employeeCount > 0 && !canAddMore && (
        <p className="text-red-600 mt-1">
          <AlertTriangle className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
          <strong>Warning:</strong> This clinic is now fully booked for this day.
        </p>
      )}
      {!wouldExceed && employeeCount > 0 && canAddMore && (
        <p className="text-green-700 mt-1">
          <CheckCircle2 className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
          You can still add up to <strong>{remainingSpots}</strong> more employees before {clinic}{' '}
          is fully booked on this day.
        </p>
      )}
    </div>
  );
}
