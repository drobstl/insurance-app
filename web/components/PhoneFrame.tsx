'use client';

import type { CSSProperties } from 'react';

export type TransformControls = {
  perspective?: number;
  rotateXDeg?: number;
  rotateYDeg?: number;
  rotateDeg?: number;
  skewXDeg?: number;
  skewYDeg?: number;
  scale?: number;
};

export type ScreenWindowConfig = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  borderRadiusPct?: number;
  objectPosition?: string;
  transformControls?: TransformControls;
  transform?: string;
  transformOrigin?: string;
};

export type FrameConfig = {
  src: string;
  screen: ScreenWindowConfig;
};

/**
 * Rough starting geometry per illustrated frame.
 * Values are intentionally easy to tweak after visual QA.
 */
export const PHONE_FRAME_CONFIGS = {
  handLeft: {
    src: '/hand%20holding%20phone%20angeled.png',
    screen: {
      leftPct: 29.6,
      topPct: 10.7,
      widthPct: 53.5,
      heightPct: 62.8,
      borderRadiusPct: 4.5,
      transformControls: {
        perspective: 2200,
        rotateXDeg: 4,
        rotateYDeg: 0.9,
        rotateDeg: -7.1,
        skewXDeg: 0,
        skewYDeg: -1.3,
        scale: 0.96,
      },
      transform:
        'perspective(2200px) rotateX(4deg) rotateY(0.9deg) rotate(-7.1deg) skewX(0deg) skewY(-1.3deg) scale(0.96)',
      transformOrigin: '50% 52%',
    },
  },
  handStraight: {
    src: '/hand%20holding%20phone%20straight%20on.png',
    screen: {
      leftPct: 27.5,
      topPct: 15.9,
      widthPct: 47.5,
      heightPct: 54.9,
      borderRadiusPct: 7.1,
      transform:
        'perspective(1200px) rotateX(0deg) rotateY(0deg) rotate(0deg) skewX(0deg) skewY(0deg) scale(1)',
      transformOrigin: '50% 50%',
    },
  },
  angledLeft: {
    src: '/phone%20angeled%20left.png',
    screen: {
      leftPct: 17.6,
      topPct: 12.3,
      widthPct: 61.8,
      heightPct: 76.5,
      borderRadiusPct: 11.1,
      transformControls: {
        perspective: 1920,
        rotateXDeg: -3.7,
        rotateYDeg: -30,
        rotateDeg: -8.5,
        skewXDeg: -8.1,
        skewYDeg: 6.2,
        scale: 1.02,
      },
      transform:
        'perspective(1920px) rotateX(-3.7deg) rotateY(-30deg) rotate(-8.5deg) skewX(-8.1deg) skewY(6.2deg) scale(1.02)',
      transformOrigin: '50% 50%',
    },
  },
  angledRight: {
    src: '/phone%20angeled%20right.png',
    screen: {
      leftPct: 29.2,
      topPct: 15,
      widthPct: 47.7,
      heightPct: 71.1,
      borderRadiusPct: 7,
      transformControls: {
        perspective: 1200,
        rotateDeg: 8,
        skewYDeg: -1,
      },
      transformOrigin: '50% 50%',
    },
  },
  angled: {
    src: '/phone%20angeled%20right.png',
    screen: {
      leftPct: 29.2,
      topPct: 15,
      widthPct: 47.7,
      heightPct: 71.1,
      borderRadiusPct: 7,
      transformControls: {
        perspective: 1200,
        rotateDeg: 8,
        skewYDeg: -1,
      },
      transformOrigin: '50% 50%',
    },
  },
  straight: {
    src: '/phone%20straight%20on.png',
    screen: {
      leftPct: 13,
      topPct: 8.3,
      widthPct: 70.8,
      heightPct: 83.7,
      borderRadiusPct: 7.6,
      transform:
        'perspective(1200px) rotateX(0deg) rotateY(0deg) rotate(0deg) skewX(0deg) skewY(0deg) scale(1)',
      transformOrigin: '50% 50%',
    },
  },
  tiltedUp1: {
    src: '/phone%20tilted%20up%201.png',
    screen: {
      leftPct: 11,
      topPct: 6.4,
      widthPct: 61.6,
      heightPct: 78.6,
      borderRadiusPct: 7.7,
      transformControls: {
        perspective: 1580,
        rotateXDeg: 3.6,
        rotateYDeg: -1.6,
        rotateDeg: 2.6,
        skewXDeg: -5.6,
        skewYDeg: 4.7,
        scale: 0.91,
      },
      transform:
        'perspective(1580px) rotateX(3.6deg) rotateY(-1.6deg) rotate(2.6deg) skewX(-5.6deg) skewY(4.7deg) scale(0.91)',
      transformOrigin: '50% 80%',
    },
  },
  tiltedUp2: {
    src: '/phone%20tilted%20up%202.png',
    screen: {
      leftPct: 13.5,
      topPct: 8.7,
      widthPct: 60.4,
      heightPct: 76.5,
      borderRadiusPct: 6,
      transformControls: {
        perspective: 1550,
        rotateXDeg: -0.4,
        rotateYDeg: -5.5,
        rotateDeg: 3.5,
        skewXDeg: -1.3,
        skewYDeg: 0,
        scale: 0.94,
      },
      transform:
        'perspective(1550px) rotateX(-0.4deg) rotateY(-5.5deg) rotate(3.5deg) skewX(-1.3deg) skewY(0deg) scale(0.94)',
      transformOrigin: '50% 82%',
    },
  },
} as const satisfies Record<string, FrameConfig>;

