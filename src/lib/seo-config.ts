import seoConfig from '../../config/seo.json';

export type SeoRoute = {
  path: string;
  title: string;
  description: string;
  priority: number;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
};

export const SEO_ROUTES = seoConfig.sitemap.routes as SeoRoute[];
export const SEO_ROBOTS = seoConfig.robots;
export const SEO_LLMS = seoConfig.llms;
