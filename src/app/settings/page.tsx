'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Lightbulb, Settings, Trash2 } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import NavBar from '@/components/NavBar';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import TypedConfirmModal from '@/components/TypedConfirmModal';
import PageIntro from '@/components/PageIntro';
import { Card } from '@/components/ui/Card';
import { Button, LinkButton } from '@/components/ui/Button';
import { useChargedAction } from '@/lib/useChargedAction';
import dashboardPages from '../../../config/dashboard-pages.json';
import featureRequestConfig from '../../../config/feature-request.json';

interface AuditEntry {
  source: 'appointment' | 'company' | 'companion';
  type: string;
  date: string;
  doer: string;
  entityId?: string;
}

type BulkDeleteKind = 'appointments' | 'companies' | 'employees';

const BULK_DELETE_CONFIG: Record<
  BulkDeleteKind,
  { title: string; description: string; endpoint: string; resultKey: string }
> = {
  appointments: {
    title: 'Delete all appointments',
    description:
      'Permanently deletes every appointment you manage. Each one is archived into a recovery collection before removal, but this cannot be undone from this app.',
    endpoint: '/api/settings/delete-all-appointments',
    resultKey: 'deletedCount',
  },
  companies: {
    title: 'Delete all companies',
    description:
      'Permanently deletes every company you manage (never companies you can only edit, and never any company you don’t manage). Each one is archived into a recovery collection before removal.',
    endpoint: '/api/settings/delete-all-companies',
    resultKey: 'deletedCount',
  },
  employees: {
    title: 'Delete all employees',
    description:
      'Archives your entire roster (hides it from lists; recoverable, not a hard delete) — sets the same inactive status used when removing one employee at a time.',
    endpoint: '/api/settings/delete-all-employees',
    resultKey: 'archivedCount',
  },
};

