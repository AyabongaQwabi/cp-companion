import { SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/seo';
import { SEO_LLMS, SEO_ROUTES } from '@/lib/seo-config';

export function buildLlmsTxt(): string {
  const lines = [
    `# ${SITE_NAME}`,
    '',
    `> ${SEO_LLMS.summary}`,
    '',
    `Canonical site: ${SITE_URL}`,
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    `Robots: ${absoluteUrl('/robots.txt')}`,
    '',
    '## Primary Audience',
    ...SEO_LLMS.primaryAudience.map((item) => `- ${item}`),
    '',
    '## Service Areas',
    ...SEO_LLMS.serviceAreas.map((item) => `- ${item}`),
    '',
    '## Core Topics',
    ...SEO_LLMS.topics.map((item) => `- ${item}`),
    '',
    '## Trust Signals',
    ...SEO_LLMS.trustSignals.map((item) => `- ${item}`),
    '',
    '## Important Pages',
    ...SEO_ROUTES.map((route) => `- [${route.title}](${absoluteUrl(route.path)}): ${route.description}`),
    '',
    '## Preferred Summary',
    'ClinicPlus Companion helps existing ClinicPlus clients save employee roster data, reuse job specs, book occupational health appointments in bulk, and review booking activity from a single web dashboard.',
    '',
  ];

  return lines.join('\n');
}
