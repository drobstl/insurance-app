/**
 * Landing-page routing for agentforlife.app
 *
 * Root (/) is rewritten by device:
 *   - Mobile  → /m   (app/m/page.tsx)
 *   - Desktop → /v5  (app/v5/page.tsx)
 *
 * These are the only two landing pages we maintain. See LANDING_PAGES.md.
 */
import { NextRequest, NextResponse } from 'next/server';

function isMobile(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return (
    /iphone|ipod|ipad|android|webos|blackberry|iemobile|opera mini|mobile|fennec|minimo|kindle|silk/i.test(ua)
  );
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname || '';
  const path = pathname.replace(/\/$/, '') || '/';

  const userAgent = request.headers.get('user-agent');
  const mobile = isMobile(userAgent);

  if (path === '/' || path === '') {
    if (mobile) {
      return NextResponse.rewrite(new URL('/m', request.url));
    }
    return NextResponse.rewrite(new URL('/v5', request.url));
  }

  if (path === '/founding-member') {
    if (mobile) {
      return NextResponse.rewrite(new URL('/founding-member/m', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
