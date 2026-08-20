'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarDays,
  Copy,
  Edit3,
  Eye,
  FileDown,
  FileText,
  MessageSquarePlus,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import { MEDICAL_SERVICES } from '@/lib/clinicplus-constants';
import type { AppointmentDocument, AppointmentEmployee } from '@/lib/types';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import LoadingState from '@/components/LoadingState';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import DeleteAppointmentModal from '@/components/DeleteAppointmentModal';
import ImportFromAppointmentModal from '@/components/ImportFromAppointmentModal';
import AddAppointmentManagerModal from '@/components/AddAppointmentManagerModal';
import AppointmentMessages from '@/components/AppointmentMessages';
import { Button } from '@/components/ui/Button';
import { useChargedAction } from '@/lib/useChargedAction';
import dashboardPages from '../../../../config/dashboard-pages.json';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  declined: 'bg-red-50 text-red-700',
};

const LIFECYCLE_STATUS_STYLES: Record<string, string> = {
  expired: 'bg-gray-100 text-gray-500',
  approved: 'bg-green-50 text-green-700',
  completed: 'bg-blue-50 text-blue-700',
};

function employeePrice(employee: AppointmentEmployee): number {
  const servicesPrice = employee.services.reduce((sum, s) => sum + s.price, 0);
  return servicesPrice;
}

/**
 * Full breakdown of a single appointment — all details.* fields, per-employee/per-service price
 * breakdown, NDA acceptance + link to the stored PDF, and each employee's job spec file
 * view/download. Read-only at this level; editing happens on /appointments/[id]/edit and via the
 * per-action modals below (delete, import employees, add manager).
 */
