'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Power Hour — a settable dialing-sprint timer for the leads Scoreboard.
 * Agents time-block their dialing; this counts the block down while the
 * Scoreboard counts the dials made in it. State is persisted to
 * localStorage (keyed by uid) so a refresh mid-block resumes — no server
 * writes; the dials themselves already persist on the lead docs.
 *
 * The session window [startedAt, now] is what the challenge API counts
 * dials against (via `sessionStartMs`). Pause freezes the clock by
 * banking elapsed paused time.
 */

export type PowerHourStatus = 'idle' | 'running' | 'paused';

interface StoredSession {
  startedAt: number; // epoch ms the block began
  durationMin: number;
  status: 'running' | 'paused';
  pausedAt: number | null; // when the current pause began (status==='paused')
  bankedPausedMs: number; // total paused time before the current pause
}

export interface PowerHour {
  status: PowerHourStatus;
  /** Session start (epoch ms) to feed the challenge API, or null when idle. */
  startedAt: number | null;
  durationMs: number;
  /** Time left in the block (clamped ≥ 0). */
  remainingMs: number;
  /** Active dialing time elapsed (excludes paused spans). */
  elapsedMs: number;
  /** True once the clock has run out (block complete). */
  expired: boolean;
  start: (durationMin: number) => void;
  pause: () => void;
  resume: () => void;
  end: () => void;
}

function storageKey(uid: string): string {
  return `afl-powerhour-${uid}`;
}

function load(uid: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (typeof s?.startedAt !== 'number' || typeof s?.durationMin !== 'number') return null;
    return s;
  } catch {
    return null;
  }
}

export function usePowerHour(uid: string | null): PowerHour {
  const [session, setSession] = useState<StoredSession | null>(null);
  // Ticking clock — drives remaining/elapsed re-renders while running.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hydrate from storage once we know the uid. localStorage can't be read
  // during render (SSR-safe), and uid can arrive after mount, so this read
  // genuinely belongs in an effect.
  useEffect(() => {
    if (!uid) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe localStorage read
    setSession(load(uid));
  }, [uid]);

  const persist = useCallback(
    (next: StoredSession | null) => {
      setSession(next);
      if (!uid) return;
      try {
        if (next) localStorage.setItem(storageKey(uid), JSON.stringify(next));
        else localStorage.removeItem(storageKey(uid));
      } catch {
        /* ignore quota / private-mode errors */
      }
    },
    [uid],
  );

  // Run a 1s tick only while a session is actively running.
  useEffect(() => {
    const running = session?.status === 'running';
    if (running && !tickRef.current) {
      tickRef.current = setInterval(() => setNowMs(Date.now()), 1000);
    }
    if (!running && tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [session?.status]);

  const start = useCallback(
    (durationMin: number) => {
      persist({
        startedAt: Date.now(),
        durationMin,
        status: 'running',
        pausedAt: null,
        bankedPausedMs: 0,
      });
      setNowMs(Date.now());
    },
    [persist],
  );

  const pause = useCallback(() => {
    setSession((cur) => {
      if (!cur || cur.status !== 'running') return cur;
      const next: StoredSession = { ...cur, status: 'paused', pausedAt: Date.now() };
      if (uid) {
        try {
          localStorage.setItem(storageKey(uid), JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }, [uid]);

  const resume = useCallback(() => {
    setSession((cur) => {
      if (!cur || cur.status !== 'paused') return cur;
      const banked = cur.bankedPausedMs + (cur.pausedAt ? Date.now() - cur.pausedAt : 0);
      const next: StoredSession = { ...cur, status: 'running', pausedAt: null, bankedPausedMs: banked };
      if (uid) {
        try {
          localStorage.setItem(storageKey(uid), JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
    setNowMs(Date.now());
  }, [uid]);

  const end = useCallback(() => persist(null), [persist]);

  if (!session) {
    return {
      status: 'idle',
      startedAt: null,
      durationMs: 0,
      remainingMs: 0,
      elapsedMs: 0,
      expired: false,
      start,
      pause,
      resume,
      end,
    };
  }

  const durationMs = session.durationMin * 60_000;
  const pausedMs =
    session.bankedPausedMs + (session.status === 'paused' && session.pausedAt ? nowMs - session.pausedAt : 0);
  const elapsedMs = Math.max(0, nowMs - session.startedAt - pausedMs);
  const remainingMs = Math.max(0, durationMs - elapsedMs);

  return {
    status: session.status,
    startedAt: session.startedAt,
    durationMs,
    remainingMs,
    elapsedMs,
    expired: remainingMs <= 0,
    start,
    pause,
    resume,
    end,
  };
}
