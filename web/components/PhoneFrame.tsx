'use client';

import type { CSSProperties } from 'react';

const FRAME_CANVAS_WIDTH = 768;
const FRAME_CANVAS_HEIGHT = 1376;

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
      leftPct: 26.8,
      topPct: 11.8,
      widthPct: 58.2,
      heightPct: 61.3,
      borderRadiusPct: 9,
      transformControls: {
        perspective: 1200,
        rotateDeg: -5,
        skewXDeg: -1,
      },
      transformOrigin: '50% 52%',
    },
  },
  handStraight: {
    src: '/hand%20holding%20phone%20straight%20on.png',
    screen: {
      leftPct: 28.8,
      topPct: 16.4,
      widthPct: 44.7,
      heightPct: 54.3,
      borderRadiusPct: 8,
    },
  },
  angledLeft: {
    src: '/phone%20angeled%20left.png',
    screen: {
      leftPct: 24.6,
      topPct: 10.3,
      widthPct: 51.2,
      heightPct: 79.5,
      borderRadiusPct: 7,
      transformControls: {
        perspective: 1200,
        rotateDeg: -8,
        skewYDeg: 1.5,
      },
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
      leftPct: 13.4,
      topPct: 9.2,
      widthPct: 68.9,
      heightPct: 81.6,
      borderRadiusPct: 6,
    },
  },
  tiltedUp1: {
    src: '/phone%20tilted%20up%201.png',
    screen: {
      leftPct: 13.7,
      topPct: 14.1,
      widthPct: 66.4,
      heightPct: 70.3,
      borderRadiusPct: 6,
      transformControls: {
        perspective: 1200,
        rotateXDeg: 9,
      },
      transformOrigin: '50% 80%',
    },
  },
  tiltedUp2: {
    src: '/phone%20tilted%20up%202.png',
    screen: {
      leftPct: 15.4,
      topPct: 13.2,
      widthPct: 63.8,
      heightPct: 71.8,
      borderRadiusPct: 6,
      transformControls: {
        perspective: 1200,
        rotateXDeg: 11,
      },
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
    <div
      className={cx('relative w-full', className)}
      style={{ aspectRatio: `${FRAME_CANVAS_WIDTH} / ${FRAME_CANVAS_HEIGHT}` }}
    >
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
