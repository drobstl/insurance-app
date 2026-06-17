'use client';

/**
 * Branded "working on it" loader for the Coaching scoring wait (~30–60s).
 *
 * The AFL mark is an infinity / lemniscate. We redraw it as a single
 * continuous figure-8 path so a bright teal "comet" can trace the whole loop
 * via stroke-dashoffset — reading as analyzing/building rather than a fake
 * progress bar (scoring time is variable, so a 0→100% fill would lie).
 *
 * The brand logo (`/logo.png`) is raster, so the shape is reconstructed in
 * vector here to match its proportions and teal palette.
 */

// One continuous stroke: center → right loop → center → left loop → center.
const INFINITY_PATH =
  'M50 25 C62 8 92 8 92 25 C92 42 62 42 50 25 C38 8 8 8 8 25 C8 42 38 42 50 25 Z';

export default function ScoringInfinity({ className = '' }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 100 50" className="block w-full h-full overflow-visible">
        <defs>
          {/* Brand teal range — light through the left of the loop, deep
              through the right — so the comet blends across the full teal
              palette as it orbits, echoing the logo's light→deep gradient. */}
          <linearGradient id="aflScoringTeal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6fd6c2" />
            <stop offset="50%" stopColor="#1aa893" />
            <stop offset="100%" stopColor="#045e4e" />
          </linearGradient>
        </defs>
        {/* Faint full-loop track */}
        <path
          d={INFINITY_PATH}
          fill="none"
          stroke="url(#aflScoringTeal)"
          strokeOpacity="0.18"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Bright comet that orbits the track, picking up the teal blend */}
        <path
          className="afl-scoring-comet"
          d={INFINITY_PATH}
          pathLength={100}
          fill="none"
          stroke="url(#aflScoringTeal)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="26 74"
        />
      </svg>
      <style>{`
        .afl-scoring-comet{animation:afl-scoring-orbit 1.5s linear infinite;filter:drop-shadow(0 0 3px rgba(26,168,147,0.5))}
        @keyframes afl-scoring-orbit{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
        @media (prefers-reduced-motion:reduce){.afl-scoring-comet{animation:none;stroke-dasharray:none;stroke-opacity:.9}}
      `}</style>
    </span>
  );
}
