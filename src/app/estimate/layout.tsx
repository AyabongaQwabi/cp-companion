import type { Metadata } from 'next';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Cost Estimator',
  description:
    'Estimate the cost of occupational health medicals for your workforce using ClinicPlus’s real, current prices — enter an employee count and pick services to get a rough total. No account needed.',
  alternates: {
    canonical: absoluteUrl('/estimate'),
  },
};

export default function EstimateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
