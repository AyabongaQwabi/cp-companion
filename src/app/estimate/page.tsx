'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Calculator, Info } from 'lucide-react';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LinkButton } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { MEDICAL_SERVICES, DOVER_PRICE, XRAYS_PRICE } from '@/lib/clinicplus-constants';
import { SERVICE_CATEGORIES } from '@/lib/service-categories';
import { calculateBookingPrice } from '@/lib/pricing';
import type { AppointmentEmployee } from '@/lib/types';

const rand = (amount: number) =>
  `R${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

/**
 * Public, pre-login lead-gen tool (no NavBar/TermsGate, same as /privacy, /terms) — enter an
 * employee count and pick services, get a rough total. Applies the same service selection
 * uniformly across every employee (this is an estimate, not a real booking builder — /book is
 * where a real per-employee selection happens), then feeds a synthetic AppointmentEmployee[]
 * through the exact same calculateBookingPrice() the real booking flow uses, so the number is
 * accurate to ClinicPlus's real current prices, not a marketing-invented figure.
 */
export default function EstimatePage() {
  const [employeeCount, setEmployeeCount] = useState(10);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [includeDover, setIncludeDover] = useState(false);
  const [includeXray, setIncludeXray] = useState(false);

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const total = useMemo(() => {
    const count = Math.max(0, Math.min(10000, Math.round(employeeCount) || 0));
    if (count === 0 || selectedServiceIds.length === 0) return 0;

    const services = selectedServiceIds
      .map((id) => MEDICAL_SERVICES[id])
      .filter(Boolean)
      .map((s) => ({ id: s.id, price: s.price }));

    const employees: AppointmentEmployee[] = Array.from({ length: count }, (_, i) => ({
      id: `estimate-${i}`,
      name: '',
      idNumber: '',
      comments: [],
      occupation: '',
      services,
      sites: [],
      isMinimized: true,
      dover: { required: includeDover },
      xray: { required: includeXray },
    }));

    return calculateBookingPrice(employees);
  }, [employeeCount, selectedServiceIds, includeDover, includeXray]);

  const perEmployee = employeeCount > 0 ? total / employeeCount : 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 w-full">
        <FadeIn>
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="h-5 w-5 text-red-500" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-gray-900">Cost estimator</h1>
          </div>
          <p className="text-sm text-gray-600 mb-8">
            Get a rough total using ClinicPlus&apos;s real, current prices. No account needed —
            this is free.
          </p>
        </FadeIn>

        <FadeIn delay={0.05}>
          <Card className="p-5 mb-6">
            <label className="block text-xs text-gray-500 mb-1">Number of employees</label>
            <Input
              type="number"
              min={1}
              max={10000}
              value={employeeCount}
              onChange={(e) => setEmployeeCount(Number(e.target.value))}
              className="w-full sm:w-40"
            />
          </Card>
        </FadeIn>

        <FadeIn delay={0.1}>
          <Card className="p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Services</h2>
            <p className="text-xs text-gray-500 mb-4">
              Applied to every employee in this estimate. A real booking lets you vary services
              per employee.
            </p>
            <div className="space-y-4">
              {SERVICE_CATEGORIES.map((category) => (
                <div key={category.label}>
                  <h3 className="text-xs font-medium text-gray-500 mb-2">{category.label}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {category.serviceIds.map((id) => {
                      const service = MEDICAL_SERVICES[id];
                      if (!service) return null;
                      return (
                        <label
                          key={id}
                          className="flex items-start gap-2 text-sm border border-gray-200 rounded-input px-3 py-2 cursor-pointer hover:border-red-300 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedServiceIds.includes(id)}
                            onChange={() => toggleService(id)}
                            className="mt-0.5"
                          />
                          <span className="flex-1">
                            <span className="block text-gray-800">{service.title}</span>
                            <span className="block text-xs text-gray-500">{rand(service.price)} each</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-4 pt-4 border-t border-gray-100">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={includeDover} onChange={(e) => setIncludeDover(e.target.checked)} />
                Dover ({rand(DOVER_PRICE)} per employee)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={includeXray} onChange={(e) => setIncludeXray(e.target.checked)} />
                X-ray ({rand(XRAYS_PRICE)} per employee)
              </label>
            </div>
          </Card>
        </FadeIn>

        <FadeIn delay={0.15}>
          <Card premium className="p-5 mb-6">
            <p className="text-xs text-gray-500 mb-1">Estimated total</p>
            <p className="text-3xl font-semibold text-gray-900 mb-1">{rand(total)}</p>
            {employeeCount > 0 && (
              <p className="text-xs text-gray-500">{rand(perEmployee)} per employee</p>
            )}
          </Card>
        </FadeIn>

        <FadeIn delay={0.2}>
          <div className="flex items-start gap-2 text-xs text-gray-400 mb-8">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              This is a rough estimate using ClinicPlus&apos;s current published prices, applied
              uniformly across the employee count you entered. A real booking may differ based on
              the exact services each employee needs. This tool does not create a booking or
              require an account.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <LinkButton href="/book" variant="primary" className="text-sm px-5 py-2.5">
              Book with ClinicPlus Companion
            </LinkButton>
            <Link
              href="/login"
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Already have an account? Log in
            </Link>
          </div>
        </FadeIn>
      </main>
      <Footer />
    </div>
  );
}
