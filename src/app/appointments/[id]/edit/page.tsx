'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarCog, Eye, FileText, Save, Trash2, UserPlus, X } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import { CLINIC_LOCATIONS, MEDICAL_SERVICES } from '@/lib/clinicplus-constants';
import type { AppointmentDocument, RosterEmployee, EmployeeGroup } from '@/lib/types';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import LoadingState from '@/components/LoadingState';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import EmployeeSelectionModal from '@/components/EmployeeSelectionModal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useChargedAction } from '@/lib/useChargedAction';
import dashboardPages from '../../../../../config/dashboard-pages.json';

/**
 * Edit an existing appointment's non-employee-identity fields. Visually/structurally mirrors
 * /book (the creation page) per the prompt, with two deliberate differences: it edits an existing
 * production document instead of building a new one, and employee handling is restricted — no
 * in-place editing of an employee already on the appointment (view or remove only); adding a new
 * employee only ever goes through the roster search/select modal, exactly like creation.
 *
 * status, payment.hasBeenPaid, and payment.proofOfPayment are never editable here by design.
 */
export default function EditAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [appointment, setAppointment] = useState<AppointmentDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);

  const [clinic, setClinic] = useState('');
  const [date, setDate] = useState('');
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [companyNameOnMedical, setCompanyNameOnMedical] = useState('');
  const [companyResponsibleForPayment, setCompanyResponsibleForPayment] = useState('');

  const [showEmployeeSelector, setShowEmployeeSelector] = useState(false);
  const [viewingEmployeeId, setViewingEmployeeId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (uid: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/appointments/${id}?userId=${encodeURIComponent(uid)}`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data: AppointmentDocument = await res.json();
        setAppointment(data);
        setClinic(data.details.clinic);
        setDate(data.details.date);
        setPurchaseOrderNumber(data.details.purchaseOrderNumber || '');
        setCompanyNameOnMedical(data.details.companyNameOnMedical || '');
        setCompanyResponsibleForPayment(data.details.companyResponsibleForPayment || '');
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) load(session.id);
  }, [session, load]);

  useEffect(() => {
    if (!session) return;
    fetch(`/api/employee-groups?userId=${encodeURIComponent(session.id)}`)
      .then((r) => r.json())
      .then(setGroups);
  }, [session]);

  const detailsChanged =
    appointment &&
    (clinic !== appointment.details.clinic ||
      date !== appointment.details.date ||
      purchaseOrderNumber !== (appointment.details.purchaseOrderNumber || '') ||
      companyNameOnMedical !== (appointment.details.companyNameOnMedical || '') ||
      companyResponsibleForPayment !== (appointment.details.companyResponsibleForPayment || ''));

  const saveDetails = () => {
    if (!session) return;
    requestAction(
      'appointment.editDetails',
      'Save appointment details',
      async () => {
        setSaving(true);
        setError('');
        try {
          const res = await fetch(`/api/appointments/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: session.id,
              date,
              clinic,
              purchaseOrderNumber: purchaseOrderNumber || null,
              companyNameOnMedical,
              companyResponsibleForPayment,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || 'Failed to save appointment details');
            return;
          }
          await load(session.id);
        } finally {
          setSaving(false);
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
        setViewingEmployeeId(null);
        load(session.id);
      },
      { chargeSeparately: true }
    );
  };

  // Adding a new employee is the one way to change who's on the appointment — always via the
  // roster search/select modal, pre-filled exactly like creation, never free-typed inline and
  // never editing someone already present.
  const addEmployeesFromModal = async (employees: RosterEmployee[]) => {
    if (!session || employees.length === 0) return;
    setShowEmployeeSelector(false);

    for (const emp of employees) {
      requestAction(
        'appointment.addEmployee',
        `Add ${emp.name} to this appointment`,
        async () => {
          setError('');
          const newEmployee = {
            id: emp._id!,
            name: emp.name,
            idNumber: emp.idNumber,
            comments: [],
            occupation: emp.occupation,
            services: (emp.defaultServices || []).map((sid) => ({
              id: sid,
              price: MEDICAL_SERVICES[sid]?.price ?? 0,
            })),
            sites: emp.defaultSites || [],
            isMinimized: true,
            dover: { required: false },
            xray: { required: false },
            jobSpecFile: emp.jobSpecFile || '',
            extraJobSpecFiles: emp.extraJobSpecFiles || [],
          };
          const res = await fetch(`/api/appointments/${id}/employees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: session.id, employee: newEmployee }),
          });
          if (!res.ok) {
            const data = await res.json();
            setError(data.error || `Failed to add ${emp.name}`);
            return;
          }
          await load(session.id);
        },
        { chargeSeparately: true }
      );
    }
  };

  if (!session) return null;

  if (notFound) {
    return (
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full bg-background">
        <NavBar session={session} />
        <PageIntro
          title={dashboardPages.appointmentEdit.title}
          description={dashboardPages.appointmentEdit.description}
          icon={CalendarCog}
        />
        <p className="text-sm text-gray-500">
          Appointment not found, or you don&apos;t have access to it.
        </p>
      </main>
    );
  }

  const viewingEmployee = appointment?.details.employees.find((e) => e.id === viewingEmployeeId);
  const alreadyAddedIds = new Set(appointment?.details.employees.map((e) => e.id) || []);

  return (
    <main className="flex-1 p-6 max-w-3xl mx-auto w-full bg-background">
      <NavBar session={session} />
      <PageIntro
        title={appointment ? `Edit ${appointment.id}` : dashboardPages.appointmentEdit.title}
        description={dashboardPages.appointmentEdit.description}
        icon={CalendarCog}
      />

      <Link href={`/appointments/${id}`} className="text-sm text-red-500 hover:text-red-600 transition-colors mb-6 inline-block">
        ← Back to appointment
      </Link>

      {loading && <LoadingState label="Loading appointment editor..." className="mb-4" />}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!loading && appointment && (
        <div className="flex flex-col gap-6">
          <section className="border border-gray-200 rounded-card p-4 bg-white shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Details</h2>
            <p className="text-xs text-gray-500 mb-3">
              {dashboardPages.appointmentEdit.helpers.details}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Clinic</label>
                <Select value={clinic} onChange={(e) => setClinic(e.target.value)} className="w-full">
                  {CLINIC_LOCATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Purchase order number</label>
                <Input value={purchaseOrderNumber} onChange={(e) => setPurchaseOrderNumber(e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Company name on medical</label>
                <Input value={companyNameOnMedical} onChange={(e) => setCompanyNameOnMedical(e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Company responsible for payment</label>
                <Input value={companyResponsibleForPayment} onChange={(e) => setCompanyResponsibleForPayment(e.target.value)} className="w-full" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              {dashboardPages.appointmentEdit.helpers.details}
            </p>
            <Button onClick={saveDetails} disabled={saving || !detailsChanged} variant="primary" className="text-sm px-4 py-2">
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? 'Saving…' : 'Save details'}
            </Button>
          </section>

          <section className="border border-gray-200 rounded-card p-4 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Employees ({appointment.details.employees.length}) · Total: R{(appointment.payment?.amount ?? 0).toFixed(2)}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {dashboardPages.appointmentEdit.helpers.employees}
                </p>
              </div>
              <Button onClick={() => setShowEmployeeSelector(true)} variant="primary" className="text-xs px-3 py-1.5">
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                Add employee from roster
              </Button>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              {dashboardPages.appointmentEdit.helpers.employees}
            </p>
            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card">
              {appointment.details.employees.map((emp) => (
                <li key={emp.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <button
                    onClick={() => setViewingEmployeeId(emp.id)}
                    className="text-left flex-1"
                  >
                    <span className="font-medium text-gray-900">{emp.name}</span>{' '}
                    <span className="text-gray-500">{emp.idNumber} · {emp.occupation}</span>
                  </button>
                  <div className="flex gap-3 items-center">
                    <button onClick={() => setViewingEmployeeId(emp.id)} className="inline-flex items-center gap-1 text-gray-500 text-xs hover:text-gray-700 transition-colors">
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      View
                    </button>
                    <button
                      onClick={() => removeEmployee(emp.id, emp.name)}
                      className="inline-flex items-center gap-1 text-red-600 text-xs hover:text-red-700 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                </li>
              ))}
              {appointment.details.employees.length === 0 && (
                <li className="px-3 py-4 text-sm text-gray-500">No employees on this appointment.</li>
              )}
            </ul>
          </section>
        </div>
      )}

      {showEmployeeSelector && session && (
        <EmployeeSelectionModal
          userId={session.id}
          groups={groups}
          alreadyAddedIds={alreadyAddedIds}
          onClose={() => setShowEmployeeSelector(false)}
          onConfirm={addEmployeesFromModal}
        />
      )}

      {viewingEmployee && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
          <div className="bg-white max-w-md w-full rounded-card shadow-md border border-gray-200 p-6 max-h-[85vh] overflow-y-auto">
            <h2 className="font-semibold text-gray-900 mb-3">{viewingEmployee.name}</h2>
            <dl className="text-sm mb-4 flex flex-col gap-1">
              <div className="flex justify-between">
                <dt className="text-gray-500">ID/Passport</dt>
                <dd className="text-gray-900">{viewingEmployee.idNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Occupation</dt>
                <dd className="text-gray-900">{viewingEmployee.occupation}</dd>
              </div>
            </dl>
            <p className="text-xs font-medium text-gray-900 mb-1">Services</p>
            <ul className="text-xs text-gray-700 flex flex-col gap-0.5 mb-4">
              {viewingEmployee.services.map((s) => (
                <li key={s.id} className="flex justify-between">
                  <span>{MEDICAL_SERVICES[s.id]?.title || s.id}</span>
                  <span>R{s.price.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            {viewingEmployee.jobSpecFile && (
              <a href={viewingEmployee.jobSpecFile} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-red-500 hover:text-red-600 transition-colors underline text-xs mb-4">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                View job spec file
              </a>
            )}
            <p className="text-xs text-gray-400 mb-4">
              This employee&apos;s details cannot be edited in place — remove and re-add from the
              roster instead if something needs to change.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => removeEmployee(viewingEmployee.id, viewingEmployee.name)}
                className="text-red-600 text-sm hover:text-red-700 transition-colors"
              >
                <Trash2 className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Remove from appointment
              </button>
              <button onClick={() => setViewingEmployeeId(null)} className="border border-gray-300 rounded-input px-3 py-2 text-sm text-gray-700">
                <X className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Close
              </button>
            </div>
          </div>
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
    </main>
  );
}
