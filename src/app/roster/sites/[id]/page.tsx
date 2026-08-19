'use client';

import { useEffect, useState, useCallback, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Trash2, UserPlus } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import type { RosterEmployee, RosterSite, EmployeeGroup } from '@/lib/types';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import LoadingState from '@/components/LoadingState';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import EmployeeSelectionModal from '@/components/EmployeeSelectionModal';
import { useChargedAction } from '@/lib/useChargedAction';
import { Button } from '@/components/ui/Button';
import dashboardPages from '../../../../../config/dashboard-pages.json';

export default function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: siteId } = use(params);
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [site, setSite] = useState<RosterSite | null>(null);
  const [siteEmployees, setSiteEmployees] = useState<RosterEmployee[]>([]);
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingSelected, setAddingSelected] = useState(false);
  const [showEmployeeSelector, setShowEmployeeSelector] = useState(false);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const [siteRes, siteEmpRes, groupRes] = await Promise.all([
        fetch(`/api/sites/${siteId}`),
        fetch(`/api/sites/${siteId}/employees`),
        fetch(`/api/employee-groups?userId=${encodeURIComponent(uid)}`),
      ]);
      if (siteRes.ok) setSite(await siteRes.json());
      setSiteEmployees(await siteEmpRes.json());
      setGroups(await groupRes.json());
    } finally {
      setLoading(false);
    }
  }, [siteId]);

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

  const siteEmployeeIds = useMemo(() => new Set(siteEmployees.map((e) => e._id!)), [siteEmployees]);

  const addSelectedFromModal = (employees: RosterEmployee[]) => {
    if (!site || employees.length === 0 || !session) return;
    setShowEmployeeSelector(false);
    requestAction(
      'site.bulkAddEmployee',
      `Add ${employees.length} employee(s) to site`,
      async () => {
        setAddingSelected(true);
        try {
          await fetch('/api/employees/bulk-add-site', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: session.id,
              employeeIds: employees.map((e) => e._id!),
              site: { id: site._id, name: site.name, hasAccessCard: site.hasAccessCard },
            }),
          });
          load(session.id);
        } finally {
          setAddingSelected(false);
        }
      },
      { chargeSeparately: true, quantity: employees.length }
    );
  };

  const removeFromSite = (employeeId: string) => {
    if (!session) return;
    requestAction(
      'site.removeEmployee',
      'Remove employee from site',
      async () => {
        await fetch('/api/employees/remove-site', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: session.id, employeeId, siteId }),
        });
        load(session.id);
      },
      { chargeSeparately: true }
    );
  };

  if (!session) return null;

  return (
    <main className="flex-1 p-6 max-w-3xl mx-auto w-full bg-background">
      <NavBar session={session} />
      <PageIntro
        title={site?.name || dashboardPages.site.title}
        description={dashboardPages.site.description}
        icon={MapPin}
      />

      <Link href="/roster" className="text-sm text-red-500 hover:text-red-600 transition-colors mb-6 inline-block">
        ← Back to roster
      </Link>

      {loading && <LoadingState label="Loading site roster..." className="mb-4" />}

      {!loading && (
        <>
          <section className="mb-10">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">
              Employees on this site ({siteEmployees.length})
            </h2>
            <p className="text-xs text-gray-500 mb-3">{dashboardPages.site.helpers.employees}</p>
            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card overflow-hidden">
              {siteEmployees.map((emp) => (
                <li
                  key={emp._id}
                  className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <span className="font-medium text-gray-900">{emp.name}</span>{' '}
                    <span className="text-gray-500">
                      {emp.idNumber} · {emp.occupation}
                    </span>
                  </div>
                  <button
                    onClick={() => removeFromSite(emp._id!)}
                    className="inline-flex items-center gap-1 text-red-600 text-xs hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove from site
                  </button>
                </li>
              ))}
              {siteEmployees.length === 0 && (
                <li className="px-3 py-4 text-sm text-gray-500">
                  No employees on this site yet.
                </li>
              )}
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Add employees to this site</h2>
            <p className="text-xs text-gray-500 mb-3">{dashboardPages.site.helpers.addEmployees}</p>
            <Button
              onClick={() => setShowEmployeeSelector(true)}
              disabled={addingSelected}
              variant="secondary"
              className="text-sm px-3 py-2"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              {addingSelected ? 'Adding…' : 'Add employees'}
            </Button>
          </section>
        </>
      )}

      {showEmployeeSelector && session && (
        <EmployeeSelectionModal
          userId={session.id}
          groups={groups}
          alreadyAddedIds={siteEmployeeIds}
          onClose={() => setShowEmployeeSelector(false)}
          onConfirm={addSelectedFromModal}
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
