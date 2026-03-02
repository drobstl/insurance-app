import { NextRequest, NextResponse } from 'next/server';

function isMobile(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return (
    /iphone|ipod|ipad|android|webos|blackberry|iemobile|opera mini|mobile|fennec|minimo|kindle|silk/i.test(ua)
  );
}

export function middleware(request: NextRequest) {
  // Normalize: treat '' and trailing slash as canonical path
  const pathname = request.nextUrl.pathname || '';
  const path = pathname.replace(/\/$/, '') || '/';

  const userAgent = request.headers.get('user-agent');
  const mobile = isMobile(userAgent);

  // Root: mobile -> /m, desktop -> /v5
  if (path === '/' || path === '') {
    if (mobile) {
      return NextResponse.rewrite(new URL('/m', request.url));
    }
    return NextResponse.rewrite(new URL('/v5', request.url));
  }

  // Founding member: mobile -> /founding-member/m
  if (path === '/founding-member') {
    if (mobile) {
      return NextResponse.rewrite(new URL('/founding-member/m', request.url));
    }
  }

  return NextResponse.next();
}

// Run on all page requests so root (/) is never missed; we only rewrite for / and /founding-member
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
