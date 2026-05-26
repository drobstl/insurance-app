/**
 * Anniversary date math, shared by client UI (`policyUtils.tsx`) and
 * server cron handlers (`/api/cron/policy-review`). Pure functions only —
 * no React, no firebase imports — so the file is safe to use from
 * Edge/Node runtimes.
 *
 * Annual cadence: a policy's anniversary fires once per year, every year,
 * starting at the 1-year mark. Year N is `effectiveYear + N`.
 */

/**
 * Lookback (in days) used when rolling forward from a just-passed
 * anniversary to the next year. Must be at least as large as the
 * most-negative `daysUntil` any consumer cares about — the
 * `/api/cron/policy-review` Day +1 window reaches `daysUntil = -2`, so 3
 * gives a day of safety before we advance past it.
 */
export const ANNIVERSARY_LOOKBACK_DAYS = 3;

/**
 * Compute the upcoming anniversary for a policy that started on
 * `policyStart`, relative to `now` (defaults to current time). Returns
 * the anniversary Date and the year N (1 = first anniversary, 2 = second,
 * etc). N is clamped to ≥ 1 so brand-new policies never fire before the
 * 1-year mark.
 *
 * The "next" anniversary is the anniversary on or after
 * `now − ANNIVERSARY_LOOKBACK_DAYS` — i.e. we keep showing the just-passed
 * anniversary for a couple of days (so the cron's Day +1 outreach window
 * still resolves), then roll forward.
 *
 * Note on Feb 29: JS `setFullYear` normalizes to Mar 1 in non-leap years.
 * That's the desired behavior here — the anniversary just observes on
 * Mar 1 in non-leap years.
 */
export function getNextAnniversary(
  policyStart: Date,
  now: Date = new Date(),
): { date: Date; year: number } {
  const startYear = policyStart.getFullYear();
  let n = Math.max(now.getFullYear() - startYear, 1);

  const anniversary = new Date(policyStart);
  anniversary.setFullYear(startYear + n);

  const daysUntil =
    (anniversary.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntil < -ANNIVERSARY_LOOKBACK_DAYS) {
    n += 1;
    anniversary.setFullYear(startYear + n);
  }

  return { date: anniversary, year: n };
}
