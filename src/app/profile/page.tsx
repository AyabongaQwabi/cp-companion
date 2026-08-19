'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Save, ShieldAlert, Trash2, Undo2, User, X } from 'lucide-react';
import { getSession, saveSession, type Session } from '@/lib/session';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import LoadingState from '@/components/LoadingState';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import TypedConfirmModal from '@/components/TypedConfirmModal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useChargedAction } from '@/lib/useChargedAction';
import dashboardPages from '../../../config/dashboard-pages.json';

interface ProfileDetails {
  name: string;
  surname: string;
  email: string;
  contactNumber: string;
}

interface ProfileStats {
  appointmentCount: number;
  companyCount: number;
  employeeCount: number;
  creditBalance: number;
}

interface DeletionSchedule {
  scheduledFor: string;
  status: string;
}

const emptyDetails: ProfileDetails = { name: '', surname: '', email: '', contactNumber: '' };

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export default function ProfilePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [details, setDetails] = useState<ProfileDetails>(emptyDetails);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveCreditCost, setSaveCreditCost] = useState<number | null>(null);
  const [userId, setUserId] = useState('');

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordCreditCost, setPasswordCreditCost] = useState<number | null>(null);

  // Account deletion
  const [deletionSchedule, setDeletionSchedule] = useState<DeletionSchedule | null>(null);
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [deleteCreditCost, setDeleteCreditCost] = useState<number | null>(null);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/profile?userId=${encodeURIComponent(uid)}`);
      if (!res.ok) return;
      const data = await res.json();
      setDetails(data.details);
      setStats(data.stats);
      setName(data.details.name);
      setSurname(data.details.surname);
      setEmail(data.details.email);
      setContactNumber(data.details.contactNumber);
      setUserId(data.userId || uid);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDeletionSchedule = useCallback(async (uid: string) => {
    const res = await fetch(`/api/profile/delete-account?userId=${encodeURIComponent(uid)}`);
    if (!res.ok) return;
    const data = await res.json();
    setDeletionSchedule(data.schedule);
  }, []);

  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  useEffect(() => {
    // Data fetch triggered on mount once session resolves.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (session) {
      load(session.id);
      loadDeletionSchedule(session.id);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [session, load, loadDeletionSchedule]);

  useEffect(() => {
    // Real price from the server, not a hardcoded label — the button and copy below must never
    // claim a cost the charge itself won't actually enforce.
    fetch('/api/action-price?actionKey=profile.editDetails')
      .then((r) => r.json())
      .then((d) => setSaveCreditCost(typeof d.creditCost === 'number' ? d.creditCost : null))
      .catch(() => setSaveCreditCost(null));
    fetch('/api/action-price?actionKey=profile.changePassword')
      .then((r) => r.json())
      .then((d) => setPasswordCreditCost(typeof d.creditCost === 'number' ? d.creditCost : null))
      .catch(() => setPasswordCreditCost(null));
    fetch('/api/action-price?actionKey=account.deleteRequest')
      .then((r) => r.json())
      .then((d) => setDeleteCreditCost(typeof d.creditCost === 'number' ? d.creditCost : null))
      .catch(() => setDeleteCreditCost(null));
  }, []);

  const isDirty =
    name !== details.name ||
    surname !== details.surname ||
    email !== details.email ||
    contactNumber !== details.contactNumber;

  const saveDetails = () => {
    if (!session || !isDirty) return;
    setSaveError('');
    requestAction(
      'profile.editDetails',
      'Change your production account details',
      async () => {
        setSaving(true);
        try {
          const res = await fetch('/api/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: session.id,
              details: { name, surname, email, contactNumber },
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setSaveError(data.error || 'Could not save changes.');
            return;
          }
          setDetails({ name, surname, email, contactNumber });
          const updatedSession = { ...session, name, surname, email };
          saveSession(updatedSession);
          setSession(updatedSession);
          load(session.id);
        } finally {
          setSaving(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  const passwordsValid =
    currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmNewPassword;

  const savePassword = () => {
    if (!session || !passwordsValid) return;
    setPasswordError('');
    setPasswordSuccess(false);
    requestAction(
      'profile.changePassword',
      'Change your account password',
      async () => {
        setPasswordSaving(true);
        try {
          const res = await fetch('/api/profile/password', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: session.id, currentPassword, newPassword }),
          });
          const data = await res.json();
          if (!res.ok) {
            setPasswordError(data.error || 'Could not change password.');
            return;
          }
          setCurrentPassword('');
          setNewPassword('');
          setConfirmNewPassword('');
          setPasswordSuccess(true);
        } finally {
          setPasswordSaving(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  const submitDeleteRequest = () => {
    if (!session) return;
    requestAction(
      'account.deleteRequest',
      'Schedule ClinicPlus account deletion',
      async () => {
        setDeleteError('');
        setDeleteSubmitting(true);
        try {
          const res = await fetch('/api/profile/delete-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: session.id, confirmationText: 'DELETE' }),
          });
          const data = await res.json();
          if (!res.ok) {
            setDeleteError(data.error || 'Could not schedule deletion.');
            return;
          }
          setShowDeleteConfirm(false);
          await loadDeletionSchedule(session.id);
        } finally {
          setDeleteSubmitting(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  const cancelDeleteRequest = async () => {
    if (!session) return;
    requestAction(
      'account.deleteCancel',
      'Cancel scheduled account deletion',
      async () => {
        setCancelSubmitting(true);
        try {
          await fetch('/api/profile/delete-account', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: session.id }),
          });
          await loadDeletionSchedule(session.id);
        } finally {
          setCancelSubmitting(false);
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
        title={dashboardPages.profile.title}
        description={dashboardPages.profile.description}
        icon={User}
      />

      {loading && <LoadingState label="Loading your profile..." className="mb-4" />}

      {!loading && (
        <>
          <p className="text-xs text-gray-500 mb-3">{dashboardPages.profile.helpers.stats}</p>
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="border border-gray-200 rounded-card p-4 bg-white shadow-sm">
              <p className="text-xs text-gray-500">Appointments</p>
              <p className="text-2xl font-semibold text-gray-900">{stats?.appointmentCount ?? '—'}</p>
            </div>
            <div className="border border-gray-200 rounded-card p-4 bg-white shadow-sm">
              <p className="text-xs text-gray-500">Companies</p>
              <p className="text-2xl font-semibold text-gray-900">{stats?.companyCount ?? '—'}</p>
            </div>
            <div className="border border-gray-200 rounded-card p-4 bg-white shadow-sm">
              <p className="text-xs text-gray-500">Roster employees</p>
              <p className="text-2xl font-semibold text-gray-900">{stats?.employeeCount ?? '—'}</p>
            </div>
            <div className="border border-gray-200 rounded-card p-4 bg-white shadow-sm">
              <p className="text-xs text-gray-500">Credit balance</p>
              <p className="text-2xl font-semibold text-gray-900">{stats?.creditBalance ?? '—'}</p>
            </div>
          </section>

          <section className="border border-gray-200 rounded-card p-4 bg-white shadow-sm mb-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Account ID</h2>
            <p className="text-xs text-gray-500 mb-2">
              Your stable ClinicPlus account identifier — useful for support requests. Read-only.
            </p>
            <p className="font-mono text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-input px-3 py-1.5 inline-block">
              {userId || '—'}
            </p>
          </section>

          <section className="border border-gray-200 rounded-card p-4 bg-white shadow-sm mb-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Account details</h2>
            <p className="text-xs text-gray-500 mb-4">
              These are your real ClinicPlus account details (production.users), not
              Companion-only settings.{' '}
              {saveCreditCost !== null
                ? `Saving a change costs ${saveCreditCost} credit${saveCreditCost === 1 ? '' : 's'}.`
                : ''}
            </p>
            <p className="text-xs text-gray-500 mb-4">{dashboardPages.profile.helpers.security}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">First name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Surname</label>
                <Input value={surname} onChange={(e) => setSurname(e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Contact number</label>
                <Input
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            {saveError && <p className="text-sm text-red-600 mb-3">{saveError}</p>}

            <Button
              onClick={saveDetails}
              disabled={saving || !isDirty || !name.trim() || !surname.trim() || !email.trim()}
              variant="primary"
              className="text-sm px-4 py-2"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {saving
                ? 'Saving…'
                : saveCreditCost !== null
                  ? `Save changes (${saveCreditCost} credit${saveCreditCost === 1 ? '' : 's'})`
                  : 'Save changes'}
            </Button>
          </section>

          <section className="border border-gray-200 rounded-card p-4 bg-white shadow-sm mb-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Change password</h2>
            <p className="text-xs text-gray-500 mb-4">
              This is the same password used to log into www.clinicplusbooking.co.za.{' '}
              {passwordCreditCost !== null
                ? `Changing it costs ${passwordCreditCost} credit${passwordCreditCost === 1 ? '' : 's'}.`
                : ''}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Current password</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">New password</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Confirm new password</label>
                <Input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-xs text-gray-500 mb-3">Password must be at least 8 characters.</p>
            )}
            {newPassword.length > 0 && confirmNewPassword.length > 0 && newPassword !== confirmNewPassword && (
              <p className="text-xs text-red-600 mb-3">New passwords don&apos;t match.</p>
            )}
            {passwordError && <p className="text-sm text-red-600 mb-3">{passwordError}</p>}
            {passwordSuccess && <p className="text-sm text-green-600 mb-3">Password changed.</p>}

            <Button
              onClick={savePassword}
              disabled={passwordSaving || !passwordsValid}
              variant="primary"
              className="text-sm px-4 py-2"
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              {passwordSaving
                ? 'Saving…'
                : passwordCreditCost !== null
                  ? `Change password (${passwordCreditCost} credit${passwordCreditCost === 1 ? '' : 's'})`
                  : 'Change password'}
            </Button>
          </section>

          <section className="border border-red-200 rounded-card p-4 bg-red-50 shadow-sm">
            <h2 className="text-sm font-semibold text-red-900 mb-1">Danger zone</h2>

            {deletionSchedule ? (
              <>
                <p className="text-sm text-red-800 mb-4">
                  Your account is scheduled for deletion in{' '}
                  <strong>{daysUntil(deletionSchedule.scheduledFor)}</strong> day
                  {daysUntil(deletionSchedule.scheduledFor) === 1 ? '' : 's'}.
                </p>
                <Button
                  onClick={cancelDeleteRequest}
                  disabled={cancelSubmitting}
                  variant="secondary"
                  className="text-sm px-4 py-2"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {cancelSubmitting ? 'Cancelling…' : 'Cancel deletion'}
                </Button>
              </>
            ) : (
              <>
                <p className="text-xs text-red-700 mb-4 max-w-md leading-relaxed">
                  Permanently delete your ClinicPlus booking account. This is a Companion-only
                  convenience with no equivalent in ClinicPlus itself
                  {deleteCreditCost !== null
                    ? `, so it costs ${deleteCreditCost} credit${deleteCreditCost === 1 ? '' : 's'}.`
                    : '.'}
                </p>
                <Button
                  onClick={() => {
                    setDeleteError('');
                    setShowDeleteWarning(true);
                  }}
                  variant="secondary"
                  className="text-sm px-4 py-2 !border-red-300 !text-red-700 hover:!border-red-400"
                >
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  {deleteCreditCost !== null
                    ? `Delete ClinicPlus booking account (${deleteCreditCost} credit${deleteCreditCost === 1 ? '' : 's'})`
                    : 'Delete ClinicPlus booking account'}
                </Button>
              </>
            )}
          </section>
        </>
      )}

      {showDeleteWarning && (
        <div className="fixed inset-0 bg-gray-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white max-w-sm w-full rounded-card border border-gray-200 shadow-md p-6">
            <h2 className="font-semibold text-gray-900 mb-4">This deletes your real ClinicPlus account</h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              After 10 days, this permanently deletes your actual ClinicPlus booking account not just your access inside
              Companion. Once the 10 days pass, this cannot be undone and you will be logged out of
              ClinicPlus everywhere.
            </p>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              You can cancel any time before the 10 days are up by returning to this page.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteWarning(false);
                  setShowDeleteConfirm(true);
                }}
                className="inline-flex flex-1 items-center justify-center gap-1 bg-red-600 text-white rounded-input px-3 py-2 text-sm"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                I understand, continue
              </button>
              <button
                onClick={() => setShowDeleteWarning(false)}
                className="inline-flex items-center gap-1 border border-gray-300 rounded-input px-3 py-2 text-sm text-gray-700"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <TypedConfirmModal
          title="Confirm account deletion"
          description="This schedules your ClinicPlus booking account for permanent deletion in 10 days. You can cancel any time before then from this page."
          confirmText="DELETE"
          confirmButtonLabel="Schedule deletion"
          onConfirm={submitDeleteRequest}
          onCancel={() => setShowDeleteConfirm(false)}
          confirming={deleteSubmitting}
          error={deleteError}
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
