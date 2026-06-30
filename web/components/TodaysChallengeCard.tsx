'use client';

import { useDashboard } from '../app/dashboard/DashboardContext';
import { useChallengeProgress } from '../lib/useChallengeProgress';
import { CHALLENGE_COLORS as C } from '../lib/challenge-theme';
import ChallengeRing from './ChallengeRing';

/**
 * Today's Challenge — homepage card. The calmer of the two surfaces:
 * ambient momentum the moment the agent logs in. The bold ring +
 * Power Hour timer live on the leads Scoreboard (ChallengeScoreboard).
 *
 * Self-hides until progress loads (no skeleton flash on the home hero).
 * The parent gates mounting on CHALLENGES_ENABLED.
 */
export default function TodaysChallengeCard() {
  const { user } = useDashboard();
  const { progress } = useChallengeProgress(user);

  if (!progress) return null;

  const { daily, weekly, streak } = progress;
  const dailyPct = daily.target > 0 ? daily.current / daily.target : 0;
  const weeklyPct = weekly.target > 0 ? weekly.current / weekly.target : 0;

  return (
    <div
      className="w-fit max-w-full rounded-2xl p-4 sm:p-5 mt-2 mb-6 flex items-center gap-4 sm:gap-5"
      style={{ background: C.stage, border: `1px solid ${daily.won ? C.mint : C.border}` }}
    >
      <ChallengeRing
        size={96}
        outer={{ pct: dailyPct, color: daily.won ? C.mint : C.mint }}
        inner={{ pct: weeklyPct, color: C.softTeal }}
        centerTop={String(daily.current)}
        centerBottom={daily.won ? 'beat it' : `of ${daily.target}`}
        centerTopColor={daily.won ? C.mint : C.white}
      />

      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: C.sky }}>
            TODAY&apos;S CHALLENGE
          </span>
          {streak.current > 0 && (
            <span
              className="text-[12px] font-semibold rounded-full px-2.5 py-0.5"
              style={{ background: C.gold, color: C.textOnNeon }}
            >
              🔥 {streak.current} day streak
            </span>
          )}
        </div>

        {daily.won ? (
          <p className="text-lg font-semibold" style={{ color: C.white }}>
            Beat it.{' '}
            <span style={{ color: C.textMuted }}>
              {daily.isFixedGoal ? 'Goal cleared' : `+${daily.current - daily.previous} over yesterday`}
            </span>
          </p>
        ) : (
          <p className="text-lg font-semibold" style={{ color: C.white }}>
            {daily.isFixedGoal ? `Make ${daily.target} dials` : 'Beat yesterday'}
            <span style={{ color: C.textMuted }}> · {daily.toGo} to go</span>
          </p>
        )}

        <p className="text-[13px]" style={{ color: C.textMuted }}>
          1% better than yesterday
        </p>

        {/* Weekly slim row */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[12px]" style={{ color: C.textMuted, minWidth: 62 }}>
            This week
          </span>
          <div className="rounded-full overflow-hidden h-2" style={{ background: C.track, width: 90 }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, weeklyPct * 100)}%`, background: C.softTeal }}
            />
          </div>
          <span className="text-[12px] font-semibold" style={{ color: C.white }}>
            {weekly.current} · {weekly.won ? 'beat!' : `beat ${weekly.target}`}
          </span>
        </div>
      </div>
    </div>
  );
}
