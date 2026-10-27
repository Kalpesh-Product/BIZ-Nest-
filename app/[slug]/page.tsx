import { notFound } from 'next/navigation';
import manifest from '@/content/manifest.json';
import { ReferencePage, pageMetadata } from '@/components/reference-page';
export function generateStaticParams() { return Object.keys(manifest).map(slug => ({ slug })); }
function contentName(slug: string) {
  if (Object.hasOwn(manifest, slug)) return slug;
  // This Next.js version can supply percent-encoded static route parameters.
  // Resolve legacy names containing spaces or ampersands before lookup.
  try { return decodeURIComponent(slug); } catch { return slug; }
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return pageMetadata(contentName((await params).slug));
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const slug = contentName((await params).slug);
  if (!Object.hasOwn(manifest, slug)) notFound();
  return <ReferencePage name={slug} />;
}
