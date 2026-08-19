'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarCheck, FileText, UserPlus } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import { CLINIC_LOCATIONS, MEDICAL_SERVICES, DOVER_PRICE, XRAYS_PRICE } from '@/lib/clinicplus-constants';
import { calculateBookingPrice } from '@/lib/pricing';
import { buildNdaText } from '@/lib/nda';
import type { RosterEmployee, RosterEmployeeSite, EmployeeGroup, Company } from '@/lib/types';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import BookingStatus from '@/components/BookingStatus';
import CompanySelect from '@/components/CompanySelect';
import ServiceSelector from '@/components/ServiceSelector';
import JobSpecChooser from '@/components/JobSpecChooser';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import EmployeeSelectionModal from '@/components/EmployeeSelectionModal';
import { useChargedAction } from '@/lib/useChargedAction';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';
import dashboardPages from '../../../config/dashboard-pages.json';
import referenceFormsConfig from '../../../config/reference-forms.json';

// Same reference documents linked from cp-redesign's "Forms" card
// (create/index.js:618-678) — hosted on cp-redesign's own domain, not duplicated here. List and
// base URL live in config/reference-forms.json so adding/renaming a form is a data edit.
const REFERENCE_FORMS = referenceFormsConfig.forms;
const REFERENCE_FORMS_BASE_URL = referenceFormsConfig.baseUrl;

interface SelectedEmployee {
  rosterId: string;
  name: string;
  idNumber: string;
  occupation: string;
  serviceIds: string[];
  dover: boolean;
  xray: boolean;
  sites: RosterEmployeeSite[];
  // What this appointment will actually submit for this employee.
  jobSpecFile: string;
  extraJobSpecFiles: string[];
  // What's saved on the roster record — the reuse-or-upload chooser's "existing" option.
  existingJobSpecFile?: string;
  existingExtraJobSpecFiles?: string[];
}

export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookPageContent />
    </Suspense>
  );
}

function BookPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // getSession() reads localStorage synchronously; the lazy initializer runs once on mount and
  // is null during SSR (matching the unauthenticated-redirect branch below), so this doesn't
  // need to live in an effect.
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [companyId, setCompanyId] = useState(() => session?.companies[0]?.id ?? '');
  const [companies, setCompanies] = useState(() => session?.companies ?? []);
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [fullCompanies, setFullCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState<Record<string, SelectedEmployee>>({});
  // Preserves the order employees were added in, since `selected` is keyed by id (unordered).
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showEmployeeSelector, setShowEmployeeSelector] = useState(false);
  const [clinic, setClinic] = useState<string>(CLINIC_LOCATIONS[0]);
  const [date, setDate] = useState('');
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [companyNameOnMedical, setCompanyNameOnMedical] = useState('');
  const [companyResponsibleForPayment, setCompanyResponsibleForPayment] = useState('');
  const [ndaAccepted, setNdaAccepted] = useState(false);
  const [ndaPdfUrl, setNdaPdfUrl] = useState('');
  const [showNda, setShowNda] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resultId, setResultId] = useState('');
  const [bulkApplyServiceIds, setBulkApplyServiceIds] = useState<string[]>([]);

  const loadGroups = useCallback(async (uid: string) => {
    const res = await fetch(`/api/employee-groups?userId=${encodeURIComponent(uid)}`);
    setGroups(await res.json());
  }, []);

  const loadFullCompanies = useCallback(async (uid: string) => {
    const res = await fetch(`/api/companies?userId=${encodeURIComponent(uid)}`);
    setFullCompanies(await res.json());
  }, []);

  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  useEffect(() => {
    // Groups are a small, bounded list (unlike the roster) — safe to load in full once session
    // resolves, used only for the group-service-prefill lookup and the selection modal's filter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) loadGroups(session.id);
  }, [session, loadGroups]);

  useEffect(() => {
    // Small, bounded list — live from production.companies, used for the employee-selection
    // modal's company filter and the "Company name on medical"/"Company responsible for
    // payment" pickers below. Unlike `companies` (session.companies, cached at login time and
    // never refreshed), this reflects every company the user currently manages/can edit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) loadFullCompanies(session.id);
  }, [session, loadFullCompanies]);

  // CompanySelect expects the flat { id, name } shape (matches session.companies' shape); Company
  // from production.companies nests the name under details.name.
  const companySelectOptions = useMemo(
    () => fullCompanies.map((c) => ({ id: c.id, name: c.details.name })),
    [fullCompanies]
  );

  const toEmployeeEntry = (emp: RosterEmployee, groupId?: string): SelectedEmployee => {
    const matchedGroup = groupId ? groups.find((g) => g._id === groupId) : null;
    const serviceIds = emp.defaultServices || [];
    return {
      rosterId: emp._id!,
      name: emp.name,
      idNumber: emp.idNumber,
      occupation: emp.occupation,
      // Part F.3 — pre-fill services from the group's defaultServiceIds when the employee has
      // that group, instead of the user having to re-apply services after adding.
      serviceIds: matchedGroup?.defaultServiceIds?.length
        ? [...new Set([...serviceIds, ...matchedGroup.defaultServiceIds])]
        : serviceIds,
      dover: false,
      xray: false,
      sites: emp.defaultSites || [],
      jobSpecFile: emp.jobSpecFile || '',
      extraJobSpecFiles: emp.extraJobSpecFiles || [],
      existingJobSpecFile: emp.jobSpecFile,
      existingExtraJobSpecFiles: emp.extraJobSpecFiles,
    };
  };

  const addEmployeesFromModal = (employees: RosterEmployee[]) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const emp of employees) {
        if (!next[emp._id!]) {
          next[emp._id!] = toEmployeeEntry(emp);
        }
      }
      return next;
    });
    setSelectedOrder((prev) => [
      ...prev,
      ...employees.map((e) => e._id!).filter((id) => !prev.includes(id)),
    ]);
    setShowEmployeeSelector(false);
  };

  useEffect(() => {
    const duplicateFrom = searchParams.get('duplicateFrom');
    if (!session || !duplicateFrom) return;

    (async () => {
      const draftRes = await fetch(
        `/api/appointments/${encodeURIComponent(duplicateFrom)}/duplicate?userId=${encodeURIComponent(session.id)}`
      );
      if (!draftRes.ok) return;
      const draft = await draftRes.json();

      setClinic(draft.clinic || CLINIC_LOCATIONS[0]);
      if (draft.company?.id) setCompanyId(draft.company.id);

      // Match each duplicated employee back to the current roster by idNumber (the natural key
      // used everywhere else) so the draft reflects up-to-date roster data — an employee no
      // longer on the roster is simply skipped, not fabricated.
      const idNumbers = (draft.employees || []).map((e: { idNumber: string }) => e.idNumber).filter(Boolean);
      if (idNumbers.length === 0) return;
      const rosterRes = await fetch(`/api/employees?userId=${encodeURIComponent(session.id)}`);
      const rosterEmployees: RosterEmployee[] = await rosterRes.json();
      const matched = rosterEmployees.filter((e) => idNumbers.includes(e.idNumber));
      if (matched.length > 0) addEmployeesFromModal(matched);
    })();
    // Only ever run once per duplicateFrom param — not on every session/addEmployeesFromModal
    // identity change, which would re-add the same employees repeatedly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, searchParams]);

  const removeSelectedEmployee = (rosterId: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      delete next[rosterId];
      return next;
    });
    setSelectedOrder((prev) => prev.filter((id) => id !== rosterId));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(rosterId);
      return next;
    });
  };

  const toggleExpanded = (rosterId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rosterId)) next.delete(rosterId);
      else next.add(rosterId);
      return next;
    });
  };

  const updateSelectedEmployee = (rosterId: string, patch: Partial<SelectedEmployee>) => {
    setSelected((prev) => ({ ...prev, [rosterId]: { ...prev[rosterId], ...patch } }));
  };

  const clearEmployeeServices = (rosterId: string) => {
    updateSelectedEmployee(rosterId, { serviceIds: [] });
  };

  const clearAllEmployeeServices = () => {
    setSelected((prev) => {
      const next: Record<string, SelectedEmployee> = {};
      for (const [id, emp] of Object.entries(prev)) {
        next[id] = { ...emp, serviceIds: [] };
      }
      return next;
    });
  };

  const saveJobSpecToRoster = async (
    rosterId: string,
    patch: { jobSpecFile?: string; extraJobSpecFiles?: string[] }
  ) => {
    await fetch('/api/employees', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _id: rosterId, ...patch }),
    });
  };

  const toggleFlag = (rosterId: string, key: 'dover' | 'xray') => {
    setSelected((prev) => ({
      ...prev,
      [rosterId]: { ...prev[rosterId], [key]: !prev[rosterId][key] },
    }));
  };

  // selectedOrder is the source of truth for display order; selectedList derives from it so
  // employees appear in the order they were added rather than object-key order.
  const selectedList = useMemo(
    () => selectedOrder.map((id) => selected[id]).filter(Boolean),
    [selectedOrder, selected]
  );

  // Fix for "apply a service selection to all N selected employees": toggling a service here
  // must only add/remove that one service across every employee, leaving every other
  // already-selected service on each employee untouched — it must never replace or reset an
  // employee's full services[] with the selector's contents. Detected by diffing the selector's
  // previous vs. new state to find the single service that changed.
  const applyServiceToggleToAllSelected = (nextSelectorIds: string[]) => {
    const added = nextSelectorIds.filter((id) => !bulkApplyServiceIds.includes(id));
    const removed = bulkApplyServiceIds.filter((id) => !nextSelectorIds.includes(id));
    const toggledServiceId = added[0] ?? removed[0];
    const isAdding = added.length > 0;

    setBulkApplyServiceIds(nextSelectorIds);

    if (!toggledServiceId) return;

    setSelected((prev) => {
      const next: Record<string, SelectedEmployee> = {};
      for (const [id, emp] of Object.entries(prev)) {
        const hasService = emp.serviceIds.includes(toggledServiceId);
        if (isAdding && !hasService) {
          next[id] = { ...emp, serviceIds: [...emp.serviceIds, toggledServiceId] };
        } else if (!isAdding && hasService) {
          next[id] = { ...emp, serviceIds: emp.serviceIds.filter((s) => s !== toggledServiceId) };
        } else {
          next[id] = emp;
        }
      }
      return next;
    });
  };

  // "Clear all services in the selector" — resets which services are currently active in the
  // bulk-apply selector's own UI state, without touching anything already applied to any
  // employee. Distinct from clearAllEmployeeServices below.
  const clearBulkServiceSelector = () => {
    setBulkApplyServiceIds([]);
  };

  const employeesForPricing = useMemo(
    () =>
      selectedList.map((s) => ({
        id: s.rosterId,
        name: s.name,
        idNumber: s.idNumber,
        comments: [],
        occupation: s.occupation,
        // { id, price } only — matches cp-redesign's services.js, which stores
        // omit(['info', 'title'], selectedItem).
        services: s.serviceIds.map((id) => ({
          id,
          price: MEDICAL_SERVICES[id]?.price ?? 0,
        })),
        sites: s.sites,
        isMinimized: true,
        dover: { required: s.dover },
        xray: { required: s.xray },
        jobSpecFile: s.jobSpecFile,
        extraJobSpecFiles: s.extraJobSpecFiles,
      })),
    [selectedList]
  );

  const price = useMemo(() => calculateBookingPrice(employeesForPricing), [employeesForPricing]);

  const missingJobSpecCount = selectedList.filter((s) => !s.jobSpecFile).length;

  const doGenerateAndUploadNda = async () => {
    if (!session) return;
    setStatus('Generating NDA PDF…');
    const company = companies.find((c) => c.id === companyId);
    const ndaText = buildNdaText({
      userName: session.name,
      userSurname: session.surname,
      companyName: company?.name || '',
      userEmail: session.email,
    });

    const [{ default: jsPDF }] = await Promise.all([import('jspdf')]);
    const doc = new jsPDF('p', 'pt', 'a4');
    const lines = doc.splitTextToSize(ndaText, 480);
    doc.text(lines, 40, 60);
    const blob = doc.output('blob');

    setStatus('Uploading NDA…');
    const formData = new FormData();
    const fileName = `nda-${company?.name || 'company-unknown'}-${Date.now()}.pdf`;
    formData.append('file', blob, fileName);

    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    setNdaPdfUrl(data.publicUrl);
    setNdaAccepted(true);
    setStatus('');
    setShowNda(false);
  };

  const generateAndUploadNda = () => {
    requestAction('nda.generateUpload', 'Generate + upload NDA', doGenerateAndUploadNda);
  };

  const doCreateAppointment = async () => {
    if (!session) return;
    setSubmitting(true);
    try {
      const company = companies.find((c) => c.id === companyId);
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          companyName: company?.name,
          clinic,
          date,
          purchaseOrderNumber: purchaseOrderNumber || null,
          companyNameOnMedical: companyNameOnMedical || undefined,
          companyResponsibleForPayment: companyResponsibleForPayment || undefined,
          employees: employeesForPricing,
          ndaPdf: ndaPdfUrl,
          userId: session.id,
          userName: `${session.name} ${session.surname}`,
          rosterEmployeeIds: selectedList.map((s) => s.rosterId),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create appointment');
        return;
      }
      setResultId(data.id);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    if (!session) return;
    setError('');
    if (!ndaAccepted || !ndaPdfUrl) {
      setError('You must accept the NDA before submitting.');
      return;
    }
    if (selectedList.length === 0) {
      setError('Select at least one employee.');
      return;
    }
    if (!date) {
      setError('Select a date.');
      return;
    }
    // Part F.7 — every employee must have a job spec file attached before an appointment can be
    // created, the same way the NDA gate already blocks submission.
    if (missingJobSpecCount > 0) {
      setError(
        `${missingJobSpecCount} employee(s) are missing a job spec file. Every employee needs one attached before this appointment can be created.`
      );
      return;
    }

    // Client-side pre-check mirroring cp-redesign's saveAppointment() — the server in
    // /api/appointments enforces this too and is the authoritative check, but failing fast here
    // avoids a pointless round trip once the user can already see they're over the limit.
    try {
      const statusRes = await fetch(
        `/api/booking-status?clinic=${encodeURIComponent(clinic)}&date=${encodeURIComponent(date)}`
      );
      const statusData = await statusRes.json();
      if (statusData.currentBookings + selectedList.length > statusData.limit) {
        setError(
          `Cannot create appointment. The clinic limit for ${clinic} on ${date} is ${statusData.limit} employees. Currently booked: ${statusData.currentBookings}, attempting to add: ${selectedList.length}.`
        );
        return;
      }
    } catch {
      // If the pre-check itself fails, fall through to the server, which enforces the same
      // rule authoritatively.
    }

    // Part E — confirm-before-spending. The server in /api/appointments performs the actual
    // authoritative charge (atomic with the write); this just shows the plain cost/balance
    // confirmation first, then hands off to doCreateAppointment without charging separately.
    requestAction('appointment.create', 'Create appointment', doCreateAppointment, {
      chargeSeparately: true,
    });
  };

  if (!session) return null;

  if (resultId) {
    return (
      <main className="flex-1 p-6 max-w-2xl mx-auto w-full bg-background">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Appointment created</h1>
        <p className="text-sm text-gray-600">
          Appointment <span className="font-mono">{resultId}</span> was created with status{' '}
          <span className="font-medium">pending</span>. Payment confirmation happens offline via
          ClinicPlus admin, same as any appointment created directly in ClinicPlus.
        </p>
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 max-w-3xl mx-auto w-full bg-background">
      <NavBar session={session} />
      <PageIntro
        title={dashboardPages.book.title}
        description={dashboardPages.book.description}
        icon={CalendarCheck}
      />

      {companies.length > 1 && (
        <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mb-6">
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}

      <div className="border border-gray-200 rounded-card p-3 mb-6 bg-white shadow-sm">
        <p className="text-xs font-medium text-gray-900 mb-2">Reference forms</p>
        <p className="text-xs text-gray-500 mb-2">{dashboardPages.book.helpers.referenceForms}</p>
        <ul className="text-xs flex flex-col gap-1">
          {REFERENCE_FORMS.map((f) => (
            <li key={f.file}>
              <a
                href={`${REFERENCE_FORMS_BASE_URL}${encodeURIComponent(f.file)}`}
                target="_blank"
                rel="noreferrer"
                className="text-gray-600 hover:text-red-500 transition-colors underline"
              >
                {f.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-gray-500 mb-2">{dashboardPages.book.helpers.schedule}</p>
      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Clinic</label>
          <Select value={clinic} onChange={(e) => setClinic(e.target.value)}>
            {CLINIC_LOCATIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="mb-6">
        <BookingStatus clinic={clinic} date={date} employeeCount={selectedList.length} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Purchase order number</label>
          <Input
            value={purchaseOrderNumber}
            onChange={(e) => setPurchaseOrderNumber(e.target.value)}
            className="w-full"
          />
        </div>
        <CompanySelect
          label="Company name on medical"
          companies={companySelectOptions}
          value={companyNameOnMedical}
          onChange={setCompanyNameOnMedical}
          userId={session.id}
          userName={`${session.name} ${session.surname}`}
          onCompanyCreated={(c) => {
            setCompanies((prev) => [...prev, c]);
            loadFullCompanies(session.id);
          }}
        />
        <CompanySelect
          label="Company responsible for payment"
          companies={companySelectOptions}
          value={companyResponsibleForPayment}
          onChange={setCompanyResponsibleForPayment}
          userId={session.id}
          userName={`${session.name} ${session.surname}`}
          onCompanyCreated={(c) => {
            setCompanies((prev) => [...prev, c]);
            loadFullCompanies(session.id);
          }}
        />
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Employees on this appointment ({selectedList.length})
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">
            {dashboardPages.book.helpers.employees}
          </p>
        </div>
        <Button onClick={() => setShowEmployeeSelector(true)} variant="primary" className="text-xs px-3 py-1.5">
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Add employees
        </Button>
      </div>

      {selectedList.length > 0 && (
        <div className="border border-gold-300/50 rounded-card p-3 mb-3 bg-gold-50/30 shadow-sm">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <p className="text-xs font-medium text-gray-900">
              <FileText className="inline-block h-3.5 w-3.5 mr-1 text-red-500" aria-hidden="true" />
              Apply a service to all {selectedList.length} selected employees
            </p>
            <div className="flex gap-3 text-xs">
              <button onClick={clearBulkServiceSelector} className="text-gray-500 hover:text-gray-700 transition-colors">
                Clear selector
              </button>
              <button onClick={clearAllEmployeeServices} className="text-red-600 hover:text-red-700 transition-colors">
                Clear all employees&apos; services
              </button>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mb-2">
            Checking a service here adds it to every employee below; unchecking removes it from
            every employee — every other service each employee already has stays untouched.
          </p>
          <ServiceSelector
            selectedIds={bulkApplyServiceIds}
            onChange={applyServiceToggleToAllSelected}
            subtotalLabel="Price if applied to one employee"
          />
        </div>
      )}

      <ul className="border border-gray-200 rounded-card divide-y divide-gray-200 mb-6 overflow-hidden">
        {selectedList.map((sel) => {
          const isExpanded = expandedIds.has(sel.rosterId);
          return (
            <li key={sel.rosterId} className="px-3 py-2 bg-white">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleExpanded(sel.rosterId)}
                  className="text-xs text-gray-400 w-4 transition-transform duration-150 motion-reduce:transition-none"
                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  ▸
                </button>
                <button
                  onClick={() => toggleExpanded(sel.rosterId)}
                  className="flex-1 text-left text-sm"
                >
                  <span className="font-medium text-gray-900">{sel.name}</span>{' '}
                  <span className="text-gray-500">{sel.occupation}</span>
                  {!sel.jobSpecFile && (
                    <span className="ml-2 text-[10px] text-red-700 bg-red-50 rounded-pill px-1.5 py-0.5">
                      Job spec file required
                    </span>
                  )}
                </button>
                <span className="text-xs text-gray-500">{sel.serviceIds.length} service(s)</span>
                <button
                  onClick={() => removeSelectedEmployee(sel.rosterId)}
                  className="text-red-600 text-xs hover:text-red-700 transition-colors"
                >
                  Remove
                </button>
              </div>
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 ml-6 flex flex-col gap-3 pb-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-900">Services</span>
                        <button
                          onClick={() => clearEmployeeServices(sel.rosterId)}
                          className="text-xs text-red-600 hover:text-red-700 transition-colors"
                        >
                          Clear this employee&apos;s services
                        </button>
                      </div>
                      <ServiceSelector
                        selectedIds={sel.serviceIds}
                        onChange={(ids) => updateSelectedEmployee(sel.rosterId, { serviceIds: ids })}
                        subtotalLabel="Subtotal for this employee"
                      />
                      <div className="flex gap-4 text-xs">
                        <label className="flex items-center gap-1 text-gray-700">
                          <input
                            type="checkbox"
                            checked={sel.dover}
                            onChange={() => toggleFlag(sel.rosterId, 'dover')}
                            className="accent-red-500"
                          />
                          Dover (R{DOVER_PRICE.toFixed(2)})
                        </label>
                        <label className="flex items-center gap-1 text-gray-700">
                          <input
                            type="checkbox"
                            checked={sel.xray}
                            onChange={() => toggleFlag(sel.rosterId, 'xray')}
                            className="accent-red-500"
                          />
                          X-ray (R{XRAYS_PRICE.toFixed(2)})
                        </label>
                      </div>
                      <JobSpecChooser
                        userId={session.id}
                        rosterEmployeeId={sel.rosterId}
                        existingJobSpecFile={sel.existingJobSpecFile}
                        existingExtraJobSpecFiles={sel.existingExtraJobSpecFiles}
                        jobSpecFile={sel.jobSpecFile}
                        extraJobSpecFiles={sel.extraJobSpecFiles}
                        onChange={(next) => updateSelectedEmployee(sel.rosterId, next)}
                        onSaveToRoster={(patch) => saveJobSpecToRoster(sel.rosterId, patch)}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
        {selectedList.length === 0 && (
          <li className="px-3 py-4 text-sm text-gray-500">
            No employees added yet — click &quot;Add employees&quot; to select from your roster.
          </li>
        )}
      </ul>

      {showEmployeeSelector && session && (
        <EmployeeSelectionModal
          userId={session.id}
          groups={groups}
          companies={fullCompanies}
          alreadyAddedIds={new Set(selectedOrder)}
          onClose={() => setShowEmployeeSelector(false)}
          onConfirm={addEmployeesFromModal}
        />
      )}

      <div className="flex items-center justify-between border border-gray-200 rounded-card px-3 py-2 mb-6 bg-white shadow-sm">
        <span className="text-sm text-gray-600">Total price</span>
        <span className="font-semibold text-gray-900">R{price.toFixed(2)}</span>
      </div>

      <div className="mb-6">
        {!ndaAccepted ? (
          <Button onClick={() => setShowNda(true)} variant="secondary" className="text-sm px-3 py-2">
            Review &amp; accept NDA
          </Button>
        ) : (
          <p className="text-sm text-green-700">NDA accepted.</p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <Button onClick={submit} disabled={submitting} variant="primary" className="px-4 py-2">
        {submitting ? 'Creating…' : 'Create appointment'}
      </Button>

      {showNda && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white max-w-xl w-full rounded-card shadow-md border border-gray-200 p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="font-semibold text-gray-900 mb-4">Non-Disclosure Agreement</h2>
            <p className="text-sm text-gray-700 whitespace-pre-line mb-6">
              {buildNdaText({
                userName: session.name,
                userSurname: session.surname,
                companyName: companies.find((c) => c.id === companyId)?.name || '',
                userEmail: session.email,
              })}
            </p>
            {status && <p className="text-sm text-gray-500 mb-3">{status}</p>}
            <div className="flex gap-3">
              <Button onClick={generateAndUploadNda} variant="primary" className="px-3 py-2">
                I accept
              </Button>
              <Button onClick={() => setShowNda(false)} variant="secondary" className="px-3 py-2">
                Cancel
              </Button>
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
