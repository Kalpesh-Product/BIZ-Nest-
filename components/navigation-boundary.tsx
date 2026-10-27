'use client';

import { Fragment, useLayoutEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

let pendingDestination: string | null = null;

export function preparePageNavigation(pathname: string) {
  if (pathname === window.location.pathname) {
    pendingDestination = null;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  } else pendingDestination = pathname;
}

function samePath(a: string, b: string) {
  try { return decodeURIComponent(a) === decodeURIComponent(b); } catch { return a === b; }
}

// Keep Next's prefetched route data, but recreate the legacy page DOM on each
// pathname change. Hidden cached copies would duplicate IDs and confuse the
// original document-scoped controls. A Fragment adds no layout element.
export function NavigationBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useLayoutEffect(() => {
    const shouldStartAtTop = pendingDestination !== null && samePath(pendingDestination, pathname);
    pendingDestination = null;
    if (shouldStartAtTop) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
  return <Fragment key={pathname}>{children}</Fragment>;
}
