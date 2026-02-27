import 'server-only';

/**
 * Simple in-memory rate limiter for Vercel serverless functions.
 *
 * Tracks request counts per key (typically IP) in a sliding window.
 * State is per-instance so it resets on cold starts, but still provides
 * meaningful protection against sustained brute-force attacks.
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of windows) {
    if (now > entry.resetAt) windows.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check and consume one request against the rate limit.
 *
 * @param key     Unique identifier (e.g. IP address or IP + route)
 * @param limit   Maximum requests allowed in the window
 * @param windowMs  Window duration in milliseconds (default 60 000 = 1 minute)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || now > entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Extract client IP from a Next.js request.
 * Prefers x-forwarded-for (set by Vercel/proxies), falls back to x-real-ip.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}
