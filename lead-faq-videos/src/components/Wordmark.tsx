import React from 'react';
import { WORDMARK_FONT, WORDMARK_TRACKING } from '../theme/fonts';
import { COLORS } from '../theme/tokens';

// The AgentForLife™ wordmark. "For" is mint by default to match the brand.
export const Wordmark: React.FC<{
  size?: number;
  color?: string;
  midColor?: string;
  tmColor?: string;
  style?: React.CSSProperties;
}> = ({ size = 92, color = COLORS.paper, midColor = COLORS.mint, tmColor = COLORS.mint, style }) => {
  return (
    <div
      style={{
        fontFamily: WORDMARK_FONT,
        fontWeight: 800,
        fontSize: size,
        letterSpacing: WORDMARK_TRACKING,
        color,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      Agent<span style={{ color: midColor }}>For</span>Life
      <span style={{ fontSize: size * 0.4, verticalAlign: 'super', color: tmColor }}>™</span>
    </div>
  );
};