export default function AppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [appointment, setAppointment] = useState<AppointmentDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAddManager, setShowAddManager] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/appointments/${id}?userId=${encodeURIComponent(uid)}`);
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      setAppointment(await res.json());
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) load(session.id);
  }, [session, load]);

  const doDelete = () => {
    if (!session) return;
    requestAction(
      'appointment.delete',
      `Delete appointment ${id}`,
      async () => {
        setDeleting(true);
        setError('');
        try {
          const res = await fetch(`/api/appointments/${id}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: session.id }),
          });
          if (!res.ok) {
            const data = await res.json();
            setError(data.error || 'Failed to delete appointment');
            return;
          }
          router.push('/appointments');
        } finally {
          setDeleting(false);
          setShowDeleteConfirm(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  const removeEmployee = (employeeId: string, employeeName: string) => {
    if (!session) return;
    requestAction(
      'appointment.removeEmployee',
      `Remove ${employeeName} from this appointment`,
      async () => {
        setError('');
        const res = await fetch(
          `/api/appointments/${id}/employees?userId=${encodeURIComponent(session.id)}&employeeId=${encodeURIComponent(employeeId)}`,
          { method: 'DELETE' }
        );
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to remove employee');
          return;
        }
        load(session.id);
      },
      { chargeSeparately: true }
    );
  };

  if (!session) return null;

  if (notFound) {
    return (
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full bg-background">
        <NavBar session={session} />
        <PageIntro
          title={dashboardPages.appointmentDetail.title}
          description={dashboardPages.appointmentDetail.description}
          icon={CalendarDays}
        />
        <p className="text-sm text-gray-500">
          Appointment not found, or you don&apos;t have access to it.
        </p>
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 max-w-3xl mx-auto w-full bg-background">
      <NavBar session={session} />
      <PageIntro
        title={appointment?.id ? `Appointment ${appointment.id}` : dashboardPages.appointmentDetail.title}
        description={dashboardPages.appointmentDetail.description}
        icon={CalendarDays}
      />

      <Link href="/appointments" className="text-sm text-red-500 hover:text-red-600 transition-colors mb-6 inline-block">
        ← Back to appointments
      </Link>

      {loading && <LoadingState label="Loading appointment..." className="mb-4" />}

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!loading && appointment && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-block rounded-pill px-3 py-1 text-sm font-medium ${STATUS_STYLES[appointment.status] || 'bg-gray-100 text-gray-700'}`}>
                {appointment.status}
              </span>
              {appointment.lifecycleStatus && (
                <span className={`inline-block rounded-pill px-3 py-1 text-sm font-medium ${LIFECYCLE_STATUS_STYLES[appointment.lifecycleStatus] || 'bg-gray-100 text-gray-700'}`}>
                  {appointment.lifecycleStatus}
                </span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link href={`/appointments/${id}/edit`}>
                <Button variant="secondary" className="text-xs px-3 py-1.5">
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit appointment
                </Button>
              </Link>
              <Link href={`/book?duplicateFrom=${id}`}>
                <Button variant="secondary" className="text-xs px-3 py-1.5">
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Duplicate this appointment
                </Button>
              </Link>
              <Button onClick={() => setShowImport(true)} variant="secondary" className="text-xs px-3 py-1.5">
                <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                Import employees to roster
              </Button>
              <Button onClick={() => setShowAddManager(true)} variant="secondary" className="text-xs px-3 py-1.5">
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                Add user to manage
              </Button>
              <Button onClick={() => setShowDeleteConfirm(true)} variant="secondary" className="text-xs px-3 py-1.5 text-red-600 border-red-300">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </Button>
            </div>
          </div>

          <section className="border border-gray-200 rounded-card p-4 bg-white shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Details</h2>
            <p className="text-xs text-gray-500 mb-3">
              {dashboardPages.appointmentDetail.helpers.details}
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Company</dt>
                <dd className="text-gray-900">{appointment.details.company.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Clinic</dt>
                <dd className="text-gray-900">{appointment.details.clinic}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Date</dt>
                <dd className="text-gray-900">{appointment.details.date}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Purchase order number</dt>
                <dd className="text-gray-900">{appointment.details.purchaseOrderNumber || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Company name on medical</dt>
                <dd className="text-gray-900">{appointment.details.companyNameOnMedical || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Company responsible for payment</dt>
                <dd className="text-gray-900">{appointment.details.companyResponsibleForPayment || '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="border border-gray-200 rounded-card p-4 bg-white shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Non-disclosure agreement</h2>
            <p className="text-sm text-gray-700 mb-2">
              {appointment.details.ndaAccepted ? 'NDA has been accepted.' : 'NDA has not been accepted.'}
            </p>
            {appointment.details.ndaPdf && (
              <a
                href={appointment.details.ndaPdf}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-red-500 hover:text-red-600 transition-colors underline text-sm"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                View stored NDA PDF
              </a>
            )}
          </section>

          <section className="border border-gray-200 rounded-card p-4 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Employees ({appointment.details.employees.length})
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {dashboardPages.appointmentDetail.helpers.employees}
                </p>
              </div>
              <span className="text-sm font-medium text-gray-900">
                Total: R{(appointment.payment?.amount ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {appointment.details.employees.map((emp) => (
                <div key={emp.id} className="border border-gray-200 rounded-card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">{emp.name}</span>
                    <button
                      onClick={() => removeEmployee(emp.id, emp.name)}
                      className="inline-flex items-center gap-1 text-red-600 text-xs hover:text-red-700 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    {emp.idNumber} · {emp.occupation}
                  </p>
                  <ul className="text-xs text-gray-700 flex flex-col gap-0.5 mb-2">
                    {emp.services.map((s) => (
                      <li key={s.id} className="flex justify-between">
                        <span>{MEDICAL_SERVICES[s.id]?.title || s.id}</span>
                        <span>R{s.price.toFixed(2)}</span>
                      </li>
                    ))}
                    {emp.dover?.required && (
                      <li className="flex justify-between">
                        <span>Dover service</span>
                        <span>included</span>
                      </li>
                    )}
                    {emp.xray?.required && (
                      <li className="flex justify-between">
                        <span>X-ray service</span>
                        <span>included</span>
                      </li>
                    )}
                    <li className="flex justify-between font-medium text-gray-900 pt-1 border-t border-gray-100">
                      <span>Subtotal</span>
                      <span>R{employeePrice(emp).toFixed(2)}</span>
                    </li>
                  </ul>
                  <div className="flex gap-3 text-xs">
                    {emp.jobSpecFile ? (
                      <a href={emp.jobSpecFile} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-red-500 hover:text-red-600 transition-colors underline">
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        View job spec file
                      </a>
                    ) : (
                      <span className="text-gray-400">No job spec file</span>
                    )}
                    {emp.extraJobSpecFiles && emp.extraJobSpecFiles.length > 0 && (
                      <span className="text-gray-500">
                        +{emp.extraJobSpecFiles.length} extra file(s)
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {appointment.details.employees.length === 0 && (
                <p className="text-sm text-gray-500">No employees on this appointment.</p>
              )}
            </div>
          </section>

          <section className="border border-gray-200 rounded-card p-4 bg-white shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">
              <MessageSquarePlus className="inline-block h-4 w-4 mr-1.5 text-red-500" aria-hidden="true" />
              Users who can manage this appointment
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              {dashboardPages.appointmentDetail.helpers.managers}
            </p>
            <ul className="divide-y divide-gray-200">
              {appointment.usersWhoCanManage.map((u) => (
                <li key={u.id} className="px-1 py-2 text-sm text-gray-900">
                  {u.name}
                </li>
              ))}
            </ul>
          </section>

          <AppointmentMessages appointmentId={id} session={session} />
        </div>
      )}

      {showDeleteConfirm && (
        <DeleteAppointmentModal
          appointmentId={id}
          onConfirm={doDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          deleting={deleting}
        />
      )}

      {showImport && session && (
        <ImportFromAppointmentModal
          userId={session.id}
          appointmentId={id}
          onClose={() => setShowImport(false)}
          onImported={() => setShowImport(false)}
        />
      )}

      {showAddManager && session && (
        <AddAppointmentManagerModal
          userId={session.id}
          appointmentId={id}
          onClose={() => setShowAddManager(false)}
          onAdded={() => {
            setShowAddManager(false);
            load(session.id);
          }}
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
