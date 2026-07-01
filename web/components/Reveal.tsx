'use client';

import type { ReactNode } from 'react';

/**
 * Reveal — the app's one polished "enter the field of vision" primitive.
 *
 * Anything that appears (a just-fetched card, a recap panel, a list that
 * hydrates from cache) routes through this so entrances are consistent
 * instead of a hard flash. Numbers that *change in place* use `useCountUp`
 * (they roll); containers that *arrive* use `<Reveal>` (they fade + rise).
 *
 * Implemented with CSS classes (see globals.css `.tc-reveal*`), NOT a JS
 * opacity animation, on purpose: the resting state is fully visible, so a
 * throttled/interrupted/skipped animation can never leave content stuck
 * hidden. Reduced-motion is handled in CSS — those users see the content
 * at rest with no animation. Keep this dependency-free and cheap so it's
 * safe to wrap broadly.
 */

type RevealVariant = 'rise' | 'fade' | 'pop';

const VARIANT_CLASS: Record<RevealVariant, string> = {
  rise: 'tc-reveal',
  fade: 'tc-reveal-fade',
  pop: 'tc-reveal-pop',
};

export function Reveal({
  children,
  variant = 'rise',
  className,
}: {
  children: ReactNode;
  variant?: RevealVariant;
  className?: string;
}) {
  const cls = className ? `${VARIANT_CLASS[variant]} ${className}` : VARIANT_CLASS[variant];
  return <div className={cls}>{children}</div>;
}
