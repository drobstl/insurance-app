/**
 * Today's Challenge palette — the exploratory "navy + mint" gamification
 * direction (locked with Daniel, Jun 30). Kept isolated here so the loud
 * colors live ONLY on the challenge surfaces; the rest of the app stays
 * on its calm teal/white system. One neon leads (mint = today's dials),
 * everything else stays rare: soft teal for the calmer weekly ring, gold
 * reserved for the streak chip + the Power Hour countdown.
 *
 * Neons only read on dark backgrounds — these are designed for the navy
 * "stage", with dark text placed on any neon/gold fill.
 */
export const CHALLENGE_COLORS = {
  stage: '#00185E', // deep navy — the dark tile background
  border: '#1f3b7d', // subtle navy hairline border
  track: '#16306b', // unfilled ring track on navy
  mint: '#17FFC1', // signature neon — today's dials / "won"
  softTeal: '#45C4B2', // calmer — the weekly ring / "in progress"
  green: '#19C697', // money / placed (light-surface accent)
  gold: '#FFCC02', // milestone / reward — streak + countdown
  sky: '#02B7FF', // small accent label on navy
  textOnNeon: '#00185E', // dark text on mint/gold fills
  textMuted: '#9fb4e0', // muted pale-blue copy on navy
  white: '#ffffff',
} as const;
