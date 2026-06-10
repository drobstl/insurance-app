/**
 * Canonical-origin resolution for Google OAuth redirect URIs.
 *
 * Both Google OAuth flows (Drive + Calendar) must send a `redirect_uri` that
 * EXACTLY matches one of the "Authorized redirect URIs" registered on the
 * Google Cloud OAuth client. Deriving the origin from the inbound request —
 * `new URL(req.url).origin` — means any non-canonical host
 * (`www.agentforlife.app`, a Vercel preview URL, an apex/alias mismatch, …)
 * produces an unregistered `redirect_uri` and Google rejects sign-in with
 * "Error 400: redirect_uri_mismatch".
 *
 * This module resolves a stable canonical origin so the emitted `redirect_uri`
 * is always a registered value, and it is the SINGLE source of truth shared by
 * the auth route and the callback route of each flow. That sharing matters:
 * the `redirect_uri` sent at consent time and at token-exchange time must be
 * byte-identical or Google rejects the code exchange.
 *
 * Pure on purpose — no `server-only`, no secrets — so it is trivially
 * unit-testable (see tests/oauth-redirect/run-smoke.ts).
 */

/** Canonical production origin. Mirrors the fallback used in lib/booking-link.ts. */
export const CANONICAL_APP_ORIGIN = 'https://agentforlife.app';

/** Registered Drive OAuth callback path. */
export const GOOGLE_DRIVE_CALLBACK_PATH = '/api/integrations/google/callback';
/** Registered Calendar OAuth callback path. */
export const GOOGLE_CALENDAR_CALLBACK_PATH = '/api/integrations/google-calendar/callback';

function parseOrigin(value: string | undefined | null): string {
  if (!value) return '';
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function isLocalhostOrigin(origin: string): boolean {
  if (!origin) return false;
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
}

/**
 * Resolve the canonical origin for OAuth redirect URIs from the inbound
 * request URL.
 *
 * Order is intentionally NOT "env var wins first":
 *   1. localhost / 127.0.0.1 → keep the request origin. Local dev must use the
 *      registered localhost callbacks (Drive on :3000, Calendar on :3001).
 *      This is first ON PURPOSE: web/.env.local pins NEXT_PUBLIC_APP_URL to the
 *      production URL, so an env-first order would make local OAuth emit the
 *      prod callback and bounce the dev browser to production.
 *   2. NEXT_PUBLIC_APP_URL (set in Vercel Development/Preview/Production) → its
 *      normalized origin.
 *   3. Hard-coded CANONICAL_APP_ORIGIN fallback.
 *
 * Steps 2 & 3 both collapse non-canonical production hosts (www, preview URLs)
 * onto the canonical origin — that is what eliminates redirect_uri_mismatch.
 */
export function resolveCanonicalOrigin(requestUrl: string): string {
  const requestOrigin = parseOrigin(requestUrl);
  if (isLocalhostOrigin(requestOrigin)) {
    return requestOrigin;
  }
  return parseOrigin(process.env.NEXT_PUBLIC_APP_URL) || CANONICAL_APP_ORIGIN;
}

/**
 * Build the absolute Google OAuth callback URL for a flow.
 *
 * This is the value passed as `redirect_uri` to BOTH the consent-URL builder
 * (auth route) and the token-exchange call (callback route). Routing both
 * through this one helper guarantees they are byte-identical.
 */
export function buildGoogleCallbackUrl(requestUrl: string, callbackPath: string): string {
  return `${resolveCanonicalOrigin(requestUrl)}${callbackPath}`;
}
