'use client';

import { useId } from 'react';
import type { BadgeIcon } from '../lib/badges';

interface Props {
  icon: BadgeIcon;
  color: string;
  size?: number;
  shimmer?: boolean;
  glow?: boolean;
  grayscale?: boolean;
}

function adjust(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const OUTER = 'M50 3 L93 19 V55 Q93 82 50 97 Q7 82 7 55 V19 Z';
const INNER = 'M50 9 L87 23 V54 Q87 78 50 91 Q13 78 13 54 V23 Z';
const HIGHLIGHT = 'M50 9 L87 23 L50 33 L13 23 Z';

function Icon({ type }: { type: BadgeIcon }) {
  switch (type) {
    case 'shield':
      return (
        <path
          d="M-6 1 L-2 5 L7 -5"
          fill="none"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'chat':
      return (
        <path
          d="M8-2.5a7 7 0 01-.8 3.2 7.2 7.2 0 01-6.4 4 7 7 0 01-3.2-.8L-8 6.5l1.6-4.8a7 7 0 01-.8-3.2 7.2 7.2 0 014-6.4A7 7 0 010-8.7h.4a7.2 7.2 0 016.8 6.8v.4z"
          fill="white"
        />
      );
    case 'star':
      return (
        <path
          d="M0-10 L2.9-3.7 10-3.2 4.7 1.8 6.2 8.7 0 5 -6.2 8.7 -4.7 1.8 -10-3.2 -2.9-3.7Z"
          fill="white"
        />
      );
    case 'heart':
      return (
        <path
          d="M0 7.5C-1.5 6-9.5-0.5-9.5-4.5c0-3.2 2.2-5 4.8-5C-2.5-9.5-0.5-7.5 0-6.5 0.5-7.5 2.5-9.5 4.7-9.5c2.6 0 4.8 1.8 4.8 5C9.5-0.5 1.5 6 0 7.5z"
          fill="white"
        />
      );
    case 'trophy':
      return (
        <g fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M-5-8h10v7a5 5 0 01-10 0z" />
          <path d="M-5-6h-2.5a2.5 2.5 0 000 5H-5" />
          <path d="M5-6h2.5a2.5 2.5 0 010 5H5" />
          <line x1="-3" y1="7" x2="3" y2="7" />
          <line x1="0" y1="3" x2="0" y2="7" />
        </g>
      );
    case 'diamond':
      return (
        <g>
          <path d="M0-10 L10 0 0 10 -10 0Z" fill="white" opacity="0.9" />
          <path d="M0-10 L10 0 0 0Z" fill="white" opacity="0.6" />
          <path d="M0-10 L0 0 -10 0Z" fill="white" />
        </g>
      );
    case 'flame':
      return (
        <path
          d="M0 9c-3.2 0-6.5-2-6.5-6C-6.5-0.5-4.5-2.5-3-4c.4 2 1.5 3.2 2.3 4 .4-2.5 1.5-5.5 4-7.5 0 3.5 3.2 5.5 3.2 8.5 0 4.2-3.2 8-6.5 8z"
          fill="white"
        />
      );
    case 'target':
      return (
        <g fill="none" stroke="white" strokeWidth="2">
          <circle cx="0" cy="0" r="10" />
          <circle cx="0" cy="0" r="6" />
          <circle cx="0" cy="0" r="2" fill="white" />
        </g>
      );
    case 'recruit':
      return (
        <g fill="white">
          <circle cx="-6" cy="-5" r="3.5" />
          <path d="M-12 4.5a6 6 0 0112 0" />
          <circle cx="6" cy="-5" r="3.5" />
          <path d="M0 4.5a6 6 0 0112 0" />
          <circle cx="0" cy="6" r="1.5" fill="none" stroke="white" strokeWidth="1.5" />
          <line x1="0" y1="4" x2="0" y2="8" stroke="white" strokeWidth="1.5" />
          <line x1="-2" y1="6" x2="2" y2="6" stroke="white" strokeWidth="1.5" />
        </g>
      );
  }
}

export default function PremiumBadge({
  icon,
  color,
  size = 40,
  shimmer = false,
  glow = false,
  grayscale = false,
}: Props) {
  const uid = useId().replace(/:/g, '');
  const light = adjust(color, 45);
  const dark = adjust(color, -45);

  return (
    <div
      className={`relative inline-flex shrink-0 ${grayscale ? 'grayscale opacity-40' : ''}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        style={
          glow
            ? { filter: `drop-shadow(0 0 ${Math.round(size * 0.2)}px ${color}50)` }
            : undefined
        }
      >
        <defs>
          <linearGradient id={`f${uid}`} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor={light} />
            <stop offset="100%" stopColor={dark} />
          </linearGradient>
          <linearGradient id={`b${uid}`} x1="0.3" y1="0" x2="0.7" y2="1">
            <stop offset="0%" stopColor="#f5d976" />
            <stop offset="50%" stopColor="#e2b93b" />
            <stop offset="100%" stopColor="#c99a2e" />
          </linearGradient>
          <clipPath id={`c${uid}`}>
            <path d={INNER} />
          </clipPath>
          {shimmer && (
            <linearGradient id={`s${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="white" stopOpacity="0" />
              <stop offset="40%" stopColor="white" stopOpacity="0" />
              <stop offset="50%" stopColor="white" stopOpacity="0.35" />
              <stop offset="60%" stopColor="white" stopOpacity="0" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
          )}
        </defs>

        {/* Gold border */}
        <path d={OUTER} fill={`url(#b${uid})`} />
        {/* Gradient fill */}
        <path d={INNER} fill={`url(#f${uid})`} />
        {/* Top highlight for depth */}
        <path d={HIGHLIGHT} fill="white" opacity="0.15" />

        {/* Center icon */}
        <g transform="translate(50 53) scale(1.5)">
          <Icon type={icon} />
        </g>

        {/* Shimmer sweep */}
        {shimmer && (
          <g clipPath={`url(#c${uid})`}>
            <rect
              x="-60"
              y="-5"
              width="60"
              height="110"
              fill={`url(#s${uid})`}
              transform="skewX(-20)"
            >
              <animate
                attributeName="x"
                from="-60"
                to="110"
                dur="3s"
                repeatCount="indefinite"
              />
            </rect>
          </g>
        )}
      </svg>
    </div>
  );
}
