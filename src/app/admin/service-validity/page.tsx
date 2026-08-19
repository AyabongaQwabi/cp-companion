'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, KeyRound, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import LoadingState from '@/components/LoadingState';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useChargedAction } from '@/lib/useChargedAction';
import medicalServicesConfig from '../../../../config/medical-services.json';
import dashboardPages from '../../../../config/dashboard-pages.json';
import type { ServiceValidityPeriod } from '@/lib/types';

const SERVICE_OPTIONS = medicalServicesConfig.services.map((s: { id: string; title: string }) => ({
  id: s.id,
  title: s.title,
}));

/**
 * Superadmin-only settings surface for cp_companion.serviceValidityPeriods — a GLOBAL,
 * cross-company config collection. Server-side role check happens on every API call this page
 * makes (isSuperadmin, fail-closed 403); this page's own gate is just UX, not the real security
 * boundary. Deliberately built as a standalone /admin route rather than folded into the roster
 * settings page, so it can grow into a broader operator dashboard later without reshaping this.
 */
export default function ServiceValidityAdminPage() {
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [forbidden, setForbidden] = useState(false);
  const [rows, setRows] = useState<ServiceValidityPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [newServiceId, setNewServiceId] = useState('');
  const [newMonths, setNewMonths] = useState('');
  const [newIsDraft, setNewIsDraft] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/service-validity-periods?userId=${encodeURIComponent(session.id)}`);
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      router.push('/login');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [session, router, load]);

  const upsert = async (serviceId: string, validityMonths: number, isDraft: boolean) => {
    if (!session) return;
    requestAction(
      'serviceValidity.upsert',
      'Save service validity rule',
      async () => {
        setSaving(true);
        try {
          const res = await fetch('/api/service-validity-periods', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: session.id, serviceId, validityMonths, isDraft }),
          });
          if (res.status === 403) {
            setForbidden(true);
            return;
          }
          await load();
        } finally {
          setSaving(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  const remove = async (serviceId: string) => {
    if (!session) return;
    requestAction(
      'serviceValidity.delete',
      'Delete service validity rule',
      async () => {
        const params = new URLSearchParams({ userId: session.id, serviceId });
        const res = await fetch(`/api/service-validity-periods?${params}`, { method: 'DELETE' });
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        await load();
      },
      { chargeSeparately: true }
    );
  };

  const addRow = async () => {
    if (!newServiceId || !newMonths) return;
    await upsert(newServiceId, Number(newMonths), newIsDraft);
    setNewServiceId('');
    setNewMonths('');
    setNewIsDraft(true);
  };

  const clearDraft = (row: ServiceValidityPeriod) => {
    upsert(row.serviceId, row.validityMonths, false);
  };

  if (!session) return null;

  if (forbidden) {
    return (
      <div className="max-w-2xl mx-auto px-4 pb-12">
        <NavBar session={session} />
        <PageIntro
          title={dashboardPages.forbidden.title}
          description={dashboardPages.forbidden.description}
          icon={ShieldAlert}
        />
        <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded-card p-4">
          This page is restricted to superadmins. Your account does not have that role.
        </div>
      </div>
    );
  }

  const titleFor = (serviceId: string) =>
    SERVICE_OPTIONS.find((s) => s.id === serviceId)?.title || serviceId;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-12">
      <NavBar session={session} />
      <PageIntro
        title={dashboardPages.serviceValidity.title}
        description={dashboardPages.serviceValidity.description}
        icon={KeyRound}
      />

      <p className="text-xs text-gray-500 mb-4">
        How long each medical service stays valid before compliance tracking flags an employee as
        due for renewal. This is global config shared across every company on the platform — a
        service with no row here is simply never tracked for expiry.{' '}
        {dashboardPages.serviceValidity.helpers.global}
      </p>

      {loading ? (
        <LoadingState label="Loading service validity rules..." className="mb-4" />
      ) : (
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="font-normal py-2">Service</th>
              <th className="font-normal py-2">Validity (months)</th>
              <th className="font-normal py-2">Status</th>
              <th className="font-normal py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.serviceId} className="border-b border-gray-100">
                <td className="py-2 text-gray-800">{titleFor(r.serviceId)}</td>
                <td className="py-2 text-gray-600">{r.validityMonths}</td>
                <td className="py-2">
                  {r.isDraft ? (
                    <Badge tone="gold">Draft — unconfirmed</Badge>
                  ) : (
                    <Badge tone="green">Confirmed</Badge>
                  )}
                </td>
                <td className="py-2 flex gap-2">
                  {r.isDraft && (
                    <button
                      onClick={() => clearDraft(r)}
                      disabled={saving}
                      className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-800 transition-colors"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Confirm
                    </button>
                  )}
                  <button
                    onClick={() => remove(r.serviceId)}
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-gray-400">
                  No validity periods configured — every service is untracked for expiry.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <div className="border border-gray-200 rounded-card p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Add / update a service</h2>
        <p className="text-xs text-gray-500 mb-3">{dashboardPages.serviceValidity.helpers.form}</p>
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={newServiceId} onChange={(e) => setNewServiceId(e.target.value)} className="w-72">
            <option value="">Select a service…</option>
            {SERVICE_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            min={1}
            placeholder="Months"
            value={newMonths}
            onChange={(e) => setNewMonths(e.target.value)}
            className="w-28"
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={newIsDraft} onChange={(e) => setNewIsDraft(e.target.checked)} className="accent-red-500" />
            Mark as draft/unconfirmed
          </label>
          <Button onClick={addRow} disabled={saving || !newServiceId || !newMonths} variant="primary" className="text-xs px-3 py-1.5">
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
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
