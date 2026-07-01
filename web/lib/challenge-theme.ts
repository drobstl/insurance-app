/**
 * Today's Challenge palette — research-backed (Jun 30 deep-research pass).
 *
 * The fun/energy does NOT come from a bright card fill (that fails contrast
 * AND reads flat). It comes from concentrating vivid color on the small,
 * high-priority elements — the progress ring, the streak flame, the win —
 * while the card surface stays calm. Color grammar borrowed from the
 * gamification leaders (Duolingo etc.):
 *   - saturated GREEN = progress            (ring)
 *   - warm ORANGE = streak / fire           (the "warm spark")
 *   - GOLD + coral = milestone / win        (celebration only)
 *
 * Two surface treatments:
 *   - HOME: white stitched card (cohesive with the rest of the app).
 *   - LEADS scoreboard: dark TEAL card (#04342c, NOT navy) so the tile
 *     breaks from the white leads list; a brighter ring pops on the dark.
 *
 * Contrast notes (WCAG): a progress arc needs only 3:1 vs the card bg,
 * which #059669 clears on white (~3.8:1) and #2ee6b0 clears on the dark
 * teal easily. The light ring track is intentionally decorative — the
 * "11 of 20" numeral states the value textually (SC 1.4.11 redundancy).
 * All body text is dark-on-white / light-on-dark and clears 4.5:1.
 */
export const CHALLENGE_COLORS = {
  // ── Home (light) card ──
  homeCardBg: '#ffffff',
  homeBorder: '#1A1A1A',
  ringTrackLight: '#d9efe9',
  progress: '#059669', // green ring — passes 3:1 on white
  weeklyLight: '#0d9488', // deeper teal weekly bar — passes on white
  numberDark: '#04342c',
  labelTeal: '#036357', // deep teal — small-text safe on white (>4.5:1)
  mutedTeal: '#5f7a72',
  textDark: '#1a1a1a',

  // ── Leads (dark) scoreboard card ──
  stage: '#04342c', // dark TEAL, not navy
  stageBorder: '#1A1A1A',
  ringTrackDark: '#0b4a3e',
  progressBright: '#2ee6b0', // bright ring on dark
  weeklyDark: '#45C4B2',
  onDark: '#ffffff',
  onDarkMuted: '#9fe1cb',
  labelMint: '#5DE0C7',

  // ── Shared warm/reward accents ──
  flame: '#f97316', // streak flame (orange) — the warm spark
  flameHot: '#ffb01f', // flame flicker highlight / streak pill on dark
  streakPillLightBg: '#ffe9cc',
  streakPillLightText: '#9a3412',
  streakPillDarkBg: '#ffb01f',
  streakPillDarkText: '#231400',
  gold: '#f5c542', // milestone / win

  // ── Recap funnel bars (Dials → Contacts → Booked) ──
  // Dials is neutral slate on purpose — raw volume recedes so the eye
  // lands on Contacts (progressBright) and Booked (gold). Palette locked
  // with Daniel Jul 1.
  funnelDials: '#7e9d94',
  coral: '#ff5a4d', // win confetti partner
} as const;
