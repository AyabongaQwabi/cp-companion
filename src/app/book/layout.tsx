import type { Metadata } from 'next';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Book Occupational Medicals in Bulk',
  description:
    'Select employees from your roster, apply mine medicals, drug and health screening, or exit medicals across all of them at once, and submit the appointment straight into ClinicPlus.',
  alternates: {
    canonical: absoluteUrl('/book'),
  },
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
