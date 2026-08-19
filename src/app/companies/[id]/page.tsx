'use client';

import { useEffect, useState, useCallback, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Save, Trash2, UserPlus } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import type { Company, RosterEmployee, EmployeeGroup } from '@/lib/types';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import LoadingState from '@/components/LoadingState';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import EmployeeSelectionModal from '@/components/EmployeeSelectionModal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useChargedAction } from '@/lib/useChargedAction';
import dashboardPages from '../../../../config/dashboard-pages.json';

/**
 * Company details (production.companies) are edited here; the employee list below is
 * companion-DB-only (RosterEmployee.companyIds) — adding/removing an employee here never writes
 * to production.appointments or production.companies.
 */
export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = use(params);
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [company, setCompany] = useState<Company | null>(null);
  const [members, setMembers] = useState<RosterEmployee[]>([]);
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEmployeeSelector, setShowEmployeeSelector] = useState(false);
  const [addingSelected, setAddingSelected] = useState(false);

  const [name, setName] = useState('');
  const [registrationName, setRegistrationName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [vat, setVat] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [postalAddress, setPostalAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const [companiesRes, membersRes, groupsRes] = await Promise.all([
        fetch(`/api/companies?userId=${encodeURIComponent(uid)}`),
        fetch(`/api/companies/${companyId}/employees`),
        fetch(`/api/employee-groups?userId=${encodeURIComponent(uid)}`),
      ]);
      const allCompanies: Company[] = await companiesRes.json();
      const found = allCompanies.find((c) => c.id === companyId) ?? null;
      setCompany(found);
      if (found) {
        setName(found.details.name);
        setRegistrationName(found.details.registrationName ?? '');
        setRegistrationNumber(found.details.registrationNumber ?? '');
        setVat(found.details.vat ?? '');
        setPhysicalAddress(found.details.physicalAddress ?? '');
        setPostalAddress(found.details.postalAddress ?? '');
      }
      setMembers(await membersRes.json());
      setGroups(await groupsRes.json());
    } finally {
      setLoading(false);
    }
  }, [companyId]);

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

  const memberIds = useMemo(() => new Set(members.map((m) => m._id!)), [members]);

  const saveDetails = () => {
    if (!session || !company) return;
    requestAction(
      'company.edit',
      'Save company details',
      async () => {
        setSaving(true);
        try {
          await fetch('/api/companies', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: companyId,
              userId: session.id,
              details: {
                name,
                registrationName,
                registrationNumber,
                vat,
                physicalAddress,
                postalAddress,
              },
            }),
          });
          load(session.id);
        } finally {
          setSaving(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  const addEmployeesFromModal = (employees: RosterEmployee[]) => {
    if (employees.length === 0 || !session) return;
    setShowEmployeeSelector(false);
    requestAction(
      'company.addRemoveEmployee',
      `Add ${employees.length} employee(s) to company`,
      async () => {
        setAddingSelected(true);
        try {
          await fetch(`/api/companies/${companyId}/employees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: session.id, employeeIds: employees.map((e) => e._id!) }),
          });
          load(session.id);
        } finally {
          setAddingSelected(false);
        }
      },
      { chargeSeparately: true, quantity: employees.length }
    );
  };

  const removeMember = (employeeId: string) => {
    if (!session) return;
    requestAction(
      'company.addRemoveEmployee',
      'Remove employee from company',
      async () => {
        await fetch(
          `/api/companies/${companyId}/employees?employeeId=${employeeId}&userId=${encodeURIComponent(session.id)}`,
          { method: 'DELETE' }
        );
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
        title={company?.details.name || dashboardPages.companyDetail.title}
        description={dashboardPages.companyDetail.description}
        icon={Building2}
      />

      <Link href="/companies" className="text-sm text-red-500 hover:text-red-600 transition-colors mb-6 inline-block">
        ← Back to companies
      </Link>

      {loading && <LoadingState label="Loading company details..." className="mb-4" />}

      {!loading && !company && (
        <p className="text-sm text-gray-500">
          Company not found, or you don&apos;t have access to it.
        </p>
      )}

      {!loading && company && (
        <>
          <section className="border border-gray-200 rounded-card p-4 mb-8 bg-white shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Details</h2>
            <p className="text-xs text-gray-500 mb-3">
              {dashboardPages.companyDetail.helpers.details}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Company name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Registration name</label>
                <Input
                  value={registrationName}
                  onChange={(e) => setRegistrationName(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Registration number</label>
                <Input
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">VAT number</label>
                <Input value={vat} onChange={(e) => setVat(e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Physical address</label>
                <Input
                  value={physicalAddress}
                  onChange={(e) => setPhysicalAddress(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Postal address</label>
                <Input
                  value={postalAddress}
                  onChange={(e) => setPostalAddress(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            <Button
              onClick={saveDetails}
              disabled={saving || !name.trim()}
              variant="primary"
              className="text-sm px-4 py-2"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? 'Saving…' : 'Save details'}
            </Button>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Employees at this company ({members.length})
                </h2>
                <p className="text-xs text-gray-500 mt-1 max-w-xl">
                  {dashboardPages.companyDetail.helpers.employees}
                </p>
              </div>
              <Button
                onClick={() => setShowEmployeeSelector(true)}
                disabled={addingSelected}
                variant="primary"
                className="text-xs px-3 py-1.5"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                {addingSelected ? 'Adding…' : 'Add employees'}
              </Button>
            </div>
            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card">
              {members.map((m) => (
                <li key={m._id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium text-gray-900">{m.name}</span>{' '}
                    <span className="text-gray-500">
                      {m.idNumber} · {m.occupation}
                    </span>
                  </span>
                  <button
                    onClick={() => removeMember(m._id!)}
                    className="inline-flex items-center gap-1 text-red-600 text-xs hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </button>
                </li>
              ))}
              {members.length === 0 && (
                <li className="px-3 py-4 text-sm text-gray-500">No employees added yet.</li>
              )}
            </ul>
          </section>
        </>
      )}

      {showEmployeeSelector && session && (
        <EmployeeSelectionModal
          userId={session.id}
          groups={groups}
          alreadyAddedIds={memberIds}
          onClose={() => setShowEmployeeSelector(false)}
          onConfirm={addEmployeesFromModal}
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
