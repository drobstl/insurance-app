import { NextRequest, NextResponse } from 'next/server';

const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL || 'https://apps.apple.com/app/id000000000';
const PLAY_STORE_URL =
  process.env.NEXT_PUBLIC_PLAY_STORE_URL ||
  'https://play.google.com/store/apps/details?id=com.agentforlife.app';

function isIOS(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function isAndroid(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return /android/.test(ua);
}

/**
 * GET /app — Redirect clients to the correct app store.
 * iOS -> App Store, Android -> Play Store.
 * Desktop/other -> minimal page with both store links (never marketing site).
 */
export function GET(request: NextRequest) {
  const userAgent = request.headers.get('user-agent');

  if (isIOS(userAgent)) {
    return NextResponse.redirect(APP_STORE_URL, 302);
  }
  if (isAndroid(userAgent)) {
    return NextResponse.redirect(PLAY_STORE_URL, 302);
  }

  // Desktop or unknown: show minimal page with both store buttons
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Download AgentForLife</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f8f8f8; color: #1a1a1a; text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #666; margin-bottom: 1.5rem; }
    a { display: inline-block; padding: 12px 24px; margin: 8px; border-radius: 8px; font-weight: 600; text-decoration: none; }
    .ios { background: #000; color: #fff; }
    .android { background: #0D4D4D; color: #fff; }
  </style>
</head>
<body>
  <h1>Download AgentForLife</h1>
  <p>Open this link on your phone, or choose your device below.</p>
  <a href="${APP_STORE_URL}" class="ios">App Store (iPhone / iPad)</a>
  <a href="${PLAY_STORE_URL}" class="android">Google Play (Android)</a>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
