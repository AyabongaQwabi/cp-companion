'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import { Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useChargedAction } from '@/lib/useChargedAction';
import clinicsConfig from '../../../config/clinics.json';
import type { AvailabilityStatus } from '@/lib/availability';
import dashboardPages from '../../../config/dashboard-pages.json';

interface DayInfo {
  currentBookings: number;
  appointmentCount: number;
  remaining: number;
  status: AvailabilityStatus;
}

const STATUS_STYLES: Record<AvailabilityStatus, string> = {
  open: 'bg-green-50 border-green-200 text-green-800',
  filling: 'bg-amber-50 border-amber-200 text-amber-800',
  full: 'bg-red-50 border-red-200 text-red-800',
};

const STATUS_LABELS: Record<AvailabilityStatus, string> = {
  open: 'Open',
  filling: 'Filling up',
  full: 'Fully booked',
};

const UNKNOWN_STYLE = 'bg-gray-50 border-gray-200 text-gray-400';

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export default function AvailabilityPage() {
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [clinic, setClinic] = useState<string>(clinicsConfig[0] || 'Hendrina');
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [limit, setLimit] = useState<number | null>(null);
  const [days, setDays] = useState<Record<string, DayInfo>>({});
  const [loading, setLoading] = useState(false);
  // Distinct from `loading`: false until the first successful fetch resolves for the
  // currently-selected clinic/month, or true forever if the charge/fetch never ran (declined
  // charge, insufficient credits, pending confirm modal). Every day cell falls back to "open"
  // when `info` is missing purely because it hasn't loaded — without this flag that fallback is
  // indistinguishable from a genuinely open day, which is exactly the silent-failure trust issue
  // this page had: an unpaid/declined calendar load rendered as if every day were available.
  const [loadError, setLoadError] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!session) router.push('/login');
  }, [session, router]);

  const load = useCallback(async () => {
    if (!session) return;
    setHasLoaded(false);
    setLoadError(false);
    setDays({});
    await requestAction('availability.viewCalendar', 'View availability calendar', async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ clinic, year: String(year), month: String(month) });
        const res = await fetch(`/api/availability/month?${params}`);
        if (!res.ok) {
          setLoadError(true);
          return;
        }
        const data = await res.json();
        setLimit(data.limit);
        setDays(data.days || {});
        setHasLoaded(true);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    });
  }, [clinic, year, month, session, requestAction]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const changeMonth = (delta: number) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    setMonth(newMonth);
    setYear(newYear);
  };

  if (!session) return null;

  const total = daysInMonth(year, month);
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-ZA', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="max-w-4xl mx-auto px-4 pb-12">
      <NavBar session={session} />
      <PageIntro
        title={dashboardPages.availability.title}
        description={dashboardPages.availability.description}
        icon={Activity}
      />

      <p className="text-xs text-gray-500 mb-2">{dashboardPages.availability.helpers.controls}</p>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="px-2 py-1" onClick={() => changeMonth(-1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="font-medium text-gray-900 min-w-[10rem] text-center">{monthLabel}</span>
          <Button variant="secondary" className="px-2 py-1" onClick={() => changeMonth(1)}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <Select value={clinic} onChange={(e) => setClinic(e.target.value)} className="w-40">
          {clinicsConfig.map((c: string) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      {limit !== null && (
        <p className="text-sm text-gray-500 mb-4">
          Clinic limit: <strong>{limit}</strong> employees/day
        </p>
      )}

      {!loading && (loadError || !hasLoaded) && (
        <div className="mb-4 border border-amber-200 bg-amber-50 text-amber-800 rounded-card px-3 py-2 text-xs flex items-center justify-between gap-3">
          <span>
            {loadError
              ? "Couldn't load booking data for this month — the days below don't reflect real availability."
              : "Booking data hasn't loaded yet — the days below don't reflect real availability."}
          </span>
          <Button variant="secondary" className="px-2 py-1 text-xs shrink-0" onClick={() => load()}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-7 gap-2 text-xs text-gray-500 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center">
            {d}
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-7 gap-2 ${loading ? 'opacity-50' : ''}`}>
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const info = days[dateStr];
          // Only trust a day's status once this month's fetch has actually succeeded — before
          // that (still loading, declined charge, insufficient credits, fetch error) every day
          // renders as "unknown", never as a default "open", so an unloaded calendar can't be
          // mistaken for a genuinely wide-open one.
          if (!hasLoaded) {
            return (
              <div
                key={dateStr}
                className={`border rounded-card p-2 text-xs min-h-[4.5rem] flex flex-col justify-between ${UNKNOWN_STYLE}`}
              >
                <span className="font-medium">{day}</span>
                <div className="opacity-60">—</div>
              </div>
            );
          }
          const status: AvailabilityStatus = info?.status ?? 'open';
          return (
            <div
              key={dateStr}
              className={`border rounded-card p-2 text-xs min-h-[4.5rem] flex flex-col justify-between ${STATUS_STYLES[status]}`}
            >
              <span className="font-medium">{day}</span>
              {info ? (
                <div>
                  <div className="font-medium">{STATUS_LABELS[status]}</div>
                  <div className="opacity-90">{info.currentBookings} booked</div>
                  <div className="opacity-75">{info.remaining} open</div>
                </div>
              ) : (
                <div>
                  <div className="font-medium">{STATUS_LABELS.open}</div>
                  <div className="opacity-90">0 booked</div>
                  <div className="opacity-75">{limit ?? '—'} open</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-4 mt-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-200 inline-block" /> Open (&lt;70%)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-200 inline-block" /> Filling up (70–99%)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-200 inline-block" /> Fully booked (100%+)
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-2">{dashboardPages.availability.helpers.legend}</p>
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
