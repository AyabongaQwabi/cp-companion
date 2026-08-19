import type { Metadata } from 'next';
import HomeClient from '@/components/HomeClient';
import { absoluteUrl, SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Bulk Occupational Health Booking for ClinicPlus Clients',
  description:
    'ClinicPlus Companion is a saved employee roster and bulk booking add-on for companies that book occupational medicals through ClinicPlus — mine medicals, screening, and exit medicals in Hendrina and Churchill.',
  alternates: {
    canonical: absoluteUrl('/'),
  },
  openGraph: {
    title: 'Bulk Occupational Health Booking for ClinicPlus Clients',
    description:
      'ClinicPlus Companion is a saved employee roster and bulk booking add-on for companies that book occupational medicals through ClinicPlus.',
    url: absoluteUrl('/'),
    images: [
      {
        url: '/hero.jpg',
        width: 600,
        height: 338,
        alt: 'ClinicPlus Companion dashboard preview',
      },
      {
        url: '/logo-wide.png',
        width: 1942,
        height: 809,
        alt: 'ClinicPlus Companion logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bulk Occupational Health Booking for ClinicPlus Clients',
    description:
      'A saved employee roster and bulk booking add-on for companies that book occupational medicals through ClinicPlus.',
    images: ['/hero.jpg'],
  },
};

const SOFTWARE_APPLICATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ClinicPlus Companion',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: SITE_URL,
  description:
    'A saved employee roster and bulk appointment booking add-on for companies that book occupational medicals through ClinicPlus.',
  image: `${SITE_URL}/hero.jpg`,
  offers: {
    '@type': 'Offer',
    availability: 'https://schema.org/InStock',
    category: 'Existing ClinicPlus clients only',
  },
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_APPLICATION_JSON_LD) }}
      />
      <HomeClient />
    </>
  );
}
