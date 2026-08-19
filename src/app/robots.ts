import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { SEO_ROBOTS } from '@/lib/seo-config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/llms.txt', '/site.webmanifest'],
        disallow: SEO_ROBOTS.disallow,
      },
      ...SEO_ROBOTS.aiUserAgents.map((userAgent) => ({
        userAgent,
        allow: ['/', '/llms.txt', '/site.webmanifest'],
        disallow: SEO_ROBOTS.disallow,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
