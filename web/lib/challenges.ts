/**
 * Today's Challenge — pure target / streak math.
 *
 * Self-competition gamification: "beat the dials you made yesterday"
 * (daily) and "beat last week" (weekly). This module is intentionally
 * PURE (no Firestore, no `server-only`) so the bucketing + target logic
 * is unit-testable with synthetic counts. The Firestore read + day
 * bucketing lives in `challenge-stats.ts`; the API/UI consume the
 * results here.
 *
 * Design decisions (locked with Daniel, Jun 30):
 *  - Daily target = literal "beat yesterday" (the agent's last ACTIVE
 *    day, skipping days off), framed "1% better than yesterday".
 *  - A FLOOR guards cold starts: if the last active day was below it,
 *    fall back to a round FIXED goal instead of "beat 0 → make 1 dial".
 *  - A CLIMB CAP keeps a freak big day from setting an impossible bar:
 *    the bar can't exceed ~recentAvg × 1.2 ("1% better, not 100%").
 *  - Streak = a "hot streak" (consecutive active days each beat the
 *    prior active day). Meant to be hard + rare; resets clean, no shame.
 *
 * v1 ships the `dials` metric only; the result shapes are metric-generic
 * so other catalog metrics (conversations, leads worked, appointments,
 * …) graduate as one-line additions later.
 */

export type ChallengeMetric = 'dials';

/** Tuning knobs — kept here so they're easy to find + test. */
export const DAILY_FLOOR = 5; // last active day below this → fixed goal
export const DAILY_FIXED_GOAL = 20; // round cold-start daily target
export const CLIMB_CAP_PCT = 0.2; // daily bar ≤ recentAvg × (1 + this)
export const WEEK_FLOOR = 20; // last week below this → fixed weekly goal
export const WEEK_FIXED_GOAL = 100; // round cold-start weekly target

export interface ChallengeResult {
  metric: ChallengeMetric;
  /** Count so far in the current window (today / this week). */
  current: number;
  /** The number being beaten — last active day / last week. */
  previous: number;
  /** Count the agent must HIT to win (previous + 1, or the fixed goal). */
  target: number;
  /** True when the target is a round cold-start goal, not "beat your X". */
  isFixedGoal: boolean;
  /** current >= target. */
  won: boolean;
  /** Remaining to hit the target (0 once won). */
  toGo: number;
}

export interface StreakResult {
  /** Consecutive active days each beating the prior active day. */
  current: number;
}

/**
 * Dial-outcome vocabulary — mirrors the locked set persisted by
 * `/api/leads/[leadId]/dials`. Kept in this pure (client + server safe)
 * module so the session aggregation and the recap UI share one source of
 * truth. Order here is the recap's display priority (money first).
 */
export const DIAL_OUTCOMES = [
  'booked',
  'callback_requested',
  'left_vm',
  'no_answer',
  'wrong_number',
  'not_interested',
  'do_not_call',
] as const;
export type DialOutcome = (typeof DIAL_OUTCOMES)[number];
/** Per-outcome dial counts within a Power Hour session window. */
export type SessionOutcomeCounts = Partial<Record<DialOutcome, number>>;

export interface ChallengeProgress {
  daily: ChallengeResult;
  weekly: ChallengeResult;
  streak: StreakResult;
  /**
   * Power Hour session count — present only when the request carried a
   * session start. The timer + pace live client-side; the server just
   * counts dials logged since the session began. `byOutcome` breaks that
   * session total down for the end-of-session recap.
   */
  session?: { current: number; byOutcome?: SessionOutcomeCounts };
  /** Server clock (epoch ms) the progress was computed at. */
  generatedAt: number;
}

function clampNonNeg(n: number): number {
  return n < 0 ? 0 : n;
}

/**
 * Daily challenge from raw counts.
 * @param today        dials logged so far today (agent-local day)
 * @param lastActive   dials on the most recent day with any activity
 * @param recentAvg    mean dials across recent active days (climb cap)
 */
export function computeDailyChallenge(
  today: number,
  lastActive: number,
  recentAvg: number,
): ChallengeResult {
  let target: number;
  let isFixedGoal: boolean;
  if (lastActive < DAILY_FLOOR) {
    // No real signal to beat yet — give a round, achievable goal.
    target = DAILY_FIXED_GOAL;
    isFixedGoal = true;
  } else {
    // Beat yesterday, but cap how high a single freak day can push the
    // bar so the streak doesn't die to one monster session.
    const cappedBase =
      recentAvg > 0
        ? Math.min(lastActive, Math.round(recentAvg * (1 + CLIMB_CAP_PCT)))
        : lastActive;
    target = cappedBase + 1;
    isFixedGoal = false;
  }
  const won = today >= target;
  return {
    metric: 'dials',
    current: today,
    previous: lastActive,
    target,
    isFixedGoal,
    won,
    toGo: clampNonNeg(target - today),
  };
}

/** Weekly challenge from raw counts. No climb cap — weeks are less spiky. */
export function computeWeeklyChallenge(
  thisWeek: number,
  lastWeek: number,
): ChallengeResult {
  let target: number;
  let isFixedGoal: boolean;
  if (lastWeek < WEEK_FLOOR) {
    target = WEEK_FIXED_GOAL;
    isFixedGoal = true;
  } else {
    target = lastWeek + 1;
    isFixedGoal = false;
  }
  const won = thisWeek >= target;
  return {
    metric: 'dials',
    current: thisWeek,
    previous: lastWeek,
    target,
    isFixedGoal,
    won,
    toGo: clampNonNeg(target - thisWeek),
  };
}

/**
 * Hot streak from a most-recent-first list of ACTIVE-day counts.
 *
 * The caller includes today as the first element ONLY if today already
 * won (so an in-progress, not-yet-won day doesn't flicker the streak).
 * A day "wins" when it out-dialed the prior active day; the streak is
 * the unbroken run of such wins ending at the most recent active day.
 */
export function computeStreak(activeDayCountsDesc: number[]): number {
  let streak = 0;
  for (let i = 0; i < activeDayCountsDesc.length - 1; i++) {
    if (activeDayCountsDesc[i] > activeDayCountsDesc[i + 1]) streak++;
    else break;
  }
  return streak;
}
