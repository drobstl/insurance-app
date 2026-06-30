'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import confetti from 'canvas-confetti';
import { useDashboard } from '../app/dashboard/DashboardContext';
import { useChallengeProgress } from '../lib/useChallengeProgress';
import { usePowerHour } from '../lib/usePowerHour';
import { CHALLENGE_COLORS as C } from '../lib/challenge-theme';
import ChallengeRing from './ChallengeRing';

/**
 * Today's Challenge — leads / Call-mode Scoreboard. The bold, standout
 * surface: a dark navy tile that deliberately breaks from the white leads
 * list. It doubles as the Power Hour dial timer.
 *
 *  - Idle: dual rings (outer = today's dials vs. yesterday, inner = this
 *    week vs. last week) + a Power Hour start row.
 *  - Running: the rings become a focus timer (gold = time left, mint =
 *    session dials) with live pace.
 *  - Win: a single mint flip + one confetti burst per local day.
 *
 * `refreshSignal` is bumped by the leads page after each logged dial so
 * the rings move in near-real-time without sockets.
 */

const DURATIONS = [30, 60, 90] as const;

/** prefers-reduced-motion (SSR-safe). */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

function mmss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Agent-local YYYY-MM-DD, for once-per-day confetti de-dup. */
function localDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export default function ChallengeScoreboard({ refreshSignal }: { refreshSignal?: number }) {
  const { user } = useDashboard();
  const ph = usePowerHour(user?.uid ?? null);
  const { progress } = useChallengeProgress(user, ph.startedAt, refreshSignal);
  const reduced = useReducedMotion();

  const prevWonRef = useRef(false);

  // One confetti burst when the daily challenge first crosses today, at
  // most once per local day (survives refresh via localStorage).
  useEffect(() => {
    if (!progress || !user) return;
    const won = progress.daily.won;
    const wasWon = prevWonRef.current;
    prevWonRef.current = won;
    if (!won || wasWon) return;
    if (reduced) return;
    const key = `afl-challenge-celebrated-${user.uid}`;
    try {
      if (localStorage.getItem(key) === localDateKey()) return;
      localStorage.setItem(key, localDateKey());
    } catch {
      /* ignore */
    }
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: [C.mint, C.gold, C.sky, C.green] });
    confetti({ particleCount: 60, spread: 100, origin: { y: 0.5 }, colors: [C.mint, C.gold] });
  }, [progress, user, reduced]);

  if (!progress) return null;
  const { daily, weekly, streak } = progress;

  const streakChip =
    streak.current > 0 ? (
      <span
        className="text-[12px] font-semibold rounded-full px-2.5 py-0.5 self-start whitespace-nowrap"
        style={{ background: C.gold, color: C.textOnNeon }}
      >
        🔥 {streak.current} day streak
      </span>
    ) : null;

  const active = ph.status === 'running' || ph.status === 'paused';
  const sessionDials = progress.session?.current ?? 0;

  // ── Power Hour: running / paused / expired ──
  if (active) {
    const timePct = ph.durationMs > 0 ? ph.remainingMs / ph.durationMs : 0;
    const elapsedFrac = ph.durationMs > 0 ? ph.elapsedMs / ph.durationMs : 0;
    // Project end-of-session pace once there's enough signal (~2 min in).
    const pace = ph.elapsedMs > 120_000 && elapsedFrac > 0 ? Math.round(sessionDials / elapsedFrac) : null;
    const beatsYesterday = pace != null && pace > daily.previous;

    return (
      <div
        className="rounded-2xl p-5 mb-4 flex items-center gap-4"
        style={{ background: C.stage, border: `1px solid ${ph.expired ? C.mint : C.gold}` }}
      >
        <ChallengeRing
          size={130}
          outer={{ pct: timePct, color: C.gold }}
          inner={{ pct: daily.target > 0 ? sessionDials / daily.target : 0, color: C.mint }}
          centerTop={ph.expired ? 'Time!' : mmss(ph.remainingMs)}
          centerBottom={ph.expired ? undefined : 'left'}
          centerTopColor={ph.expired ? C.mint : C.white}
          mono={!ph.expired}
        />
        <div className="flex flex-col gap-2 min-w-0">
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: C.gold }}>
            POWER HOUR · {ph.status === 'paused' ? 'PAUSED' : ph.expired ? 'DONE' : 'LIVE'}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold" style={{ color: C.mint }}>
              {sessionDials}
            </span>
            <span className="text-[12px]" style={{ color: C.textMuted }}>
              dials this session
            </span>
          </div>
          {ph.expired ? (
            <p className="text-[13px]" style={{ color: C.textMuted }}>
              {sessionDials} dials in {Math.round(ph.durationMs / 60000)} min. Nice block.
            </p>
          ) : pace != null ? (
            <p className="text-[13px]" style={{ color: C.white }}>
              On pace for <span style={{ color: C.mint, fontWeight: 600 }}>{pace}</span>
              {beatsYesterday ? ' — beats ' + daily.previous : ''}
            </p>
          ) : (
            <p className="text-[13px]" style={{ color: C.textMuted }}>
              Dial away — we&apos;re counting.
            </p>
          )}
          {streakChip}
          <div className="flex gap-3 mt-0.5">
            {ph.expired ? (
              <button onClick={ph.end} className="text-[12px] font-semibold" style={{ color: C.mint }}>
                Done
              </button>
            ) : (
              <>
                {ph.status === 'running' ? (
                  <button onClick={ph.pause} className="text-[12px]" style={{ color: C.textMuted }}>
                    ⏸ Pause
                  </button>
                ) : (
                  <button onClick={ph.resume} className="text-[12px]" style={{ color: C.mint }}>
                    ▶ Resume
                  </button>
                )}
                <button onClick={ph.end} className="text-[12px]" style={{ color: C.textMuted }}>
                  End session
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Idle: challenge rings + Power Hour start ──
  const dailyPct = daily.target > 0 ? daily.current / daily.target : 0;
  const weeklyPct = weekly.target > 0 ? weekly.current / weekly.target : 0;

  return (
    <div
      className="rounded-2xl p-5 mb-4 flex flex-col sm:flex-row items-center gap-5"
      style={{ background: C.stage, border: `1px solid ${daily.won ? C.mint : C.border}` }}
    >
      <ChallengeRing
        size={130}
        outer={{ pct: dailyPct, color: C.mint }}
        inner={{ pct: weeklyPct, color: C.softTeal }}
        centerTop={String(daily.current)}
        centerBottom={daily.won ? 'beat it' : `of ${daily.target}`}
        centerTopColor={daily.won ? C.mint : C.white}
      />

      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: C.sky }}>
            TODAY&apos;S CHALLENGE
          </span>
          {streakChip}
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

        <p className="text-[12px]" style={{ color: C.textMuted }}>
          This week {weekly.current} · {weekly.won ? 'beat last week!' : `beat ${weekly.target}`}
        </p>

        {/* Power Hour start */}
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <span className="text-[12px]" style={{ color: C.textMuted }}>
            Power hour
          </span>
          {DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => ph.start(d)}
              className="text-[12px] font-semibold rounded-lg px-3 py-1.5"
              style={{ background: C.track, color: C.mint, border: `1px solid ${C.border}` }}
            >
              {d} min
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
