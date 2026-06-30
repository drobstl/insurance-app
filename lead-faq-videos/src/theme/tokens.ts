import { Easing } from 'remotion';

export const FPS = 30;

// The square "action box" every scene composes inside. SafeFrame centers it so
// 9:16 / 4:5 / 1:1 / 16:9 all keep the core action on screen.
export const ACTION_W = 1080;
export const ACTION_H = 1080;

// Scene lengths in FRAMES @30fps (DURATION_FRAMES = 1200 = 40s).
// Focused single story, slowed down, leaning into the magic of automation:
// branded app -> remembered -> flip one switch, AFL saves the policy FOR you
// -> and that's just the tip of the iceberg -> be their agent for life.
export const SCENE = {
  problem: 210, //  0–7s    cold feet: about to cancel, and they forgot you
  app: 330, //      7–18s   the branded app — you, in their pocket
  save: 420, //     18–32s  flip one switch -> AFL re-engages + saves the policy, hands-off
  iceberg: 120, //  32–36s  and retention is just the start
  cta: 120, //      36–40s  be their agent for life + CTA
} as const;

export const DURATION_FRAMES = Object.values(SCENE).reduce((a, b) => a + b, 0); // 900

// Brand easings — reused everywhere so motion feels consistent.
export const EASE = {
  brand: Easing.bezier(0.22, 1, 0.36, 1), // soft settle, no overshoot
  in: Easing.bezier(0.4, 0, 1, 1),
  out: Easing.bezier(0, 0, 0.2, 1),
  snappy: Easing.bezier(0.34, 1.56, 0.64, 1), // overshoot for a tactile "click" pop
} as const;

export const SPRING = {
  pop: { damping: 12, stiffness: 200, mass: 0.8 },
  gentle: { damping: 20, stiffness: 120, mass: 1 },
  stiff: { damping: 200, stiffness: 200, mass: 1 },
} as const;

export const COLORS = {
  teal: '#0D4D4D',
  tealDeep: '#005851',
  mint: '#3DD6C3',
  gold: '#fdcc02',
  coral: '#F4845F',
  nearBlack: '#061a18',
  ink: '#2D3748',
  paper: '#F8F9FA',
  muted: '#707070',
  red: '#E24B4A',
  // "Without" timeline — cold, desaturated.
  coldBg: '#10201d',
  coldSurface: '#1b2b28',
  coldText: '#6b7a77',
  coldLine: '#2a3b39',
} as const;
