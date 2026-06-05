/**
 * TCPA quiet-hours send window (recipient-local time).
 *
 * The federal rule (47 CFR 64.1200(c)(1)) and most state mini-TCPAs bar
 * telephone solicitations — texts included — before 8am or after 9pm in
 * the RECIPIENT's local time. AFL's automated SMS lanes (conservation
 * `stage_sms`, referral drip) run on UTC cron schedules with no local-time
 * gate, so a message coming due overnight can land at ~3am local. This
 * module is the gate those senders consult before an automated SMS send.
 *
 * Pure + clock-injectable (`now`) so it is unit-testable with no Firestore.
 *
 * DEFER, DON'T DROP: a caller that gets `allowed: false` should skip the
 * send THIS cron tick and let the next tick retry — the message then goes
 * out at the next polite local hour, nothing is lost.
 *
 * Timezone comes from the recipient's USPS state (`state-timezone.ts`).
 * When the state is unknown (referral prospects carry no address), we fall
 * back to a window that is safe across the entire continental US: allowed
 * only when it's >= the start hour in the latest zone (Pacific) AND < the
 * end hour in the earliest (Eastern). That guarantees a polite local hour
 * anywhere in the lower 48 without knowing exactly where the person is.
 *
 * Scope note: this gate is for AUTOMATED outbound only. Push notifications
 * are intentionally NOT gated here (a push is not a telephone solicitation
 * under the TCPA). Agent-initiated sends from a personal phone are the
 * agent's own act and are likewise out of scope.
 */
import { timeZoneForState } from './state-timezone';

/** Earliest local hour an automated solicitation text may send (8am). */
export const QUIET_HOURS_START_HOUR = 8;
/** Default latest local hour, exclusive (9pm, the federal ceiling). */
export const QUIET_HOURS_END_HOUR = 21;

/**
 * States whose own statutes require a stricter end hour than the federal
 * 9pm. Florida's FTSA window is 8am-8pm. This is a documented starting
 * point — confirm and extend with counsel before relying on it per-state.
 */
const STRICT_END_HOUR_BY_STATE: Record<string, number> = {
  FL: 20,
};

export type QuietHoursReason =
  | 'within_window'
  | 'before_start'
  | 'after_end'
  | 'unknown_zone_blocked'
  | 'check_error_allowed';

export interface QuietHoursResult {
  allowed: boolean;
  reason: QuietHoursReason;
  /** Recipient local hour 0-23 when a zone was known, else null. */
  localHour: number | null;
  /** IANA zone used, or null when the conservative fallback was used. */
  timeZone: string | null;
}

function localHourInZone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const raw = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const h = Number.parseInt(raw, 10);
  if (!Number.isFinite(h)) return 0;
  return h % 24; // some ICU builds render midnight as "24"
}

function endHourForState(stateCode: string | null | undefined, override?: number): number {
  if (typeof override === 'number') return override;
  const key = (stateCode ?? '').trim().toUpperCase();
  return STRICT_END_HOUR_BY_STATE[key] ?? QUIET_HOURS_END_HOUR;
}

/**
 * Is `now` within the allowed send window for a recipient in `stateCode`?
 *
 * FAILS OPEN (allowed: true) on any unexpected internal error, and logs —
 * a bug in a newly added gate must not silently halt all retention
 * outbound. The only inputs are our own state map + standard IANA zones,
 * so the error path is not expected to fire in practice.
 */
export function quietHoursCheck(params: {
  stateCode?: string | null;
  now?: Date;
  startHour?: number;
  endHour?: number;
}): QuietHoursResult {
  const now = params.now ?? new Date();
  const start = params.startHour ?? QUIET_HOURS_START_HOUR;

  try {
    const tz = timeZoneForState(params.stateCode ?? null);
    if (tz) {
      const end = endHourForState(params.stateCode, params.endHour);
      const h = localHourInZone(now, tz);
      if (h < start) return { allowed: false, reason: 'before_start', localHour: h, timeZone: tz };
      if (h >= end) return { allowed: false, reason: 'after_end', localHour: h, timeZone: tz };
      return { allowed: true, reason: 'within_window', localHour: h, timeZone: tz };
    }

    // Unknown zone → continental-US-safe window.
    const end = params.endHour ?? QUIET_HOURS_END_HOUR;
    const hPacific = localHourInZone(now, 'America/Los_Angeles');
    const hEastern = localHourInZone(now, 'America/New_York');
    const allowed = hPacific >= start && hEastern < end;
    return {
      allowed,
      reason: allowed ? 'within_window' : 'unknown_zone_blocked',
      localHour: null,
      timeZone: null,
    };
  } catch (err) {
    console.warn('[quiet-hours] check failed, allowing send (fail-open)', {
      stateCode: params.stateCode ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true, reason: 'check_error_allowed', localHour: null, timeZone: null };
  }
}

/** Convenience boolean wrapper around {@link quietHoursCheck}. */
export function isWithinQuietHoursWindow(stateCode?: string | null, now?: Date): boolean {
  return quietHoursCheck({ stateCode, now }).allowed;
}
