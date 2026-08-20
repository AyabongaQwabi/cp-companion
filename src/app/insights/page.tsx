'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  BarChart3,
  Building2,
  ChartNoAxesCombined,
  CircleX,
  Clock3,
  Download,
  Eye,
  FileText,
  ListChecks,
  TrendingUp,
  Users,
} from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import { useChargedAction } from '@/lib/useChargedAction';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import dashboardPages from '../../../config/dashboard-pages.json';

interface InsightsData {
  totalAppointments: number;
  monthlyVolume: { month: string; count: number }[];
  lifecycle: { approved: number; pending: number; declined: number; abandoned: number };
  financials: { collected: number; pending: number; declined: number };
  serviceBreakdown: { id: string; title: string; count: number; revenue: number }[];
  companyBreakdown: {
    id: string;
    name: string;
    collected: number;
    pending: number;
    declined: number;
    appointments: number;
  }[];
  benchmarks: {
    companyId: string;
    companyName: string;
    benchmarks: {
      cohortSize: number;
      avgSpendPerEmployeePerYear: number;
      xrayAttachRate: number;
      typicalRebookingIntervalDays: number;
      typicalRosterSize: number;
      ownBookingIntervalDays: number | null;
      positioning: 'above-average' | 'below-average' | 'average' | 'not-enough-data';
      dominantServiceType: string | null;
      dominantServiceTitle: string | null;
    };
  }[];
}

