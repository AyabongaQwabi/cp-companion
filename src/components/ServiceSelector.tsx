'use client';

import { useMemo, useState } from 'react';
import { MEDICAL_SERVICES } from '@/lib/clinicplus-constants';
import { SERVICE_CATEGORIES } from '@/lib/service-categories';

interface ServiceSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Optional label above the running subtotal, e.g. "Subtotal for this employee". */
  subtotalLabel?: string;
}

const formatPrice = (price: number) => `R${price.toFixed(2)}`;

/**
 * Searchable, categorized service multi-select with removable chips and a live subtotal
 * (Part F.6) — replaces the flat checkbox list. Same component whether setting services for one
 * employee or applying a selection to many at once (the caller decides what selectedIds/onChange
 * apply to).
 */
export default function ServiceSelector({
  selectedIds,
  onChange,
  subtotalLabel = 'Subtotal',
}: ServiceSelectorProps) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const term = search.trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    return SERVICE_CATEGORIES.map((cat) => ({
      ...cat,
      serviceIds: cat.serviceIds.filter((id) => {
        const svc = MEDICAL_SERVICES[id];
        if (!svc) return false;
        return term ? svc.title.toLowerCase().includes(term) : true;
      }),
    })).filter((cat) => cat.serviceIds.length > 0);
  }, [term]);

  const subtotal = useMemo(
    () => selectedIds.reduce((sum, id) => sum + (MEDICAL_SERVICES[id]?.price || 0), 0),
    [selectedIds]
  );

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id]
    );
  };

  const toggleCategoryCollapsed = (label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="border border-gray-200 rounded-card p-3 bg-white">
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedIds.map((id) => {
            const svc = MEDICAL_SERVICES[id];
            if (!svc) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 bg-red-50 text-red-700 rounded-pill px-2 py-0.5 text-xs"
              >
                {svc.title} · {formatPrice(svc.price)}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="text-red-400 hover:text-red-700 transition-colors"
                  aria-label={`Remove ${svc.title}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services…"
          className="border border-gray-300 rounded-input px-2 py-1 text-xs flex-1 mr-3 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 transition-shadow"
        />
        <span className="text-xs font-medium whitespace-nowrap text-gray-900">
          {subtotalLabel}: {formatPrice(subtotal)}
        </span>
      </div>

      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
        {filteredCategories.map((cat) => (
          <div key={cat.label}>
            <button
              type="button"
              onClick={() => toggleCategoryCollapsed(cat.label)}
              className="text-xs font-semibold text-gray-600 mb-1 hover:text-gray-800 transition-colors"
            >
              {collapsed[cat.label] ? '▸' : '▾'} {cat.label}
            </button>
            {!collapsed[cat.label] && (
              <div className="flex flex-col gap-1 pl-3">
                {cat.serviceIds.map((id) => {
                  const svc = MEDICAL_SERVICES[id];
                  return (
                    <label key={id} className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(id)}
                        onChange={() => toggle(id)}
                        className="accent-red-500"
                      />
                      <span className="flex-1">{svc.title}</span>
                      <span className="text-gray-500">{formatPrice(svc.price)}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {filteredCategories.length === 0 && (
          <p className="text-xs text-gray-500">No services match your search.</p>
        )}
      </div>
    </div>
  );
}
