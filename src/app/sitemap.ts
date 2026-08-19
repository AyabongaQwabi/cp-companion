import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Public, indexable routes only. Authenticated routes (/roster, /companies, /finances,
// /insights, /settings, /profile, /login) are intentionally excluded — see robots.ts for the
// matching disallow list.
const PUBLIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/book', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/features', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/features/roster', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/features/bulk-booking', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/features/insights', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/solutions', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/solutions/mining-industrial', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/solutions/multi-site-employers', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/solutions/occupational-health-officers', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/resources', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/resources/guides/bulk-booking-occupational-health', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/resources/guides/employee-medical-recordkeeping', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/resources/guides/ohsa-compliance-checklist', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/resources/faq', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/refund-policy', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
