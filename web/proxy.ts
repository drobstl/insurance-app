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
  // PostHog reverse proxy: preserve host for /ingest requests
  // to avoid 401s on /flags when the hosting layer rewrites requests.
  if (request.nextUrl.pathname.startsWith('/ingest/')) {
    const url = request.nextUrl.clone();
    const isAssetRoute =
      url.pathname.startsWith('/ingest/static/') ||
      url.pathname.startsWith('/ingest/array/');
    const hostname = isAssetRoute
      ? 'us-assets.i.posthog.com'
      : 'us.i.posthog.com';

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('host', hostname);

    url.protocol = 'https';
    url.hostname = hostname;
    url.port = '443';
    url.pathname = url.pathname.replace(/^\/ingest/, '');

    return NextResponse.rewrite(url, {
      request: {
        headers: requestHeaders,
      },
    });
  }

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

  // Closr-style sandbox route: UA-aware like home route.
  if (path === '/closr-style') {
    if (mobile) {
      return NextResponse.rewrite(new URL('/closr-style/m', request.url));
    }
    return NextResponse.next();
  }

  // Keep desktop URL clean for closr-style as well.
  if (path === '/closr-style/m' && !mobile) {
    return NextResponse.redirect(new URL('/closr-style', request.url));
  }

  // Closr-style2 sandbox route: UA-aware like home route.
  if (path === '/closr-style2') {
    if (mobile) {
      return NextResponse.rewrite(new URL('/closr-style2/m', request.url));
    }
    return NextResponse.next();
  }

  // Keep desktop URL clean for closr-style2 as well.
  if (path === '/closr-style2/m' && !mobile) {
    return NextResponse.redirect(new URL('/closr-style2', request.url));
  }

  // Desktop: redirect /v5 to / so URL stays clean (agentforlife.app)
  if (path === '/v5' && !mobile) {
    return NextResponse.redirect(new URL('/', request.url));
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
