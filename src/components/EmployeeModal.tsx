'use client';

import { useEffect, useState } from 'react';
import CreatableSelect from 'react-select/creatable';
import { Bell, BriefcaseBusiness, CreditCard, IdCard, MapPin, Save, Tags, User, X } from 'lucide-react';
import { motion } from 'framer-motion';
import type { RosterEmployee, RosterEmployeeSite, Occupation, EmployeeGroup, RosterSite } from '@/lib/types';
import FileUploadField from './FileUploadField';
import ConfirmSpendModal from './ConfirmSpendModal';
import EmployeeInsights from './EmployeeInsights';
import { useChargedAction } from '@/lib/useChargedAction';
import { isValidSouthAfricanId } from '@/lib/sa-id';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface Option {
  label: string;
  value: string;
}

interface EmployeeModalProps {
  userId: string;
  employee?: RosterEmployee | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EmployeeModal({ userId, employee, onClose, onSaved }: EmployeeModalProps) {
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(userId);
  const [name, setName] = useState(employee?.name || '');
  const [idNumber, setIdNumber] = useState(employee?.idNumber || '');
  const [occupationOptions, setOccupationOptions] = useState<Option[]>([]);
  const [occupation, setOccupation] = useState<Option | null>(
    employee?.occupation ? { label: employee.occupation, value: employee.occupation } : null
  );
  const [groupOptions, setGroupOptions] = useState<Option[]>([]);
  const [groups, setGroups] = useState<Option[]>([]);
  const [siteOptions, setSiteOptions] = useState<Option[]>([]);
  const [selectedSites, setSelectedSites] = useState<Option[]>(
    (employee?.defaultSites || []).map((s) => ({ label: s.name, value: s.id }))
  );
  // hasAccessCard per selected site, keyed by site id — separate from the site catalog itself.
  const [siteAccessCards, setSiteAccessCards] = useState<Record<string, boolean>>(
    Object.fromEntries((employee?.defaultSites || []).map((s) => [s.id, s.hasAccessCard]))
  );
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [jobSpecFile, setJobSpecFile] = useState(employee?.jobSpecFile || '');
  const [extraJobSpecFiles, setExtraJobSpecFiles] = useState<string[]>(
    employee?.extraJobSpecFiles || []
  );
  const [saving, setSaving] = useState(false);
  const [repeatIntervalMonths, setRepeatIntervalMonths] = useState('');
  const [settingReminder, setSettingReminder] = useState(false);

  useEffect(() => {
    fetch(`/api/occupations?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((rows: Occupation[]) =>
        setOccupationOptions(rows.map((r) => ({ label: r.title, value: r.title })))
      );
    fetch(`/api/employee-groups?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((rows: EmployeeGroup[]) => {
        setGroupOptions(rows.map((r) => ({ label: r.name, value: r._id! })));
        if (employee?.groupIds?.length) {
          const initial = rows
            .filter((r) => employee.groupIds.includes(r._id!))
            .map((r) => ({ label: r.name, value: r._id! }));
          setGroups(initial);
        }
      });
    fetch(`/api/sites?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((rows: RosterSite[]) => {
        setSiteOptions(rows.map((r) => ({ label: r.name, value: r._id! })));
        // Reconcile the employee's existing sites (matched by name, since their embedded id is
        // appointment-employee-scoped, not the catalog _id) against the catalog so re-selecting
        // shows the real catalog option rather than a disconnected one-off.
        if (employee?.defaultSites?.length) {
          const byName = new Map(rows.map((r) => [r.name, r]));
          const reconciled = employee.defaultSites.map((s) => {
            const match = byName.get(s.name);
            return match
              ? { label: match.name, value: match._id! }
              : { label: s.name, value: s.id };
          });
          setSelectedSites(reconciled);
        }
      });
    // Load once per modal open; userId/employee don't change while the modal is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createOccupation = async (title: string) => {
    requestAction(
      'occupation.create',
      `Create occupation: ${title}`,
      async () => {
        const res = await fetch('/api/occupations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, title }),
        });
        const data = await res.json();
        if (!res.ok) return;
        const opt = { label: data.title, value: data.title };
        setOccupationOptions((prev) => [...prev, opt]);
        setOccupation(opt);
      },
      { chargeSeparately: true }
    );
  };

  const createGroup = async (name: string) => {
    requestAction(
      'group.create',
      `Create group: ${name}`,
      async () => {
        const res = await fetch('/api/employee-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, name }),
        });
        const data = await res.json();
        if (!res.ok) return;
        const opt = { label: data.name, value: data._id };
        setGroupOptions((prev) => [...prev, opt]);
        setGroups((prev) => [...prev, opt]);
      },
      { chargeSeparately: true }
    );
  };

  const createSite = async (name: string) => {
    requestAction(
      'site.add',
      `Create site: ${name}`,
      async () => {
        const res = await fetch('/api/sites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, name }),
        });
        const data = await res.json();
        if (!res.ok) return;
        const opt = { label: data.name, value: data._id };
        setSiteOptions((prev) => [...prev, opt]);
        setSelectedSites((prev) => [...prev, opt]);
      },
      { chargeSeparately: true }
    );
  };

  const checkIdNumber = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setDuplicateWarning(null);
      return;
    }
    const params = new URLSearchParams({ userId, idNumber: trimmed });
    if (employee?._id) params.set('excludeId', employee._id);
    const res = await fetch(`/api/employees/check-duplicate?${params}`);
    const data = await res.json();
    setDuplicateWarning(
      data.exists
        ? `This ID/passport number already matches an existing roster entry (${data.existingEmployee?.name}) — this may be a duplicate.`
        : null
    );
  };

  const setRepeatReminder = async () => {
    if (!employee?._id || !repeatIntervalMonths) return;
    requestAction(
      'recurring.setFlag',
      'Set repeat-booking reminder',
      async () => {
        setSettingReminder(true);
        try {
          await fetch('/api/recurring-flags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              rosterEmployeeId: employee._id,
              intervalMonths: Number(repeatIntervalMonths),
              lastAppointmentDate: new Date().toISOString().slice(0, 10),
            }),
          });
          setRepeatIntervalMonths('');
        } finally {
          setSettingReminder(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  const toggleSiteAccessCard = (siteId: string) => {
    setSiteAccessCards((prev) => ({ ...prev, [siteId]: !prev[siteId] }));
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const defaultSites: RosterEmployeeSite[] = selectedSites.map((s) => ({
        id: s.value,
        name: s.label,
        hasAccessCard: !!siteAccessCards[s.value],
      }));
      const payload = {
        userId,
        name: name.trim(),
        idNumber,
        occupation: occupation?.value || '',
        defaultSites,
        groupIds: groups.map((g) => g.value),
        jobSpecFile: jobSpecFile || undefined,
        extraJobSpecFiles,
      };
      if (employee?._id) {
        await fetch('/api/employees', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _id: employee._id, chargeUserAction: true, ...payload }),
        });
      } else {
        await fetch('/api/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!name.trim()) return;
    // Both the add and edit endpoints charge server-side (atomic with the write) — the modal
    // just shows the confirm/cost first.
    requestAction(
      employee ? 'employee.edit' : 'employee.add',
      employee ? 'Edit employee' : 'Add employee',
      doSave,
      { chargeSeparately: true }
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="bg-white max-w-lg w-full rounded-card shadow-md border border-gray-200 p-6 max-h-[85vh] overflow-y-auto"
      >
        <h2 className="font-semibold text-gray-900 mb-4 inline-flex items-center gap-2">
          <User className="h-4 w-4 text-red-500" aria-hidden="true" />
          {employee ? 'Edit employee' : 'Add employee'}
        </h2>
        {employee?._id && (
          <div className="mb-4">
            <EmployeeInsights
              userId={userId}
              employeeId={employee._id}
              employeeName={employee.name}
              variant="detail"
            />
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <User className="h-3.5 w-3.5" aria-hidden="true" />
              Name
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
          </div>

          <div>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <IdCard className="h-3.5 w-3.5" aria-hidden="true" />
              ID / Passport Number
            </label>
            <Input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              onBlur={() => checkIdNumber(idNumber)}
              className="w-full"
            />
            {isValidSouthAfricanId(idNumber) === false && (
              <p className="text-xs text-amber-600 mt-1">
                This doesn&apos;t look like a valid SA ID number, please double-check.
              </p>
            )}
            {duplicateWarning && (
              <p className="text-xs text-amber-600 mt-1">{duplicateWarning}</p>
            )}
          </div>

          <div>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <BriefcaseBusiness className="h-3.5 w-3.5" aria-hidden="true" />
              Occupation
            </label>
            <CreatableSelect
              isClearable
              value={occupation}
              options={occupationOptions}
              onChange={(v) => setOccupation(v)}
              onCreateOption={createOccupation}
              placeholder="Select or create…"
              classNamePrefix="rs"
            />
          </div>

          <div>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Tags className="h-3.5 w-3.5" aria-hidden="true" />
              Groups
            </label>
            <CreatableSelect
              isMulti
              value={groups}
              options={groupOptions}
              onChange={(v) => setGroups(v as Option[])}
              onCreateOption={createGroup}
              placeholder="Select or create…"
              classNamePrefix="rs"
            />
          </div>

          <div>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              Sites
            </label>
            <CreatableSelect
              isMulti
              value={selectedSites}
              options={siteOptions}
              onChange={(v) => setSelectedSites(v as Option[])}
              onCreateOption={createSite}
              placeholder="Select or create…"
              classNamePrefix="rs"
            />
            {selectedSites.length > 0 && (
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="font-normal">Site</th>
                    <th className="font-normal inline-flex items-center gap-1">
                      <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                      Access card?
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSites.map((s) => (
                    <tr key={s.value}>
                      <td className="py-1 text-gray-800">{s.label}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!siteAccessCards[s.value]}
                          onChange={() => toggleSiteAccessCard(s.value)}
                          className="accent-red-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <FileUploadField label="Job Spec File" value={jobSpecFile} onChange={setJobSpecFile} />

          <FileUploadField
            label="Extra Job Spec Files"
            value={extraJobSpecFiles}
            onChange={setExtraJobSpecFiles}
            multiple
          />

          {employee?._id && (
            <div>
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                Repeat booking reminder
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  min={1}
                  placeholder="Months"
                  value={repeatIntervalMonths}
                  onChange={(e) => setRepeatIntervalMonths(e.target.value)}
                  className="w-24"
                />
                <span className="text-xs text-gray-500">months, from last appointment</span>
                <Button
                  onClick={setRepeatReminder}
                  disabled={!repeatIntervalMonths || settingReminder}
                  variant="secondary"
                  className="text-xs px-3 py-1.5"
                >
                  <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                  {settingReminder ? 'Saving…' : 'Set reminder'}
                </Button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Only surfaces a reminder when due — never books anything automatically.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <Button onClick={save} disabled={saving || !name.trim()} variant="primary" className="px-3 py-2">
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button onClick={onClose} variant="secondary" className="px-3 py-2">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Cancel
          </Button>
        </div>
      </motion.div>

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