export type PhoneFrameId = keyof typeof PHONE_FRAME_CONFIGS;

type PhoneFrameProps = {
  frame: PhoneFrameId;
  src: string;
  alt?: string;
  className?: string;
  screenshotClassName?: string;
  /**
   * Optional per-instance fine-tuning.
   * Useful for nudging a specific screenshot without changing global frame config.
   */
  screenStyle?: CSSProperties;
  transformOverride?: TransformControls;
};

function cx(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function buildScreenTransform(controls?: TransformControls): string | undefined {
  if (!controls) return undefined;

  const parts: string[] = [];
  if (typeof controls.perspective === 'number') parts.push(`perspective(${controls.perspective}px)`);
  if (typeof controls.rotateXDeg === 'number') parts.push(`rotateX(${controls.rotateXDeg}deg)`);
  if (typeof controls.rotateYDeg === 'number') parts.push(`rotateY(${controls.rotateYDeg}deg)`);
  if (typeof controls.rotateDeg === 'number') parts.push(`rotate(${controls.rotateDeg}deg)`);
  if (typeof controls.skewXDeg === 'number') parts.push(`skewX(${controls.skewXDeg}deg)`);
  if (typeof controls.skewYDeg === 'number') parts.push(`skewY(${controls.skewYDeg}deg)`);
  if (typeof controls.scale === 'number') parts.push(`scale(${controls.scale})`);

  return parts.length > 0 ? parts.join(' ') : undefined;
}

export default function PhoneFrame({
  frame,
  src,
  alt = 'App screenshot in illustrated iPhone frame',
  className,
  screenshotClassName,
  screenStyle,
  transformOverride,
}: PhoneFrameProps) {
  const config = PHONE_FRAME_CONFIGS[frame];
  // Widen from literal union so optional fields are safely addressable.
  const screen: ScreenWindowConfig = config.screen;
  const computedTransform =
    buildScreenTransform(transformOverride ?? screen.transformControls) ?? screen.transform;

  const screenWindowStyle: CSSProperties = {
    left: `${screen.leftPct}%`,
    top: `${screen.topPct}%`,
    width: `${screen.widthPct}%`,
    height: `${screen.heightPct}%`,
    borderRadius: `${screen.borderRadiusPct ?? 6}%`,
    transform: computedTransform,
    transformOrigin: screen.transformOrigin,
    ...screenStyle,
  };

  return (
    <div className={cx('relative w-full', className)}>
      {/* Intrinsic-height spacer so layout is stable even if aspect-ratio support varies. */}
      <img src={config.src} alt="" aria-hidden="true" className="block w-full select-none opacity-0" />

      {/* Screenshot goes underneath frame artwork so bezel/hand/shadow naturally overlap it. */}
      <div className="absolute z-10 overflow-hidden" style={screenWindowStyle}>
        <img
          src={src}
          alt={alt}
          className={cx('h-full w-full object-cover', screenshotClassName)}
          style={{ objectPosition: screen.objectPosition ?? 'center' }}
        />
      </div>

      <img
        src={config.src}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 h-full w-full select-none object-contain"
      />
    </div>
  );
}
