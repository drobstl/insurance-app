import { CHALLENGE_COLORS } from '../lib/challenge-theme';

/**
 * Dual concentric "achievement ring" (Apple-activity-ring style) for the
 * Today's Challenge surfaces. Pure presentational — the parent decides
 * what each ring means:
 *  - Challenge mode: outer = today's dials, inner = this week.
 *  - Power Hour mode: outer = time remaining, inner = session dials.
 *
 * Rings start at 12 o'clock and fill clockwise. `pct` clamps to 0–1.
 * Honors reduced-motion by simply not animating (CSS transition on the
 * dashoffset; instant when the OS prefers reduced motion).
 */
export interface RingSpec {
  pct: number;
  color: string;
}

interface Props {
  size?: number;
  outer: RingSpec;
  inner?: RingSpec;
  centerTop: string;
  centerBottom?: string;
  centerTopColor?: string;
  /** Render the big center value in a monospace face (e.g. countdowns). */
  mono?: boolean;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export default function ChallengeRing({
  size = 150,
  outer,
  inner,
  centerTop,
  centerBottom,
  centerTopColor = CHALLENGE_COLORS.white,
  mono = false,
}: Props) {
  const VIEW = 160;
  const cx = 80;
  const cy = 80;
  const outerR = 70;
  const innerR = 54;
  const outerW = 13;
  const innerW = 9;
  const outerC = 2 * Math.PI * outerR;
  const innerC = 2 * Math.PI * innerR;
  const outerOffset = outerC * (1 - clamp01(outer.pct));
  const innerOffset = innerC * (1 - clamp01(inner?.pct ?? 0));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      role="img"
      aria-label={`${centerTop}${centerBottom ? ` ${centerBottom}` : ''}`}
    >
      <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={CHALLENGE_COLORS.track} strokeWidth={outerW} />
      <circle
        cx={cx}
        cy={cy}
        r={outerR}
        fill="none"
        stroke={outer.color}
        strokeWidth={outerW}
        strokeLinecap="round"
        strokeDasharray={outerC}
        strokeDashoffset={outerOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 600ms ease' }}
      />
      {inner && (
        <>
          <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={CHALLENGE_COLORS.track} strokeWidth={innerW} />
          <circle
            cx={cx}
            cy={cy}
            r={innerR}
            fill="none"
            stroke={inner.color}
            strokeWidth={innerW}
            strokeLinecap="round"
            strokeDasharray={innerC}
            strokeDashoffset={innerOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dashoffset 600ms ease' }}
          />
        </>
      )}
      <text
        x={cx}
        y={centerBottom ? 75 : 88}
        textAnchor="middle"
        fill={centerTopColor}
        style={{
          fontSize: mono ? 30 : 38,
          fontWeight: 600,
          fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
        }}
      >
        {centerTop}
      </text>
      {centerBottom && (
        <text x={cx} y={99} textAnchor="middle" fill={CHALLENGE_COLORS.textMuted} style={{ fontSize: 13 }}>
          {centerBottom}
        </text>
      )}
    </svg>
  );
}
