import 'server-only';

import { getAdminFirestore } from './firebase-admin';
import {
  computeDailyChallenge,
  computeWeeklyChallenge,
  computeStreak,
  type ChallengeProgress,
} from './challenges';

/**
 * Today's Challenge — server aggregation.
 *
 * Walks the agent's leads once and buckets `dialLog[].at` by the
 * agent's LOCAL day (the client passes its UTC offset), then runs the
 * pure target/streak math in `challenges.ts`.
 *
 * Why local-day bucketing (and not the UTC windows in
 * `activity-stats.ts`): a *live daily* "beat yesterday" challenge that
 * reset at UTC midnight would roll over mid-evening for US agents
 * (8pm PT ≈ next UTC day), splitting one dialing session across two
 * "days". Bucketing by the agent's local day makes the reset land at
 * their real midnight.
 *
 * Computed on-demand, no rollup docs — same posture as
 * `getActivityStats`. If per-agent lead counts climb past a few hundred
 * and this feels slow, denormalize daily dial counts to
 * `agents/{uid}/challengeDays/{localYYYY-MM-DD}` and read those instead;
 * the result shape stays identical.
 */

const DAY_MS = 86_400_000;
const STREAK_LOOKBACK_DAYS = 40;
const RECENT_AVG_DAYS = 14;
const LAST_ACTIVE_LOOKBACK_DAYS = 21;

interface DialEntry {
  at?: unknown;
  outcome?: string;
}

/** Best-effort millis from the several shapes `dialLog[].at` can take. */
function dialMillis(at: unknown): number | null {
  if (at == null) return null;
  if (typeof at === 'number') return at;
  if (at instanceof Date) return at.getTime();
  if (typeof at === 'object') {
    const o = at as { toMillis?: () => number; _seconds?: number };
    if (typeof o.toMillis === 'function') return o.toMillis();
    if (typeof o._seconds === 'number') return o._seconds * 1000;
  }
  return null;
}

export interface ChallengeStatsOptions {
  /** `new Date().getTimezoneOffset()` from the client (minutes; +420 = PDT). */
  tzOffsetMinutes: number;
  /** Power Hour session start (epoch ms) — when set, returns `session`. */
  sessionStartMs?: number | null;
  /** Server clock injection point for tests. */
  now?: Date;
}

export async function getChallengeProgress(
  agentId: string,
  opts: ChallengeStatsOptions,
): Promise<ChallengeProgress> {
  const tzMs = opts.tzOffsetMinutes * 60_000;
  const nowMs = (opts.now ?? new Date()).getTime();
  const sessionStartMs =
    typeof opts.sessionStartMs === 'number' && Number.isFinite(opts.sessionStartMs)
      ? opts.sessionStartMs
      : null;

  /** Floor a UTC-ms instant to the agent's local day index. */
  const localDayIndex = (ms: number): number => Math.floor((ms - tzMs) / DAY_MS);
  const todayIdx = localDayIndex(nowMs);

  const perDay = new Map<number, number>();
  let sessionCount = 0;

  const leadsSnap = await getAdminFirestore()
    .collection('agents')
    .doc(agentId)
    .collection('leads')
    .get();

  for (const leadDoc of leadsSnap.docs) {
    const data = leadDoc.data() as { dialLog?: DialEntry[] };
    if (!Array.isArray(data.dialLog)) continue;
    for (const entry of data.dialLog) {
      const ms = dialMillis(entry?.at);
      if (ms === null) continue;
      const idx = localDayIndex(ms);
      perDay.set(idx, (perDay.get(idx) ?? 0) + 1);
      if (sessionStartMs !== null && ms >= sessionStartMs && ms <= nowMs) {
        sessionCount++;
      }
    }
  }

  const todayCount = perDay.get(todayIdx) ?? 0;

  // Most recent day with any activity (skip days off so Monday beats
  // Friday, not Sunday).
  let lastActiveCount = 0;
  for (let d = todayIdx - 1; d >= todayIdx - LAST_ACTIVE_LOOKBACK_DAYS; d--) {
    const c = perDay.get(d) ?? 0;
    if (c > 0) {
      lastActiveCount = c;
      break;
    }
  }

  // Average across recent active days (excluding today) for the climb cap.
  let recentSum = 0;
  let recentDays = 0;
  for (let d = todayIdx - 1; d >= todayIdx - RECENT_AVG_DAYS; d--) {
    const c = perDay.get(d) ?? 0;
    if (c > 0) {
      recentSum += c;
      recentDays++;
    }
  }
  const recentAvg = recentDays > 0 ? recentSum / recentDays : 0;

  const daily = computeDailyChallenge(todayCount, lastActiveCount, recentAvg);

  // Week = agent-local week starting Sunday. Day index 0 (1970-01-01) was
  // a Thursday, so day-of-week = (idx + 4) mod 7 with 0 = Sunday.
  const dow = (((todayIdx + 4) % 7) + 7) % 7;
  const weekStartIdx = todayIdx - dow;
  let thisWeek = 0;
  for (let d = weekStartIdx; d <= todayIdx; d++) thisWeek += perDay.get(d) ?? 0;
  let lastWeek = 0;
  for (let d = weekStartIdx - 7; d <= weekStartIdx - 1; d++) lastWeek += perDay.get(d) ?? 0;
  const weekly = computeWeeklyChallenge(thisWeek, lastWeek);

  // Streak: most-recent-first active-day counts. Include today only if it
  // already won, so an in-progress day doesn't flicker the streak.
  const activeCountsDesc: number[] = [];
  for (let d = todayIdx; d >= todayIdx - STREAK_LOOKBACK_DAYS; d--) {
    if (d === todayIdx && !daily.won) continue;
    const c = perDay.get(d) ?? 0;
    if (c > 0) activeCountsDesc.push(c);
  }
  const streak = { current: computeStreak(activeCountsDesc) };

  return {
    daily,
    weekly,
    streak,
    ...(sessionStartMs !== null ? { session: { current: sessionCount } } : {}),
    generatedAt: nowMs,
  };
}