const rand = (amount: number) => `R${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

export default function InsightsPage() {
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    const res = await fetch(`/api/insights?userId=${encodeURIComponent(uid)}`);
    setData(await res.json());
    setLoading(false);
  }, []);

  const exportCsv = () => {
    if (!data) return;
    setExporting('csv');
    try {
      const lines: string[] = [];
      lines.push('Metric,Value');
      lines.push(`Total appointments,${data.totalAppointments}`);
      lines.push(`Revenue collected,${data.financials.collected}`);
      lines.push(`Revenue pending,${data.financials.pending}`);
      lines.push(`Revenue declined,${data.financials.declined}`);
      lines.push(`Approved,${data.lifecycle.approved}`);
      lines.push(`Pending,${data.lifecycle.pending}`);
      lines.push(`Declined,${data.lifecycle.declined}`);
      lines.push(`Abandoned,${data.lifecycle.abandoned}`);
      lines.push('');
      lines.push('Month,Appointments');
      data.monthlyVolume.forEach((m) => lines.push(`${m.month},${m.count}`));
      lines.push('');
      lines.push('Service,Count,Revenue');
      data.serviceBreakdown.forEach((s) => lines.push(`"${s.title}",${s.count},${s.revenue}`));
      if (data.companyBreakdown.length > 1) {
        lines.push('');
        lines.push('Company,Appointments,Collected,Pending,Declined');
        data.companyBreakdown.forEach((c) =>
          lines.push(`"${c.name}",${c.appointments},${c.collected},${c.pending},${c.declined}`)
        );
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `insights-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    const el = document.getElementById('insights-printable');
    if (!el) return;
    setExporting('pdf');
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      const canvas = await html2canvas(el, { scale: 1.5 });
      const imgData = canvas.toDataURL('image/png');
      const doc = new jsPDF('p', 'px', [canvas.width, canvas.height]);
      doc.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      doc.save(`insights-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  const openInsights = () => {
    if (!session) return;
    requestAction('insights.open', 'Open Insights', async () => {
      setOpened(true);
      await load(session.id);
    });
  };

  const runExportCsv = () => {
    requestAction('insights.export', 'Export Insights (CSV)', exportCsv);
  };

  const runExportPdf = () => {
    requestAction('insights.export', 'Export Insights (PDF)', exportPdf);
  };

  if (!session) return null;

  if (!opened) {
    return (
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full bg-background">
        <NavBar session={session} />
        <PageIntro
          title={dashboardPages.insights.title}
          description={dashboardPages.insights.description}
          icon={ChartNoAxesCombined}
        />
        <p className="text-xs text-gray-500 mb-4">{dashboardPages.insights.helpers.gate}</p>
        <Button onClick={openInsights} variant="primary" className="px-4 py-2">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          View Insights
        </Button>
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
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 max-w-3xl mx-auto w-full bg-background">
      <NavBar session={session} />
      <PageIntro
        title={dashboardPages.insights.title}
        description={dashboardPages.insights.description}
        icon={ChartNoAxesCombined}
      />

      {loading && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="h-32" />
          <Skeleton className="h-40" />
        </div>
      )}

      {!loading && data && (
        <>
          <div className="flex justify-end gap-2 mb-4">
            <p className="text-xs text-gray-500 mr-auto self-center">
              {dashboardPages.insights.helpers.exports}
            </p>
            <Button
              onClick={runExportCsv}
              disabled={exporting !== null}
              variant="secondary"
              className="text-xs px-3 py-1.5"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
            </Button>
            <Button
              onClick={runExportPdf}
              disabled={exporting !== null}
              variant="secondary"
              className="text-xs px-3 py-1.5"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
            </Button>
          </div>

          <div id="insights-printable">
          <section className="grid grid-cols-3 gap-3 mb-8">
            <Card premium className="p-3">
              <p className="text-xs text-gray-500 inline-flex items-center gap-1">
                <Banknote className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                Revenue collected
              </p>
              <p className="text-lg font-semibold text-gray-900">{rand(data.financials.collected)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-gray-500 inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                Pending / quoted
              </p>
              <p className="text-lg font-semibold text-gray-900">{rand(data.financials.pending)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-gray-500 inline-flex items-center gap-1">
                <CircleX className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                Declined
              </p>
              <p className="text-lg font-semibold text-gray-900">{rand(data.financials.declined)}</p>
            </Card>
          </section>

          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 inline-flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-red-500" aria-hidden="true" />
              Appointment lifecycle ({data.totalAppointments} total)
            </h2>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div className="border border-gray-200 rounded-card p-2 text-center bg-white">
                <p className="text-xs text-gray-500">Approved</p>
                <p className="font-semibold text-gray-900">{data.lifecycle.approved}</p>
              </div>
              <div className="border border-gray-200 rounded-card p-2 text-center bg-white">
                <p className="text-xs text-gray-500">Pending</p>
                <p className="font-semibold text-gray-900">{data.lifecycle.pending}</p>
              </div>
              <div className="border border-gray-200 rounded-card p-2 text-center bg-white">
                <p className="text-xs text-gray-500">Declined</p>
                <p className="font-semibold text-red-600">{data.lifecycle.declined}</p>
              </div>
              <div className="border border-gray-200 rounded-card p-2 text-center bg-white">
                <p className="text-xs text-gray-500">Abandoned</p>
                <p className="font-semibold text-gray-900">{data.lifecycle.abandoned}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              &ldquo;Abandoned&rdquo; = bookings started but deleted before ever reaching a payment
              decision — a volume signal, not a lost-revenue figure.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 inline-flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-red-500" aria-hidden="true" />
              Appointment volume by month
            </h2>
            {data.monthlyVolume.length === 0 ? (
              <p className="text-sm text-gray-500">No appointment history yet.</p>
            ) : (
              <div className="flex items-end gap-1 h-32 border-b border-l border-gray-200 pl-2 pb-1">
                {data.monthlyVolume.map((m) => {
                  const max = Math.max(...data.monthlyVolume.map((x) => x.count), 1);
                  return (
                    <div key={m.month} className="flex flex-col items-center flex-1" title={m.month}>
                      <div
                        className="bg-gradient-to-t from-red-600 to-red-400 w-full rounded-t-input"
                        style={{ height: `${(m.count / max) * 100}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 inline-flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-red-500" aria-hidden="true" />
              Most-booked services
            </h2>
            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card overflow-hidden">
              {data.serviceBreakdown.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm bg-white">
                  <span className="text-gray-800">{s.title}</span>
                  <span className="text-gray-500">
                    {s.count}× · {rand(s.revenue)}
                  </span>
                </li>
              ))}
              {data.serviceBreakdown.length === 0 && (
                <li className="px-3 py-4 text-sm text-gray-500">No services booked yet.</li>
              )}
            </ul>
          </section>

          {data.benchmarks.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 inline-flex items-center gap-2">
                <Users className="h-4 w-4 text-red-500" aria-hidden="true" />
                Companies like yours
              </h2>
              <p className="text-xs text-gray-400 mb-3">
                Anonymized averages across other companies with a similar roster size and service mix.
                Never shows another company&apos;s name or exact figures.
              </p>
              <div className="space-y-3">
                {data.benchmarks.map((b) => (
                  <Card key={b.companyId} className="p-3">
                    {data.benchmarks.length > 1 && (
                      <p className="text-xs font-medium text-gray-900 mb-2">{b.companyName}</p>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-500">Avg. spend per employee / year</p>
                        <p className="font-semibold text-gray-900">{rand(b.benchmarks.avgSpendPerEmployeePerYear)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">X-ray attach rate</p>
                        <p className="font-semibold text-gray-900">
                          {Math.round(b.benchmarks.xrayAttachRate * 100)}% include an x-ray
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">
                          Typical rebooking interval
                          {b.benchmarks.dominantServiceTitle ? ` (${b.benchmarks.dominantServiceTitle})` : ''}
                        </p>
                        <p className="font-semibold text-gray-900">
                          every {b.benchmarks.typicalRebookingIntervalDays} days
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Typical roster size</p>
                        <p className="font-semibold text-gray-900">{b.benchmarks.typicalRosterSize} employees</p>
                      </div>
                    </div>
                    {b.benchmarks.positioning !== 'not-enough-data' && (
                      <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-gray-100">
                        Your booking frequency is{' '}
                        <strong className="text-gray-900">
                          {b.benchmarks.positioning === 'average' ? 'about average' : b.benchmarks.positioning.replace('-', ' ')}
                        </strong>{' '}
                        for your peer group.
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-2">
                      Based on {b.benchmarks.cohortSize} similar companies.
                    </p>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {data.companyBreakdown.length > 1 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3 inline-flex items-center gap-2">
                <Building2 className="h-4 w-4 text-red-500" aria-hidden="true" />
                By company
              </h2>
              <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card overflow-hidden">
                {data.companyBreakdown.map((c) => (
                  <li key={c.id} className="px-3 py-2 text-sm bg-white">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{c.name}</span>
                      <span className="text-gray-500">{c.appointments} appointments</span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500 mt-1">
                      <span>Collected {rand(c.collected)}</span>
                      <span>Pending {rand(c.pending)}</span>
                      <span>Declined {rand(c.declined)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          </div>
        </>
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
    </main>
  );
}
