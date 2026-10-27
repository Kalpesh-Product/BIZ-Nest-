'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { preparePageNavigation } from './navigation-boundary';

type SiteLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'prefetch' | 'scroll' | 'onNavigate'> & { href: string };

export function SiteLink({ href, ...props }: SiteLinkProps) {
  const hasFragment = href.includes('#');
  return <Link {...props} href={href} prefetch={true} scroll={hasFragment} onNavigate={() => {
    if (!hasFragment) preparePageNavigation(new URL(href, window.location.href).pathname);
  }} />;
}
