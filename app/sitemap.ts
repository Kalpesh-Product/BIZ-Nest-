import type { MetadataRoute } from 'next';
import manifest from '@/content/manifest.json';
import { getSiteUrl } from '@/lib/server-config.mjs';
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return ['/', ...Object.keys(manifest).filter(name => name !== 'index.html').map(name => `/${encodeURIComponent(name)}`)].map(route => ({ url: `${base}${route}` }));
}
