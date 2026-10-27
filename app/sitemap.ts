import type { MetadataRoute } from 'next';
import manifest from '@/content/manifest.json';
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.SITE_URL || 'https://biznest.co.in';
  return ['/', ...Object.keys(manifest).filter(name => name !== 'index.html').map(name => `/${encodeURIComponent(name)}`)].map(route => ({ url: `${base}${route}` }));
}
