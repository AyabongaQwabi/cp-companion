'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileText,
  LineChart,
  MapPin,
  ReceiptText,
  Sparkles,
  Tags,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import ConfirmSpendModal from './ConfirmSpendModal';
import LoadingState from './LoadingState';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useChargedAction } from '@/lib/useChargedAction';

interface EmployeeInsightsProps {
  userId: string;
  employeeId: string;
  employeeName: string;
  variant?: 'row' | 'detail';
}

interface EmployeeInsightsData {
  employee: {
    name: string;
    idNumber: string;
    occupation: string;
    groupNames: string[];
    companyIds: string[];
  };
  stats: {
    totalBooked: number;
    approved: number;
    pending: number;
    declined: number;
    totalAmountSpent: number;
    firstDate?: string | null;
    mostRecentDate?: string | null;
  };
  topServices: { serviceId: string; title: string; count: number }[];
  clinicBreakdown: { clinic: string; count: number }[];
  recentHistory: {
    appointmentId?: string;
    date: string;
    clinic: string;
    status: 'approved' | 'pending' | 'declined';
    attributedPrice: number;
  }[];
  spendTrend: { appointmentId?: string; date: string; amount: number }[];
  documents: {
    hasJobSpecFile: boolean;
    jobSpecFile?: string;
    extraJobSpecFileCount: number;
    ndaPdfCount: number;
    latestNdaPdf?: string;
  };
  suggestedNextBooking:
    | {
        configured: false;
        message: string;
      }
    | {
        configured: true;
        serviceId?: string;
        title?: string;
        lastCompletedDate?: string;
        expiryDate?: string;
        daysUntilExpiry?: number;
        message?: string;
      };
  dataQuality: {
    idNumberValid: boolean | null;
    nameVariants: string[];
    nameVariantCount?: number;
  };
  mathCheck: {
    appointmentId?: string;
    appointmentEmployeeCount: number;
    appointmentTotal: number;
    employeeServicesTotal: number;
    dover: number;
    xray: number;
    employeeAttributedPrice: number;
  } | null;
}

