/**
 * Edge proxy for agentforlife.app.
 *
 * Two responsibilities:
 *
 * 1. **Read-only maintenance mode** (May 2026 onward) — when
 *    MAINTENANCE_MODE_READONLY=true, intercept /api/* requests:
 *    cron paths return a 200 `{ skipped: true }` so Vercel Cron
 *    sees a clean success but the cron handler never runs;
 *    non-GET requests outside the allowlist return 503 with the
 *    maintenance message. See web/lib/maintenance-mode.ts for the
 *    full rationale + allowlist contents.
 *
 * 2. **Landing-page routing for the marketing site** — root (/) is
 *    rewritten by device:
 *      - Mobile  → /m   (app/m/page.tsx)
 *      - Desktop → /v5  (app/v5/page.tsx)
 *    These are the only two landing pages we maintain. See
 *    LANDING_PAGES.md.
 *
 * 3. **PostHog reverse proxy** for /ingest/* — preserves host header
 *    so PostHog's /flags endpoint doesn't 401.
 *
 * Matcher includes /api/* now (it used to exclude them) so the
 * maintenance gate can intercept them. The non-API branches of the
 * proxy function are no-ops for /api/* paths.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  isMaintenanceAllowedPath,
  isMaintenanceModeReadOnly,
  isMaintenanceReadOnlyMethod,
  MAINTENANCE_503_MESSAGE,
} from './lib/maintenance-mode';

function isMobile(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return (
    /iphone|ipod|ipad|android|webos|blackberry|iemobile|opera mini|mobile|fennec|minimo|kindle|silk/i.test(ua)
  );
}

function maintenanceGate(request: NextRequest): NextResponse | null {
  if (!isMaintenanceModeReadOnly()) return null;

  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/')) return null;

  // Cron short-circuit. 200 (not 503) so Vercel Cron doesn't retry.
  if (pathname.startsWith('/api/cron/')) {
    return NextResponse.json(
      { skipped: true, reason: 'maintenance', relaunch: 'Tuesday May 12' },
      { status: 200, headers: { 'X-Afl-Maintenance': 'cron-skipped' } },
    );
  }

  // Allowlist + read-only methods pass through to the API route.
  if (isMaintenanceAllowedPath(pathname)) return null;
  if (isMaintenanceReadOnlyMethod(request.method)) return null;

  // Mutation: refuse with 503 + a friendly message. Dashboard
  // surfaces this in the existing toast UI; the global banner makes
  // the cause obvious.
  return NextResponse.json(
    {
      error: MAINTENANCE_503_MESSAGE,
      maintenance: true,
      relaunch: 'Tuesday May 12',
    },
    {
      status: 503,
      headers: {
        'X-Afl-Maintenance': 'mutation-blocked',
        'Retry-After': '518400', // ~6 days; conservative.
      },
    },
  );
}

export function proxy(request: NextRequest) {
  // Maintenance window enforcement runs first. When the env var is
  // off (default) this is a single boolean check + return.
  const blocked = maintenanceGate(request);
  if (blocked) return blocked;

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

  // /api/* paths beyond the maintenance gate above are no-ops for
  // the landing-page routing branches below. Short-circuit here so
  // the rest of the function is unambiguously about marketing /
  // dashboard paths.
  if (path.startsWith('/api/')) return NextResponse.next();

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

// Matcher now INCLUDES /api/* so the maintenance gate can intercept
// them. /_next assets and favicon are still excluded.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