export default function SettingsPage() {
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [autoConfirmSpend, setAutoConfirmSpend] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [auditVisible, setAuditVisible] = useState(false);
  const [auditRevealedThisVisit, setAuditRevealedThisVisit] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPrice, setAuditPrice] = useState<number | null>(null);

  const [bulkModal, setBulkModal] = useState<BulkDeleteKind | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkResult, setBulkResult] = useState<{ kind: BulkDeleteKind; count: number } | null>(null);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/preferences?userId=${encodeURIComponent(uid)}`);
      const data = await res.json();
      setAutoConfirmSpend(data.autoConfirmSpend ?? true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  useEffect(() => {
    // Data fetch triggered on mount once session resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) load(session.id);
  }, [session, load]);

  useEffect(() => {
    fetch('/api/action-price?actionKey=profile.viewAuditLog')
      .then((r) => r.json())
      .then((d) => setAuditPrice(typeof d.creditCost === 'number' ? d.creditCost : null))
      .catch(() => setAuditPrice(null));
  }, []);

  const toggleAuditLog = async () => {
    if (!session) return;
    if (auditVisible) {
      // Closing never charges — only opening does, and only the first opening this page visit.
      setAuditVisible(false);
      return;
    }

    if (auditRevealedThisVisit) {
      // Already charged once this page visit — re-showing cached entries is free.
      setAuditVisible(true);
      return;
    }

    requestAction(
      'profile.viewAuditLog',
      'Reveal audit log',
      async () => {
        setAuditVisible(true);
        setAuditLoading(true);
        try {
          const res = await fetch(
            `/api/audit-log?userId=${encodeURIComponent(session.id)}&charge=true`
          );
          const data = await res.json();
          if (!res.ok) {
            setAuditVisible(false);
            return;
          }
          setAuditEntries(data.entries || []);
          setAuditRevealedThisVisit(true);
        } finally {
          setAuditLoading(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  const openBulkModal = (kind: BulkDeleteKind) => {
    setBulkError('');
    setBulkResult(null);
    setBulkModal(kind);
  };

  const submitBulkDelete = async () => {
    if (!session || !bulkModal) return;
    const actionKeyByKind: Record<BulkDeleteKind, string> = {
      appointments: 'settings.deleteAllAppointments',
      companies: 'settings.deleteAllCompanies',
      employees: 'settings.deleteAllEmployees',
    };
    requestAction(
      actionKeyByKind[bulkModal],
      BULK_DELETE_CONFIG[bulkModal].title,
      async () => {
        setBulkSubmitting(true);
        setBulkError('');
        try {
          const { endpoint, resultKey } = BULK_DELETE_CONFIG[bulkModal];
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: session.id, confirmationText: 'DELETE ALL' }),
          });
          const data = await res.json();
          if (!res.ok) {
            setBulkError(data.error || 'Could not complete this action.');
            return;
          }
          setBulkResult({ kind: bulkModal, count: data[resultKey] ?? 0 });
          setBulkModal(null);
        } finally {
          setBulkSubmitting(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  const toggleAutoConfirm = async () => {
    if (!session) return;
    const next = !autoConfirmSpend;
    requestAction(
      'settings.updatePreferences',
      'Update spending preferences',
      async () => {
        setSaving(true);
        setAutoConfirmSpend(next);
        try {
          const res = await fetch('/api/preferences', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: session.id, autoConfirmSpend: next }),
          });
          if (!res.ok) setAutoConfirmSpend(!next);
        } finally {
          setSaving(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  if (!session) return null;

  return (
    <main className="flex-1 p-6 max-w-3xl mx-auto w-full bg-background">
      <NavBar session={session} />
      <PageIntro
        title={dashboardPages.settings.title}
        description={dashboardPages.settings.description}
        icon={Settings}
      />

      <section className="mb-10">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Spending</h2>
        <Card className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Skip the confirm step before every priced action
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-md">
                When on, any action that costs credits is charged and run immediately — you
                won&apos;t be shown what it costs or asked to confirm first. Charges are still
                final and non-refundable either way; this only removes the extra click, not the
                charge itself. {dashboardPages.settings.helpers.spending}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={autoConfirmSpend}
              onClick={toggleAutoConfirm}
              disabled={loading || saving}
              className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-pill transition-colors duration-150 motion-reduce:transition-none disabled:opacity-50 ${
                autoConfirmSpend ? 'bg-red-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-pill bg-white transition-transform duration-150 motion-reduce:transition-none ${
                  autoConfirmSpend ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </Card>
      </section>

      <section className="mb-10">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          {featureRequestConfig.settingsCard.sectionTitle}
        </h2>
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">
                {featureRequestConfig.settingsCard.title}
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-md">
                {featureRequestConfig.settingsCard.description}
              </p>
            </div>
            <LinkButton
              href={featureRequestConfig.settingsCard.href}
              variant="secondary"
              className="shrink-0 text-sm px-4 py-2"
            >
              <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
              {featureRequestConfig.settingsCard.buttonLabel}
            </LinkButton>
          </div>
        </Card>
      </section>

      <section className="mb-10">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Audit log</h2>
        <Card className="p-4">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Your activity across appointments, companies, and account changes
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-md">
                Scoped to your own account, companies, and appointments only.{' '}
                {auditPrice !== null
                  ? `Revealing it costs ${auditPrice} credit${auditPrice === 1 ? '' : 's'}, once per visit to this page.`
                  : ''}
              </p>
            </div>
            <Button
              onClick={toggleAuditLog}
              disabled={auditLoading}
              variant="secondary"
              className="shrink-0 text-sm px-4 py-2"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {auditLoading ? 'Loading…' : auditVisible ? 'Hide audit log' : 'Show audit log'}
            </Button>
          </div>

          {auditVisible && (
            <div className="border-t border-gray-200 pt-3 max-h-96 overflow-y-auto">
              {auditEntries.length === 0 ? (
                <p className="text-xs text-gray-500">No activity yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="pb-2 pr-3 font-medium">When</th>
                      <th className="pb-2 pr-3 font-medium">Source</th>
                      <th className="pb-2 pr-3 font-medium">Type</th>
                      <th className="pb-2 font-medium">Entity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditEntries.map((entry, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1.5 pr-3 text-gray-700 whitespace-nowrap">
                          {new Date(entry.date).toLocaleString()}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-500">{entry.source}</td>
                        <td className="py-1.5 pr-3 text-gray-900">{entry.type}</td>
                        <td className="py-1.5 text-gray-500">{entry.entityId || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </Card>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-red-900 mb-3">Danger zone — bulk deletion</h2>
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-xs text-red-700 mb-4 max-w-md leading-relaxed">
            These actions are destructive at scale and cannot be triggered by a single click. Each
            requires typing a confirmation phrase and produces a full audit-log entry listing
            exactly what was affected. {dashboardPages.settings.helpers.danger}
          </p>

          {bulkResult && (
            <p className="text-sm text-green-700 mb-4">
              {BULK_DELETE_CONFIG[bulkResult.kind].resultKey === 'archivedCount'
                ? `Archived ${bulkResult.count} employee${bulkResult.count === 1 ? '' : 's'}.`
                : `Deleted ${bulkResult.count} ${bulkResult.kind}.`}
            </p>
          )}

          <div className="flex flex-col gap-3">
            {(Object.keys(BULK_DELETE_CONFIG) as BulkDeleteKind[]).map((kind) => (
              <div
                key={kind}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-red-200 rounded-input p-3 bg-white"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{BULK_DELETE_CONFIG[kind].title}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-md">
                    {BULK_DELETE_CONFIG[kind].description}
                  </p>
                </div>
                <Button
                  onClick={() => openBulkModal(kind)}
                  variant="secondary"
                  className="shrink-0 text-sm px-4 py-2 !border-red-300 !text-red-700 hover:!border-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {BULK_DELETE_CONFIG[kind].title}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {bulkModal && (
        <TypedConfirmModal
          title={BULK_DELETE_CONFIG[bulkModal].title}
          description={BULK_DELETE_CONFIG[bulkModal].description}
          confirmText="DELETE ALL"
          confirmButtonLabel={BULK_DELETE_CONFIG[bulkModal].title}
          onConfirm={submitBulkDelete}
          onCancel={() => setBulkModal(null)}
          confirming={bulkSubmitting}
          error={bulkError}
        />
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
