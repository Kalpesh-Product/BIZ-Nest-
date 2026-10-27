import { NextResponse, type NextRequest } from 'next/server';
import manifest from './content/manifest.json';

export function proxy(request: NextRequest) {
  const pathname = decodeURIComponent(request.nextUrl.pathname);
  if (pathname.endsWith('.html') && !Object.hasOwn(manifest, pathname.slice(1))) {
    // Set the status before streaming starts so missing legacy URLs are real 404s.
    return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
  }
  return NextResponse.next();
}
export const config = { matcher: ['/((?!api|_next|assets).*)'] };
