'use client';

import { useState } from 'react';
import CreatableSelect from 'react-select/creatable';
import ConfirmSpendModal from './ConfirmSpendModal';
import { useChargedAction } from '@/lib/useChargedAction';

interface Option {
  label: string;
  value: string;
}

interface CompanySelectProps {
  label: string;
  companies: { id: string; name: string }[];
  value: string;
  onChange: (name: string) => void;
  userId: string;
  userName: string;
  onCompanyCreated?: (company: { id: string; name: string }) => void;
}

/**
 * Part F.0 — react-select for "Company name on medical" / "Company responsible for payment".
 * Scoped to the companies the logged-in user manages; selecting an existing one is free
 * (search/select). Creating a brand-new one is a real production.companies write, charged
 * server-side (/api/companies) and confirmed here first per F.1.
 */
export default function CompanySelect({
  label,
  companies,
  value,
  onChange,
  userId,
  userName,
  onCompanyCreated,
}: CompanySelectProps) {
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(userId);
  const [creating, setCreating] = useState(false);
  const [extraOptions, setExtraOptions] = useState<Option[]>([]);

  const options: Option[] = [
    ...companies.map((c) => ({ label: c.name, value: c.name })),
    ...extraOptions,
  ];

  const selected = value ? { label: value, value } : null;

  const selectExistingCompany = (nextValue: string) => {
    if (!nextValue) {
      onChange('');
      return;
    }
    requestAction('company.selectExisting', `Select company: ${nextValue}`, () => {
      onChange(nextValue);
    });
  };

  const createCompany = (name: string) => {
    requestAction(
      'company.createNew',
      `Create company: ${name}`,
      async () => {
        setCreating(true);
        try {
          const res = await fetch('/api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, userId, userName }),
          });
          const data = await res.json();
          setExtraOptions((prev) => [...prev, { label: data.name, value: data.name }]);
          onChange(data.name);
          onCompanyCreated?.({ id: data.id, name: data.name });
        } finally {
          setCreating(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <CreatableSelect
        isClearable
        isDisabled={creating}
        value={selected}
        options={options}
        onChange={(v) => selectExistingCompany(v?.value || '')}
        onCreateOption={createCompany}
        placeholder={creating ? 'Creating…' : 'Select or create…'}
        formatCreateLabel={(input) => `Create company: ${input}`}
        classNamePrefix="rs"
      />

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
