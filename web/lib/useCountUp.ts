'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts a number up from 0 → target once on mount (cubic ease-out) for
 * the Today's Challenge ring's entrance energy. Jumps straight to the
 * target under prefers-reduced-motion, and re-animates only when the
 * target itself changes (e.g. a dial lands).
 */
export function useCountUp(target: number, durationMs = 1100): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    let raf = 0;
    let start: number | null = null;
    // All state writes happen inside the rAF callback (never synchronously
    // in the effect body). Reduced-motion snaps to target on the first frame.
    const tick = (ts: number) => {
      if (reduced) {
        setValue(target);
        fromRef.current = target;
        return;
      }
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}
