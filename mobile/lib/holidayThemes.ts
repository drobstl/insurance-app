// ── Holiday & Card Theme Configuration ────────────────────────────────────────
// Centralises all color palettes, gradients, and default greetings for each
// notification type so that card components stay clean and declarative.

export interface CardTheme {
  /** Gradient stops for the full-screen background (top → bottom) */
  gradientColors: [string, string, ...string[]];
  /** Left-border color on the inline card */
  borderColor: string;
  /** Subtle background tint for the inline card */
  bgTint: string;
  /** Accent colour used for text highlights and decorative elements */
  accent: string;
  /** Default greeting prefix, e.g. "Merry Christmas" */
  greetingPrefix: string;
  /** Emoji used as a small visual cue on the inline card */
  emoji: string;
}

// ── Holiday Themes ────────────────────────────────────────────────────────────

const HOLIDAY_THEMES: Record<string, CardTheme> = {
  christmas: {
    gradientColors: ['#8B0000', '#C41E3A', '#A0153E'],
    borderColor: '#C41E3A',
    bgTint: 'rgba(196, 30, 58, 0.06)',
    accent: '#D4A843',
    greetingPrefix: 'Merry Christmas',
    emoji: '🎄',
  },
  newyear: {
    gradientColors: ['#0B1A3E', '#162D6E', '#1A3A8A'],
    borderColor: '#2B4FC7',
    bgTint: 'rgba(43, 79, 199, 0.06)',
    accent: '#C0C0C0',
    greetingPrefix: 'Happy New Year',
    emoji: '🎆',
  },
  thanksgiving: {
    gradientColors: ['#8B4513', '#BF6A20', '#D4892A'],
    borderColor: '#BF6A20',
    bgTint: 'rgba(191, 106, 32, 0.06)',
    accent: '#DAA520',
    greetingPrefix: 'Happy Thanksgiving',
    emoji: '🍂',
  },
  valentines: {
    gradientColors: ['#9B1B30', '#D63B5C', '#E8839B'],
    borderColor: '#D63B5C',
    bgTint: 'rgba(214, 59, 92, 0.06)',
    accent: '#FFB6C1',
    greetingPrefix: 'Happy Valentine\'s Day',
    emoji: '💝',
  },
  july4th: {
    gradientColors: ['#002868', '#BF0A30', '#002868'],
    borderColor: '#BF0A30',
    bgTint: 'rgba(191, 10, 48, 0.06)',
    accent: '#FFFFFF',
    greetingPrefix: 'Happy 4th of July',
    emoji: '🇺🇸',
  },
};

// ── Special-Type Themes ───────────────────────────────────────────────────────

const BIRTHDAY_THEME: CardTheme = {
  gradientColors: ['#B8860B', '#DAA520', '#E8B923'],
  borderColor: '#DAA520',
  bgTint: 'rgba(218, 165, 32, 0.06)',
  accent: '#FFD700',
  greetingPrefix: 'Happy Birthday',
  emoji: '🎂',
};

const DEFAULT_THEME: CardTheme = {
  gradientColors: ['#0D4D4D', '#1A6B6B', '#2A8A8A'],
  borderColor: '#3DD6C3',
  bgTint: '#FFFFFF',
  accent: '#3DD6C3',
  greetingPrefix: '',
  emoji: '',
};

// ── Public Helpers ────────────────────────────────────────────────────────────

/**
 * Resolve the visual theme for a given notification type and optional holiday key.
 */
export function getCardTheme(
  type: string,
  holiday?: string,
): CardTheme {
  if (type === 'birthday') return BIRTHDAY_THEME;

  if (type === 'holiday' && holiday) {
    return HOLIDAY_THEMES[holiday] ?? DEFAULT_THEME;
  }

  return DEFAULT_THEME;
}

/**
 * Whether this notification type should support a full-screen expansion.
 */
export function isExpandableType(type: string): boolean {
  return type === 'holiday' || type === 'birthday';
}
