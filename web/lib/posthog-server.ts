import {
  type AnalyticsEventName,
  type AnalyticsEventProperties,
} from './analytics-events';

/**
 * Server-side PostHog capture for API routes (Stripe webhook,
 * upgrade-tier, …). Same direct-POST pattern as
 * app/api/posthog/heartbeat/route.ts; lives in lib so every route
 * shares one implementation and the typed event contract from
 * analytics-events.ts.
 *
 * - distinct_id is the agent's Firebase uid — the SAME id the client
 *   passes to identifyAgent(), so server events land on the same
 *   PostHog person as the browser events.
 * - Best-effort by design: never throws, never blocks the caller's
 *   business logic. Callers should still `await` it — on Vercel a
 *   fire-and-forget fetch can be frozen mid-flight when the function
 *   suspends after the response is returned.
 * - Capture AFTER the state change commits, so a transient-error
 *   webhook retry (5xx before the write) can't double-emit.
 */

// Mirrors the client-side backstop in lib/posthog.ts. The contract is
// still "never put lead/client PII in properties" — this guard exists
// for defense in depth, not as permission to rely on it.
const piiKeyPattern = /(client.*(name|email|phone)|policy.*number|ssn)/i;

const CAPTURE_TIMEOUT_MS = 2500;

export async function captureServerEvent<T extends AnalyticsEventName>(
  distinctId: string,
  eventName: T,
  properties?: AnalyticsEventProperties<T>,
): Promise<void> {
  try {
    // .trim() matches web/lib/posthog.ts — a trailing newline in the
    // Vercel env value made PostHog 200-and-drop everything (Mar–Jun 2026).
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
    if (!apiKey || !distinctId) return;

    // The client routes through the /ingest proxy to dodge ad blockers;
    // server-to-server goes straight to the ingest host.
    const configuredHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
    const host = (configuredHost || 'https://us.i.posthog.com').replace(/\/+$/, '');

    const safeProps: Record<string, unknown> = {};
    Object.entries(properties ?? {}).forEach(([key, value]) => {
      if (!piiKeyPattern.test(key)) safeProps[key] = value;
    });

    const response = await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event: eventName,
        distinct_id: distinctId,
        properties: { ...safeProps, source: 'agentforlife_server' },
        timestamp: new Date().toISOString(),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
    });

    if (!response.ok) {
      // NOTE: PostHog returns 200 even for unknown tokens (the silent-drop
      // outage), so a non-OK here means host/network trouble, not a bad key.
      console.warn('[posthog-server] capture non-OK', {
        event: eventName,
        status: response.status,
      });
    }
  } catch (err) {
    console.warn('[posthog-server] capture failed (non-blocking)', {
      event: eventName,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
