'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import confetti from 'canvas-confetti';
import { useDashboard } from '../app/dashboard/DashboardContext';
import { useChallengeProgress } from '../lib/useChallengeProgress';
import { usePowerHour } from '../lib/usePowerHour';
import { useCountUp } from '../lib/useCountUp';
import { CHALLENGE_COLORS as C } from '../lib/challenge-theme';
import ChallengeRing from './ChallengeRing';
import StreakFlame from './StreakFlame';
import ChallengeRecap, { type SessionRecapData } from './ChallengeRecap';

/**
 * Today's Challenge — leads / Call-mode Scoreboard. The bold surface: a
 * dark TEAL tile (not navy — keeps it in the app's teal world) that
 * breaks from the white leads list. Vibrancy lives in the bright ring +
 * warm streak flame (research-backed, Jun 30); it doubles as the Power
 * Hour dial timer.
 *
 *  - Idle: dual rings (outer = today vs yesterday, inner = week) + the
 *    Power Hour start row.
 *  - Running: rings become a focus timer (gold = time left, bright =
 *    session dials) with live pace.
 *  - Win: card pops + one confetti burst per local day (gold/coral/mint).
 *
 * `refreshSignal` is bumped by the leads page after each logged dial so
 * the rings move in near-real-time.
 */

const DURATIONS = [30, 60, 90] as const;

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
  const [justWon, setJustWon] = useState(false);
  // Ephemeral end-of-session recap (cleared on dismiss; not persisted).
  const [recap, setRecap] = useState<SessionRecapData | null>(null);

  const dailyCount = useCountUp(progress?.daily.current ?? 0);
  // Roll the session count so the optimistic tick moves smoothly.
  const sessionCount = useCountUp(progress?.session?.current ?? 0, 700);

  useEffect(() => {
    if (!progress || !user) return;
    const won = progress.daily.won;
    const wasWon = prevWonRef.current;
    prevWonRef.current = won;
    if (!won || wasWon) return;
    // Card pop + one confetti burst per local day (survives refresh).
    if (!reduced) {
      // Fire the one-shot win pop when the daily challenge flips to won.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setJustWon(true);
      const t = setTimeout(() => setJustWon(false), 600);
      const key = `afl-challenge-celebrated-${user.uid}`;
      let already = false;
      try {
        already = localStorage.getItem(key) === localDateKey();
        if (!already) localStorage.setItem(key, localDateKey());
      } catch {
        /* ignore */
      }
      if (!already) {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: [C.progressBright, C.gold, C.coral] });
        confetti({ particleCount: 60, spread: 100, origin: { y: 0.5 }, colors: [C.gold, C.progressBright] });
      }
      return () => clearTimeout(t);
    }
  }, [progress, user, reduced]);

  // Reserve the card's footprint while progress loads so the leads list
  // below doesn't jump down when it arrives. Mirrors the idle card's flex
  // structure + 130px ring, so the height matches at every breakpoint by
  // construction (on desktop the ring dominates the row height).
  if (!progress) {
    return (
      <div
        className="rounded-2xl p-5 mb-4 flex flex-col sm:flex-row items-center gap-5"
        style={{ background: C.stage, border: `2px solid ${C.stageBorder}`, borderRightWidth: 5, borderBottomWidth: 5 }}
        aria-hidden
      >
        <div className="rounded-full flex-none animate-pulse" style={{ width: 130, height: 130, background: C.ringTrackDark }} />
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <div className="rounded animate-pulse" style={{ height: 11, width: 120, background: C.ringTrackDark }} />
          <div className="rounded animate-pulse" style={{ height: 20, width: '58%', background: C.ringTrackDark }} />
          <div className="rounded animate-pulse" style={{ height: 12, width: '44%', background: C.ringTrackDark }} />
          <div className="rounded animate-pulse" style={{ height: 30, width: 208, background: C.ringTrackDark }} />
        </div>
      </div>
    );
  }

  const { daily, weekly, streak } = progress;

  const active = ph.status === 'running' || ph.status === 'paused';
  const sessionDials = progress.session?.current ?? 0;
  const popClass = justWon ? 'tc-pop' : '';

  // Assemble the recap from the live session numbers + Power Hour clock.
  // Must run BEFORE ph.end() on a manual end (end() clears the clock).
  const makeRecap = (): SessionRecapData => ({
    dials: sessionDials,
    byOutcome: progress.session?.byOutcome ?? {},
    elapsedMin: Math.max(1, Math.round(ph.elapsedMs / 60_000)),
    paceHr: ph.elapsedMs >= 120_000 ? Math.round(sessionDials / (ph.elapsedMs / 3_600_000)) : null,
    dailyWon: daily.won,
    dailyToGo: daily.toGo,
    prevDay: daily.previous,
    streak: streak.current,
  });

  // A manually-ended session snapshots into `recap`; show it until dismissed.
  if (recap) return <ChallengeRecap data={recap} onDone={() => setRecap(null)} />;

  // ── Power Hour: running / paused ──
  if (active) {
    // Timer ran out → recap takes over the card (session's still live, so
    // read numbers directly); "Done" ends the session and clears it.
    if (ph.expired) return <ChallengeRecap data={makeRecap()} onDone={ph.end} />;

    const timePct = ph.durationMs > 0 ? ph.remainingMs / ph.durationMs : 0;
    const elapsedFrac = ph.durationMs > 0 ? ph.elapsedMs / ph.durationMs : 0;
    const pace = ph.elapsedMs > 120_000 && elapsedFrac > 0 ? Math.round(sessionDials / elapsedFrac) : null;
    const beatsYesterday = pace != null && pace > daily.previous;

    return (
      <div
        className="tc-reveal-fade rounded-2xl p-5 mb-4 flex items-center gap-4"
        style={{ background: C.stage, border: `2px solid ${C.gold}`, borderRightWidth: 5, borderBottomWidth: 5 }}
      >
        <ChallengeRing
          size={130}
          outer={{ pct: timePct, color: C.gold }}
          inner={{ pct: daily.target > 0 ? sessionDials / daily.target : 0, color: C.progressBright }}
          trackColor={C.ringTrackDark}
          centerTop={mmss(ph.remainingMs)}
          centerBottom="left"
          centerTopColor={C.onDark}
          centerBottomColor={C.onDarkMuted}
          mono
        />
        <div className="flex flex-col gap-2 min-w-0">
          <span className="text-[11px] font-bold tracking-wide" style={{ color: C.gold }}>
            POWER HOUR · {ph.status === 'paused' ? 'PAUSED' : 'LIVE'}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold" style={{ color: C.progressBright }}>
              {sessionCount}
            </span>
            <span className="text-[12px]" style={{ color: C.onDarkMuted }}>
              dials this session
            </span>
          </div>
          {pace != null ? (
            <p className="text-[13px]" style={{ color: C.onDark }}>
              On pace for <span style={{ color: C.progressBright, fontWeight: 700 }}>{pace}</span>
              {beatsYesterday ? ' — beats ' + daily.previous : ''}
            </p>
          ) : (
            <p className="text-[13px]" style={{ color: C.onDarkMuted }}>
              Dial away — we&apos;re counting.
            </p>
          )}
          <StreakFlame count={streak.current} variant="dark" />
          <div className="flex gap-3 mt-0.5">
            {ph.status === 'running' ? (
              <button onClick={ph.pause} className="text-[12px]" style={{ color: C.onDarkMuted }}>
                ⏸ Pause
              </button>
            ) : (
              <button onClick={ph.resume} className="text-[12px]" style={{ color: C.progressBright }}>
                ▶ Resume
              </button>
            )}
            <button
              onClick={() => {
                setRecap(makeRecap());
                ph.end();
              }}
              className="text-[12px]"
              style={{ color: C.onDarkMuted }}
            >
              End session
            </button>
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
      className={`tc-reveal-fade rounded-2xl p-5 mb-4 flex flex-col sm:flex-row items-center gap-5 ${popClass}`}
      style={{ background: C.stage, border: `2px solid ${daily.won ? C.gold : C.stageBorder}`, borderRightWidth: 5, borderBottomWidth: 5 }}
    >
      <ChallengeRing
        size={130}
        outer={{ pct: dailyPct, color: C.progressBright }}
        inner={{ pct: weeklyPct, color: C.weeklyDark }}
        trackColor={C.ringTrackDark}
        centerTop={String(dailyCount)}
        centerBottom={daily.won ? 'beat it' : `of ${daily.target}`}
        centerTopColor={daily.won ? C.progressBright : C.onDark}
        centerBottomColor={C.onDarkMuted}
        animate
        liveDot={!daily.won}
        heartbeat
      />

      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold tracking-wide" style={{ color: C.labelMint }}>
            TODAY&apos;S CHALLENGE
          </span>
          <StreakFlame count={streak.current} variant="dark" />
        </div>

        {daily.won ? (
          <p className="text-lg font-bold" style={{ color: C.onDark }}>
            Beat it.{' '}
            <span style={{ color: C.onDarkMuted }}>
              {daily.isFixedGoal ? 'Goal cleared' : `+${daily.current - daily.previous} over yesterday`}
            </span>
          </p>
        ) : (
          <p className="text-lg font-bold" style={{ color: C.onDark }}>
            {daily.isFixedGoal ? `Make ${daily.target} dials` : 'Beat yesterday'}
            <span style={{ color: C.onDarkMuted }}> · {daily.toGo} to go</span>
          </p>
        )}

        <p className="text-[12px]" style={{ color: C.onDarkMuted }}>
          This week {weekly.current} · {weekly.won ? 'beat last week!' : `beat ${weekly.target}`}
        </p>

        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <span className="text-[12px]" style={{ color: C.onDarkMuted }}>
            Power hour
          </span>
          {DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => ph.start(d)}
              className="text-[12px] font-bold rounded-lg px-3 py-1.5"
              style={{ background: C.ringTrackDark, color: C.progressBright, border: `1px solid ${C.stageBorder}` }}
            >
              {d} min
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
