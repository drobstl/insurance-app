'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { User } from 'firebase/auth';
import type { ChallengeProgress } from './challenges';

/**
 * Shared client hook for Today's Challenge progress. Both surfaces (the
 * home card and the leads Scoreboard) call this so there's one source of
 * truth and one fetch path. Passes the browser's timezone offset so day
 * buckets land on the agent's local midnight (see challenge-stats.ts).
 *
 * Liveness without sockets: refetches on mount, on window focus, whenever
 * `refreshSignal` changes (the leads page bumps it after each logged
 * dial), and — while a Power Hour session is running — on a light poll so
 * the session ring keeps moving even if the dial was logged elsewhere.
 *
 * @param user           the authenticated agent (from useDashboard)
 * @param sessionStartMs  Power Hour start; when set, the response carries
 *                        a `session` count and polling turns on
 * @param refreshSignal   bump to force a refetch (e.g. after a dial)
 */
export function useChallengeProgress(
  user: User | null,
  sessionStartMs?: number | null,
  refreshSignal?: number,
): {
  progress: ChallengeProgress | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [progress, setProgress] = useState<ChallengeProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keep the latest session start in a ref so the polling effect doesn't
  // need it in its dep array (which would restart the interval each tick).
  const sessionRef = useRef<number | null>(sessionStartMs ?? null);
  sessionRef.current = sessionStartMs ?? null;

  const fetchProgress = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const tz = new Date().getTimezoneOffset();
      const params = new URLSearchParams({ tz: String(tz) });
      if (sessionRef.current != null) params.set('sessionStart', String(sessionRef.current));
      const res = await fetch(`/api/agent/challenges?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || `Failed to load (${res.status})`);
        return;
      }
      setProgress((await res.json()) as ChallengeProgress);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Mount + explicit refresh signals + session-start changes.
  useEffect(() => {
    void fetchProgress();
  }, [fetchProgress, refreshSignal, sessionStartMs]);

  // Refetch when the tab regains focus (cheap, catches dials logged on
  // another device / a long-idle tab).
  useEffect(() => {
    const onFocus = () => void fetchProgress();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchProgress]);

  // Light poll only while a Power Hour is running.
  useEffect(() => {
    if (sessionStartMs == null) return;
    const id = setInterval(() => void fetchProgress(), 20_000);
    return () => clearInterval(id);
  }, [sessionStartMs, fetchProgress]);

  return { progress, loading, error, refresh: fetchProgress };
}
