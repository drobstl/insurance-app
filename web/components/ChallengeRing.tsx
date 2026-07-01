'use client';

import { useEffect, useState } from 'react';
import { CHALLENGE_COLORS } from '../lib/challenge-theme';

/**
 * Dual concentric "achievement ring" for the Today's Challenge surfaces.
 * Pure-ish presentational — the parent decides what each ring means
 * (challenge: outer = today's dials, inner = week; Power Hour: outer =
 * time left, inner = session dials).
 *
 * Animation (all disabled under prefers-reduced-motion via .tc-* classes
 * in globals.css):
 *  - `animate`: the arc draws from empty → target on mount.
 *  - `liveDot`: a dot rides the outer arc's leading edge and pulses ("in
 *    progress right now").
 *  - `heartbeat`: the whole ring gives a gentle bulge every ~6s.
 */
export interface RingSpec {
  pct: number;
  color: string;
}

interface Props {
  size?: number;
  outer: RingSpec;
  inner?: RingSpec;
  trackColor?: string;
  centerTop: string;
  centerBottom?: string;
  centerTopColor?: string;
  centerBottomColor?: string;
  mono?: boolean;
  animate?: boolean;
  liveDot?: boolean;
  heartbeat?: boolean;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

const CX = 80;
const CY = 80;
const OUTER_R = 70;
const INNER_R = 54;
const OUTER_C = 2 * Math.PI * OUTER_R;
const INNER_C = 2 * Math.PI * INNER_R;

export default function ChallengeRing({
  size = 150,
  outer,
  inner,
  trackColor = CHALLENGE_COLORS.ringTrackDark,
  centerTop,
  centerBottom,
  centerTopColor = CHALLENGE_COLORS.onDark,
  centerBottomColor = CHALLENGE_COLORS.mutedTeal,
  mono = false,
  animate = false,
  liveDot = false,
  heartbeat = false,
}: Props) {
  const outerPct = clamp01(outer.pct);
  const innerPct = clamp01(inner?.pct ?? 0);

  // Draw-on-mount: start empty, then settle to target so CSS transitions
  // the stroke-dashoffset. When not animating, render at target directly.
  const [drawn, setDrawn] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [animate]);

  const outerOffset = OUTER_C * (1 - (drawn ? outerPct : 0));
  const innerOffset = INNER_C * (1 - (drawn ? innerPct : 0));

  // Leading-edge dot position (clockwise from 12 o'clock).
  const a = 2 * Math.PI * outerPct;
  const dotX = CX + OUTER_R * Math.sin(a);
  const dotY = CY - OUTER_R * Math.cos(a);

  return (
    <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label={`${centerTop}${centerBottom ? ` ${centerBottom}` : ''}`}>
      <g className={heartbeat ? 'tc-ring-grp' : undefined}>
        <circle cx={CX} cy={CY} r={OUTER_R} fill="none" stroke={trackColor} strokeWidth={14} />
        <circle
          cx={CX}
          cy={CY}
          r={OUTER_R}
          fill="none"
          stroke={outer.color}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={OUTER_C}
          strokeDashoffset={outerOffset}
          transform={`rotate(-90 ${CX} ${CY})`}
          style={{ transition: `stroke-dashoffset ${animate ? 1200 : 600}ms cubic-bezier(.2,.8,.2,1)` }}
        />
        {inner && (
          <>
            <circle cx={CX} cy={CY} r={INNER_R} fill="none" stroke={trackColor} strokeWidth={9} />
            <circle
              cx={CX}
              cy={CY}
              r={INNER_R}
              fill="none"
              stroke={inner.color}
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={INNER_C}
              strokeDashoffset={innerOffset}
              transform={`rotate(-90 ${CX} ${CY})`}
              style={{ transition: `stroke-dashoffset ${animate ? 1200 : 600}ms cubic-bezier(.2,.8,.2,1)` }}
            />
          </>
        )}
        {liveDot && outerPct > 0.02 && outerPct < 0.999 && drawn && (
          <circle className="tc-dot" cx={dotX} cy={dotY} r={6} fill={outer.color} />
        )}
        <text
          x={CX}
          y={centerBottom ? 75 : 88}
          textAnchor="middle"
          fill={centerTopColor}
          style={{ fontSize: mono ? 30 : 40, fontWeight: 800, fontFamily: mono ? 'ui-monospace, monospace' : 'inherit' }}
        >
          {centerTop}
        </text>
        {centerBottom && (
          <text x={CX} y={99} textAnchor="middle" fill={centerBottomColor} style={{ fontSize: 13 }}>
            {centerBottom}
          </text>
        )}
      </g>
    </svg>
  );
}
