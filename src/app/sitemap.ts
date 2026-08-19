import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { SEO_ROUTES } from '@/lib/seo-config';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return SEO_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
