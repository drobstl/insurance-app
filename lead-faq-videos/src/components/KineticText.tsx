import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { MONTSERRAT } from '../theme/fonts';
import { COLORS, SPRING } from '../theme/tokens';

// Staggered word/char reveal with a gentle rise. Optionally recolor one word.
export const KineticText: React.FC<{
  text: string;
  appearAt?: number;
  stagger?: number;
  unit?: 'word' | 'char';
  fontSize: number;
  weight?: number;
  color?: string;
  align?: 'left' | 'center';
  lineHeight?: number;
  maxWidth?: number;
  letterSpacing?: string;
  highlight?: string;
  highlightColor?: string;
  style?: React.CSSProperties;
}> = ({
  text,
  appearAt = 0,
  stagger = 2,
  unit = 'word',
  fontSize,
  weight = 800,
  color = COLORS.paper,
  align = 'center',
  lineHeight = 1.05,
  maxWidth,
  letterSpacing = '-0.01em',
  highlight,
  highlightColor = COLORS.gold,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tokens = unit === 'word' ? text.split(' ') : text.split('');
  return (
    <div
      style={{
        fontFamily: MONTSERRAT,
        fontWeight: weight,
        fontSize,
        color,
        textAlign: align,
        lineHeight,
        maxWidth,
        letterSpacing,
        ...style,
      }}
    >
      {tokens.map((tok, i) => {
        const s = spring({ frame: frame - (appearAt + i * stagger), fps, config: SPRING.gentle });
        const y = interpolate(s, [0, 1], [fontSize * 0.5, 0]);
        const o = interpolate(s, [0, 1], [0, 1]);
        const isHi = highlight && tok.replace(/[.,!?’']/g, '') === highlight.replace(/[.,!?’']/g, '');
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `translateY(${y}px)`,
              opacity: o,
              color: isHi ? highlightColor : undefined,
              marginRight: unit === 'word' ? '0.25em' : 0,
              whiteSpace: 'pre',
            }}
          >
            {tok}
          </span>
        );
      })}
    </div>
  );
};
