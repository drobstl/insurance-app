import 'server-only';

/**
 * Reactivation fence — defensive backstop on Linq outbound around the
 * May 2026 maintenance window relaunch.
 *
 * Set the env var `REACTIVATION_FENCE_AT` to an ISO 8601 timestamp.
 * Until that timestamp passes, every Linq outbound call (`createChat`,
 * `sendMessage`, `uploadAttachment` in `web/lib/linq.ts`) throws
 * `ReactivationFenceError` BEFORE reaching the Linq API. Webhook
 * handlers that catch the existing `LinqOutboundDisabledError` already
 * handle this class as well (see `welcome-activation-handler.ts`).
 *
 * After the timestamp passes, the fence is naturally inert — no manual
 * unset required. Set it to a future moment you control (e.g. when you
 * intend to allow real outbound), commit, deploy, forget.
 *
 * This is layer #2 of defense against unintended outbound on relaunch.
 * Layer #1 is the existing `LINQ_OUTBOUND_DISABLED` env-var kill switch
 * (see `linq.ts`). The fence catches the class of bug where someone
 * (intentionally or otherwise) flips `LINQ_OUTBOUND_DISABLED=false`
 * before the team is ready to allow outbound.
 */

export class ReactivationFenceError extends Error {
  constructor(fn: string, fenceIso: string) {
    super(
      `Reactivation fence active until ${fenceIso}; refused ${fn}.`,
    );
    this.name = 'ReactivationFenceError';
  }
}

export function getReactivationFenceIso(): string | null {
  const raw = process.env.REACTIVATION_FENCE_AT;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed;
}

/**
 * True iff a fence is configured AND `now < fence`. False if no fence
 * is set, the fence is malformed, or the fence is in the past.
 */
export function isBeforeReactivationFence(now: Date = new Date()): boolean {
  const fenceIso = getReactivationFenceIso();
  if (!fenceIso) return false;
  const fenceMs = new Date(fenceIso).getTime();
  if (Number.isNaN(fenceMs)) return false;
  return now.getTime() < fenceMs;
}

/**
 * Throws `ReactivationFenceError` if the fence is currently active.
 * Intended to be called at the top of every outbound-Linq call site
 * before any user-visible side effects.
 */
export function assertNotBeforeFence(fn: string): void {
  if (!isBeforeReactivationFence()) return;
  const fenceIso = getReactivationFenceIso() || '<unset>';
  console.warn(
    '[reactivation-fence] blocked',
    JSON.stringify({ fn, fenceIso }),
  );
  throw new ReactivationFenceError(fn, fenceIso);
}
