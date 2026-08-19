'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, ExternalLink, Plus, Save } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import type { Company } from '@/lib/types';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import LoadingState from '@/components/LoadingState';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useChargedAction } from '@/lib/useChargedAction';
import dashboardPages from '../../../config/dashboard-pages.json';

export default function CompaniesPage() {
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRegistrationName, setNewRegistrationName] = useState('');
  const [newRegistrationNumber, setNewRegistrationNumber] = useState('');
  const [newVat, setNewVat] = useState('');
  const [newPhysicalAddress, setNewPhysicalAddress] = useState('');
  const [newPostalAddress, setNewPostalAddress] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/companies?userId=${encodeURIComponent(uid)}`);
      setCompanies(await res.json());
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

  const resetForm = () => {
    setNewName('');
    setNewRegistrationName('');
    setNewRegistrationNumber('');
    setNewVat('');
    setNewPhysicalAddress('');
    setNewPostalAddress('');
  };

  const createCompany = () => {
    if (!newName.trim() || !session) return;
    requestAction(
      'company.createNew',
      `Create company: ${newName.trim()}`,
      async () => {
        setCreating(true);
        try {
          await fetch('/api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: newName,
              userId: session.id,
              userName: `${session.name} ${session.surname}`,
              registrationName: newRegistrationName,
              registrationNumber: newRegistrationNumber,
              vat: newVat,
              physicalAddress: newPhysicalAddress,
              postalAddress: newPostalAddress,
            }),
          });
          resetForm();
          setShowCreate(false);
          load(session.id);
        } finally {
          setCreating(false);
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
        title={dashboardPages.companies.title}
        description={dashboardPages.companies.description}
        icon={Building2}
      />

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Your companies ({companies.length})
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">
            {dashboardPages.companies.helpers.list}
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)} variant="primary" className="text-xs px-3 py-1.5">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {showCreate ? 'Cancel' : 'Create company'}
        </Button>
      </div>

      {showCreate && (
        <div className="border border-gray-200 rounded-card p-4 mb-6 bg-white shadow-sm">
          <p className="text-xs text-gray-500 mb-3">{dashboardPages.companies.helpers.create}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Company name *</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Registration name</label>
              <Input
                value={newRegistrationName}
                onChange={(e) => setNewRegistrationName(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Registration number</label>
              <Input
                value={newRegistrationNumber}
                onChange={(e) => setNewRegistrationNumber(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">VAT number</label>
              <Input value={newVat} onChange={(e) => setNewVat(e.target.value)} className="w-full" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Physical address</label>
              <Input
                value={newPhysicalAddress}
                onChange={(e) => setNewPhysicalAddress(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Postal address</label>
              <Input
                value={newPostalAddress}
                onChange={(e) => setNewPostalAddress(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          <Button
            onClick={createCompany}
            disabled={creating || !newName.trim()}
            variant="primary"
            className="text-sm px-4 py-2"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {creating ? 'Creating…' : 'Create company'}
          </Button>
        </div>
      )}

      {loading && <LoadingState label="Loading companies..." className="mb-4" />}

      {!loading && (
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card">
          {companies.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-3 py-3 text-sm">
              <div>
                <span className="font-medium text-gray-900">{c.details.name}</span>{' '}
                <span className="text-gray-500">
                  {c.details.registrationNumber ? `Reg. ${c.details.registrationNumber}` : ''}
                  {c.details.vat ? ` · VAT ${c.details.vat}` : ''}
                </span>
              </div>
              <Link href={`/companies/${c.id}`} className="inline-flex items-center gap-1 text-red-500 hover:text-red-600 transition-colors">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Manage
              </Link>
            </li>
          ))}
          {companies.length === 0 && (
            <li className="px-3 py-4 text-sm text-gray-500">No companies yet.</li>
          )}
        </ul>
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