const money = (amount: number) =>
  `R${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatDate(date?: string | null) {
  if (!date) return 'No history yet';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusTone(status: 'approved' | 'pending' | 'declined') {
  if (status === 'approved') return 'green';
  if (status === 'pending') return 'gold';
  return 'red';
}

export default function EmployeeInsights({
  userId,
  employeeId,
  employeeName,
  variant = 'row',
}: EmployeeInsightsProps) {
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(userId);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EmployeeInsightsData | null>(null);
  const [error, setError] = useState('');

  const loadInsights = () => {
    requestAction(
      'employee.insights.view',
      `View insights for ${employeeName}`,
      async () => {
        setOpen(true);
        setLoading(true);
        setError('');
        try {
          const res = await fetch(
            `/api/employees/${employeeId}/insights?userId=${encodeURIComponent(userId)}`
          );
          const next = await res.json();
          if (!res.ok) {
            setError(next.error || 'Could not load employee insights.');
            return;
          }
          setData(next);
        } finally {
          setLoading(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  const hasTrend = (data?.spendTrend.length ?? 0) > 1;
  const maxTrend = Math.max(...(data?.spendTrend.map((point) => point.amount) || [1]), 1);

  return (
    <>
      <Button
        type="button"
        variant={variant === 'detail' ? 'secondary' : 'ghost'}
        onClick={loadInsights}
        className={variant === 'detail' ? 'text-xs px-3 py-1.5' : 'text-xs !px-2 !py-1'}
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        View Insights
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[2px]">
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-card border border-gray-200 bg-white p-6 shadow-lg shadow-gray-900/10"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <Sparkles className="h-4 w-4 text-red-500" aria-hidden="true" />
                  Employee insights
                </h2>
                <p className="mt-1 text-sm text-gray-500">{employeeName}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-card text-gray-500 transition-colors hover:bg-gray-50 hover:text-red-600"
                aria-label="Close employee insights"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {loading && <LoadingState label="Loading employee insights..." className="py-10" />}
            {error && (
              <p className="mb-4 inline-flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {error}
              </p>
            )}

            {!loading && data && (
              <div className="space-y-6">
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-card border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">Appointments booked</p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">{data.stats.totalBooked}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {data.stats.approved} approved, {data.stats.pending} pending, {data.stats.declined} declined
                    </p>
                  </div>
                  <div className="rounded-card border border-gray-200 bg-gray-50 p-3">
                    <p className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <ReceiptText className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                      Total amount spent
                    </p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">
                      {money(data.stats.totalAmountSpent)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Approved appointments only</p>
                  </div>
                  <div className="rounded-card border border-gray-200 bg-gray-50 p-3">
                    <p className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <CalendarClock className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                      First / latest
                    </p>
                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {formatDate(data.stats.firstDate)} &rarr; {formatDate(data.stats.mostRecentDate)}
                    </p>
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-card border border-gray-200 p-4">
                    <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <BarChart3 className="h-4 w-4 text-red-500" aria-hidden="true" />
                      Top services
                    </h3>
                    {data.topServices.length === 0 ? (
                      <p className="text-sm text-gray-500">No approved or pending service history yet.</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {data.topServices.map((service) => (
                          <li key={service.serviceId} className="flex justify-between gap-3">
                            <span className="text-gray-700">{service.title}</span>
                            <span className="font-medium text-gray-900">{service.count}x</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-card border border-gray-200 p-4">
                    <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <MapPin className="h-4 w-4 text-red-500" aria-hidden="true" />
                      Clinic breakdown
                    </h3>
                    {data.clinicBreakdown.length === 0 ? (
                      <p className="text-sm text-gray-500">No clinic history yet.</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {data.clinicBreakdown.map((clinic) => (
                          <li key={clinic.clinic} className="flex justify-between gap-3">
                            <span className="text-gray-700">{clinic.clinic}</span>
                            <span className="font-medium text-gray-900">{clinic.count}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-card border border-gray-200 p-4">
                    <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <CalendarClock className="h-4 w-4 text-red-500" aria-hidden="true" />
                      Suggested next booking
                    </h3>
                    {(() => {
                      const nextBooking = data.suggestedNextBooking;
                      if (!nextBooking.configured || nextBooking.message || !nextBooking.expiryDate) {
                        return (
                          <p className="text-sm text-gray-500">
                            {nextBooking.message || 'No tracked service history yet for this employee.'}
                          </p>
                        );
                      }

                      return (
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {formatDate(nextBooking.expiryDate)}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {nextBooking.title}{' '}
                            {(nextBooking.daysUntilExpiry ?? 0) < 0
                              ? `is overdue by ${Math.abs(nextBooking.daysUntilExpiry ?? 0)} day(s)`
                              : `expires in ${nextBooking.daysUntilExpiry} day(s)`}
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="rounded-card border border-gray-200 p-4">
                    <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <BriefcaseBusiness className="h-4 w-4 text-red-500" aria-hidden="true" />
                      Current context
                    </h3>
                    <p className="text-sm text-gray-700">{data.employee.occupation || 'No occupation saved'}</p>
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500">
                      <Tags className="h-3.5 w-3.5" aria-hidden="true" />
                      {data.employee.groupNames.length
                        ? data.employee.groupNames.join(', ')
                        : 'No groups assigned'}
                    </p>
                  </div>
                </section>

                {hasTrend && (
                  <section className="rounded-card border border-gray-200 p-4">
                    <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <LineChart className="h-4 w-4 text-red-500" aria-hidden="true" />
                      Spend trend
                    </h3>
                    <div className="flex h-24 items-end gap-1 border-b border-l border-gray-200 pl-2 pb-1">
                      {data.spendTrend.map((point) => (
                        <div
                          key={`${point.appointmentId}-${point.date}`}
                          title={`${formatDate(point.date)}: ${money(point.amount)}`}
                          className="flex-1 rounded-t-input bg-gradient-to-t from-red-600 to-red-300"
                          style={{ height: `${Math.max(8, (point.amount / maxTrend) * 100)}%` }}
                        />
                      ))}
                    </div>
                  </section>
                )}

                <section className="rounded-card border border-gray-200 p-4">
                  <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <FileText className="h-4 w-4 text-red-500" aria-hidden="true" />
                    Documents on file
                  </h3>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge tone={data.documents.hasJobSpecFile ? 'green' : 'neutral'}>
                      {data.documents.hasJobSpecFile ? 'Job spec saved' : 'No job spec saved'}
                    </Badge>
                    <Badge tone="neutral">{data.documents.extraJobSpecFileCount} extra file(s)</Badge>
                    <Badge tone={data.documents.ndaPdfCount > 0 ? 'green' : 'neutral'}>
                      {data.documents.ndaPdfCount} NDA record(s)
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    {data.documents.jobSpecFile && (
                      <a href={data.documents.jobSpecFile} target="_blank" rel="noreferrer" className="text-red-500 underline">
                        View job spec
                      </a>
                    )}
                    {data.documents.latestNdaPdf && (
                      <a href={data.documents.latestNdaPdf} target="_blank" rel="noreferrer" className="text-red-500 underline">
                        View latest NDA
                      </a>
                    )}
                  </div>
                </section>

                <section className="rounded-card border border-gray-200 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">Recent history</h3>
                  {data.recentHistory.length === 0 ? (
                    <p className="text-sm text-gray-500">No appointment history yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                            <th className="py-2 pr-3 font-medium">Date</th>
                            <th className="py-2 pr-3 font-medium">Clinic</th>
                            <th className="py-2 pr-3 font-medium">Status</th>
                            <th className="py-2 font-medium">Attributed price</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {data.recentHistory.map((row) => (
                            <tr key={`${row.appointmentId}-${row.date}`}>
                              <td className="py-2 pr-3 text-gray-700">{formatDate(row.date)}</td>
                              <td className="py-2 pr-3 text-gray-700">{row.clinic}</td>
                              <td className="py-2 pr-3">
                                <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                              </td>
                              <td className="py-2 text-gray-900">{money(row.attributedPrice)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {(data.dataQuality.idNumberValid === false || data.dataQuality.nameVariants.length > 1) && (
                  <section className="rounded-card border border-amber-200 bg-amber-50 p-4">
                    <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-amber-900">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      Data quality
                    </h3>
                    {data.dataQuality.idNumberValid === false && (
                      <p className="text-sm text-amber-800">
                        This ID number does not pass standard SA ID validation.
                      </p>
                    )}
                    {data.dataQuality.nameVariants.length > 1 && (
                      <p className="text-sm text-amber-800">
                        Found {data.dataQuality.nameVariants.length} name variants for this ID:{' '}
                        {data.dataQuality.nameVariants.join(', ')}.
                      </p>
                    )}
                  </section>
                )}

                {data.mathCheck && (
                  <section className="rounded-card border border-gray-200 bg-gray-50 p-4">
                    <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
                      Attribution check
                    </h3>
                    <p className="text-xs leading-relaxed text-gray-600">
                      Appointment {data.mathCheck.appointmentId || 'unknown'} had{' '}
                      {data.mathCheck.appointmentEmployeeCount} employee(s) and totalled{' '}
                      {money(data.mathCheck.appointmentTotal)}. This employee is attributed{' '}
                      {money(data.mathCheck.employeeAttributedPrice)} = services{' '}
                      {money(data.mathCheck.employeeServicesTotal)} + Dover {money(data.mathCheck.dover)} + X-ray{' '}
                      {money(data.mathCheck.xray)}.
                    </p>
                  </section>
                )}
              </div>
            )}
          </motion.div>
        </div>
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
    </>
  );
}
