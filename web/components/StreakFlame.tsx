import { CHALLENGE_COLORS as C } from '../lib/challenge-theme';

/**
 * Streak indicator — a warm flickering flame (the "fire" metaphor every
 * gamified product uses for streaks) + "N day streak". The flame is the
 * one warm spark against the cool teal; it flickers via the .tc-flame
 * class (globals.css), which stops under prefers-reduced-motion.
 *
 * `variant` picks the pill treatment for the light (home) vs dark
 * (scoreboard) card.
 */
export default function StreakFlame({
  count,
  variant,
}: {
  count: number;
  variant: 'light' | 'dark';
}) {
  if (count <= 0) return null;
  const bg = variant === 'light' ? C.streakPillLightBg : C.streakPillDarkBg;
  const text = variant === 'light' ? C.streakPillLightText : C.streakPillDarkText;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-bold self-start whitespace-nowrap"
      style={{ background: bg, color: text }}
    >
      <svg className="tc-flame" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.flame} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z" />
      </svg>
      {count} day streak
    </span>
  );
}
