/**
 * Maintenance mode helpers.
 *
 * SOURCE OF TRUTH: Daniel's May 6, 2026 evening decision — formal
 * "we'll be right back" maintenance window from now through Tuesday
 * May 12 morning, framed around the Linq line health rebuild. Read-
 * only access for agents (login works, dashboard reads work, every
 * mutation API + every cron is short-circuited).
 *
 * - The agent dashboard polls /api/system/maintenance-status on mount
 *   and renders <MaintenanceBanner /> when readOnly === true.
 * - Edge middleware (web/middleware.ts) intercepts /api/* requests
 *   and returns 503 for non-GET requests outside the allowlist, and
 *   returns 200 `{ skipped: true, reason: 'maintenance' }` for every
 *   /api/cron/* invocation so Vercel Cron sees a clean success but
 *   the cron handler never runs.
 * - The relaunch is a single Vercel env-var flip (set
 *   MAINTENANCE_MODE_READONLY=false → redeploy → window lifts).
 *
 * NOTE: this lives in `web/lib/` (not `web/lib/server/`) and uses NO
 * server-only imports because it is consumed by edge middleware,
 * which runs in a constrained runtime. Keep it dependency-free.
 */

export const MAINTENANCE_RELAUNCH_LABEL = 'Tuesday, May 12';

export const MAINTENANCE_BANNER_MESSAGE =
  `We're rebuilding AFL — back ${MAINTENANCE_RELAUNCH_LABEL}.`;

export const MAINTENANCE_503_MESSAGE =
  `AFL is in read-only mode while we rebuild — back ${MAINTENANCE_RELAUNCH_LABEL}.`;

/**
 * True iff the platform is currently in read-only maintenance mode.
 * Set MAINTENANCE_MODE_READONLY=true in Vercel env to enable.
 */
export function isMaintenanceModeReadOnly(): boolean {
  const raw = process.env.MAINTENANCE_MODE_READONLY;
  if (typeof raw !== 'string') return false;
  return raw.trim().toLowerCase() === 'true';
}

/**
 * Routes that are EXEMPT from middleware mutation-blocking even
 * during read-only maintenance. Each entry is a path PREFIX matched
 * against the request URL pathname.
 *
 * Why each one is on the list:
 * - /api/system/maintenance-status — the dashboard polls this to
 *   render the banner; obviously must work.
 * - /api/health — uptime monitors hit this; must work.
 * - /api/linq/webhook — inbound from Linq. The kill switch
 *   intentionally doesn't gate inbound (e017d55) and neither does
 *   maintenance mode. Inbound activation events from clients tapping
 *   Activate must continue to land so funnel telemetry is accurate.
 * - /api/push-token/register — the mobile client app calls this on
 *   foreground. Doesn't trigger any outbound; safe to allow.
 * - /api/mobile/* — the mobile app's lookup-client-code, agent-
 *   extras, etc. Must continue to work or clients can't even open
 *   the app to reach the Activate screen.
 */
const MAINTENANCE_ALLOWLIST: readonly string[] = [
  '/api/system/maintenance-status',
  '/api/health',
  '/api/linq/webhook',
  '/api/push-token/register',
  '/api/mobile/',
];

/**
 * True iff the given pathname is exempt from the mutation block.
 */
export function isMaintenanceAllowedPath(pathname: string): boolean {
  for (const prefix of MAINTENANCE_ALLOWLIST) {
    if (pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * True iff the given HTTP method is read-only and therefore exempt
 * from the maintenance mutation block. GET and HEAD pass through;
 * POST/PUT/PATCH/DELETE are blocked.
 *
 * Note: some POST routes are technically "reads" (e.g. mark-viewed
 * counters). For the maintenance window we treat ALL non-allowlist
 * POSTs as mutations. The dashboard surfaces those as 503 toasts;
 * the banner makes the cause obvious. Cleaner than maintaining a
 * second allowlist for "read-style POSTs."
 */
export function isMaintenanceReadOnlyMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}
