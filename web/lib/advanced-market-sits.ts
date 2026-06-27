// Pure tally for the Advanced Market Sits (FIF reset) per-sit metric.
// No 'server-only' / firebase imports so it stays unit-testable — the
// aggregation in activity-stats.ts hands the plain appointment data in.

export interface AdvancedMarketSitInput {
  status?: string;
  scheduledAt?: unknown;
  fifResetBooked?: boolean | null;
}

export interface AdvancedMarketSitsTally {
  /** Sits whose scheduledAt lands in window (the rate denominator). */
  sits: number;
  /** Of those sits, how many had an advanced-market reset booked. */
  resetsSet: number;
}

// Mirror of SIT_HAPPENED_STATUSES (web/lib/appointments.ts). Kept inline so
// this module has no server-only transitive import. These three statuses
// are very stable; if appointments.ts changes them, update here too.
const SIT_STATUS_SET = new Set<string>(['completed', 'sit_no_sale', 'sit_think_about_it']);

/** Firestore Timestamp ({toMillis}) or raw {_seconds} → epoch ms. */
function toMillis(t: unknown): number | null {
  if (!t || typeof t !== 'object') return null;
  const obj = t as { toMillis?: () => number; _seconds?: number };
  if (typeof obj.toMillis === 'function') return obj.toMillis();
  if (typeof obj._seconds === 'number') return obj._seconds * 1000;
  return null;
}

/**
 * Count, among the sits whose scheduledAt is in [fromMs, toMs), how many had
 * a reset booked. `resetsSet ⊆ sits`, so resetsSet / sits is always in [0,1].
 * This is the per-sit discipline metric ("did you set a reset on this sit");
 * app-driven resets that aren't tied to a sit are tracked separately.
 */
export function tallyAdvancedMarketSitsInWindow(
  appts: AdvancedMarketSitInput[],
  fromMs: number,
  toMs: number,
): AdvancedMarketSitsTally {
  let sits = 0;
  let resetsSet = 0;
  for (const a of appts) {
    if (!a.status || !SIT_STATUS_SET.has(a.status)) continue;
    const ms = toMillis(a.scheduledAt);
    if (ms === null || ms < fromMs || ms >= toMs) continue;
    sits += 1;
    if (a.fifResetBooked === true) resetsSet += 1;
  }
  return { sits, resetsSet };
}
