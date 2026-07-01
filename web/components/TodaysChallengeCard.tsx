'use client';

import { useDashboard } from '../app/dashboard/DashboardContext';
import { useChallengeProgress } from '../lib/useChallengeProgress';
import { useCountUp } from '../lib/useCountUp';
import { CHALLENGE_COLORS as C } from '../lib/challenge-theme';
import ChallengeRing from './ChallengeRing';
import StreakFlame from './StreakFlame';

/**
 * Today's Challenge — home card. The calm surface (white stitched card,
 * cohesive with the rest of the home) with the vibrancy concentrated on
 * the green progress ring + the warm streak flame (research-backed, Jun
 * 30). Entrance energy: the ring draws and the number counts up on load,
 * a live dot rides the ring edge, and the ring heartbeats every ~6s.
 * Self-hides until progress loads. Parent gates on CHALLENGES_ENABLED.
 */
export default function TodaysChallengeCard() {
  const { user } = useDashboard();
  const { progress } = useChallengeProgress(user);
  const count = useCountUp(progress?.daily.current ?? 0);

  if (!progress) return null;

  const { daily, weekly, streak } = progress;
  const dailyPct = daily.target > 0 ? daily.current / daily.target : 0;
  const weeklyPct = weekly.target > 0 ? weekly.current / weekly.target : 0;

  return (
    <div
      className="h-full w-full rounded-2xl p-4 sm:p-5 flex items-center gap-4"
      style={{ background: C.homeCardBg, border: `2px solid ${C.homeBorder}`, borderRightWidth: 5, borderBottomWidth: 5 }}
    >
      <ChallengeRing
        size={92}
        outer={{ pct: dailyPct, color: C.progress }}
        trackColor={C.ringTrackLight}
        centerTop={String(count)}
        centerBottom={daily.won ? 'beat it' : `of ${daily.target}`}
        centerTopColor={C.numberDark}
        centerBottomColor={C.mutedTeal}
        animate
        liveDot={!daily.won}
        heartbeat
      />

      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="text-[10px] font-bold tracking-wide" style={{ color: C.labelTeal }}>
          TODAY&apos;S CHALLENGE
        </div>
        {daily.won ? (
          <p className="text-[15px] font-bold" style={{ color: C.textDark }}>
            Beat it.{' '}
            <span style={{ color: C.mutedTeal }}>
              {daily.isFixedGoal ? 'Goal cleared' : `+${daily.current - daily.previous} over yesterday`}
            </span>
          </p>
        ) : (
          <p className="text-[15px] font-bold" style={{ color: C.textDark }}>
            {daily.isFixedGoal ? `Make ${daily.target} dials` : 'Beat yesterday'}
            <span style={{ color: C.mutedTeal }}> · {daily.toGo} to go</span>
          </p>
        )}
        <p className="text-[12px]" style={{ color: C.mutedTeal }}>
          1% better than yesterday
        </p>
        <StreakFlame count={streak.current} variant="light" />

        {/* Weekly slim bar */}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px]" style={{ color: C.mutedTeal, minWidth: 58 }}>
            This week
          </span>
          <div className="rounded-full overflow-hidden h-1.5" style={{ background: C.ringTrackLight, width: 82 }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, weeklyPct * 100)}%`, background: C.weeklyLight }} />
          </div>
          <span className="text-[11px] font-bold" style={{ color: C.textDark }}>
            {weekly.won ? 'beat!' : weekly.current}
          </span>
        </div>
      </div>
    </div>
  );
}
