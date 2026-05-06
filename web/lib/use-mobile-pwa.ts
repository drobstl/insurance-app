'use client';

import { useEffect, useState } from 'react';

/**
 * Phase 1 Track B viewport + PWA detection.
 *
 * SOURCE OF TRUTH: docs/AFL_Phase_1_Planning_Notes_2026-05-04.md §1-§3,
 * CONTEXT.md > Channel Rules > Phase 1 implementation constraints.
 *
 * The "Send from my phone" welcome surface is mobile-only on the agent
 * side. Desktop must surface the same queue but with a read-only
 * "Open AFL on your phone to send" affordance. This hook returns the
 * three signals every welcome surface needs:
 *
 * - `isMobileViewport` — narrow viewport (matches our `md:` breakpoint
 *   at 768px). Distinguishes phone from laptop / desktop browser.
 * - `isStandalonePWA` — the dashboard is running as an installed PWA
 *   (display-mode standalone OR navigator.standalone).
 * - `canSendFromPhone` — true iff BOTH of the above are true. This is
 *   the gate for rendering "Send from my phone" — Daniel's locked
 *   constraint that the welcome send is mobile-PWA-only and there is
 *   NO desktop send fallback.
 *
 * SSR-safe: returns false / false / false on the server, then updates
 * after hydration. Suspense-friendly. Each signal updates independently
 * on viewport / display-mode change.
 */

const MOBILE_VIEWPORT_QUERY = '(max-width: 767px)';
const STANDALONE_QUERY = '(display-mode: standalone)';

export interface MobilePWAState {
  isMobileViewport: boolean;
  isStandalonePWA: boolean;
  /** Mobile viewport AND installed PWA — the gate for one-tap welcome send. */
  canSendFromPhone: boolean;
}

export function useMobilePWA(): MobilePWAState {
  const [state, setState] = useState<MobilePWAState>({
    isMobileViewport: false,
    isStandalonePWA: false,
    canSendFromPhone: false,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const compute = () => {
      const mobileMql = window.matchMedia(MOBILE_VIEWPORT_QUERY);
      const standaloneMql = window.matchMedia(STANDALONE_QUERY);
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const isMobileViewport = mobileMql.matches;
      const isStandalonePWA = standaloneMql.matches || nav.standalone === true;
      setState({
        isMobileViewport,
        isStandalonePWA,
        canSendFromPhone: isMobileViewport && isStandalonePWA,
      });
    };

    compute();

    const mobileMql = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const standaloneMql = window.matchMedia(STANDALONE_QUERY);

    const onChange = () => compute();

    mobileMql.addEventListener?.('change', onChange);
    standaloneMql.addEventListener?.('change', onChange);
    // Older Safari (< 14) only supports the deprecated addListener API.
    const legacyAdd = mobileMql.addListener as ((cb: () => void) => void) | undefined;
    const legacyRemove = mobileMql.removeListener as ((cb: () => void) => void) | undefined;
    if (typeof legacyAdd === 'function' && typeof mobileMql.addEventListener !== 'function') {
      legacyAdd.call(mobileMql, onChange);
      legacyAdd.call(standaloneMql, onChange);
    }

    return () => {
      mobileMql.removeEventListener?.('change', onChange);
      standaloneMql.removeEventListener?.('change', onChange);
      if (typeof legacyRemove === 'function' && typeof mobileMql.removeEventListener !== 'function') {
        legacyRemove.call(mobileMql, onChange);
        legacyRemove.call(standaloneMql, onChange);
      }
    };
  }, []);

  return state;
}
