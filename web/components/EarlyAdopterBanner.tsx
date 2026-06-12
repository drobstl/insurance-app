'use client';

import { useEffect, useState } from 'react';
import { useDashboard } from '../app/dashboard/DashboardContext';

/**
 * Dismissable thank-you banner shown at the top of the dashboard home to
 * our earliest agents. Two variants, picked from the agent's profile:
 *
 *   - Founding members (`isFoundingMember`) → "free for life" recognition.
 *   - Legacy $29 Starter customers (`membershipTier === 'starter'`) →
 *     "you're on Growth now, still $29" grandfather note.
 *
 * Both are pure recognition — no CTA, no tier or price change. The
 * Starter plan was retired for new agents (the no-card trial → Free is
 * the front door now), so the handful of grandfathered $29 customers get
 * a warm heads-up that nothing changed for them. Founding members already
 * read as "Founding Member" in Settings; this is the gratitude moment.
 *
 * Dismissal is per-device via localStorage keyed by uid + variant, same
 * pattern as PairPhoneBanner. Defaults to dismissed=true so the banner
 * never flashes before the client knows the agent's tier.
 *
 * Stage 2 (parked until the FOUNDING34_PRO Stripe coupon exists): turn
 * the founding variant into a "your founding Pro trial is on" CTA so
 * founders get the same pre-sale taste new trial signups get, then roll
 * into the $49 founding Pro rate.
 */
const STORAGE_KEY = 'early-adopter-banner-dismissed';

type Variant = 'founding' | 'starter';

export default function EarlyAdopterBanner() {
  const { user, agentProfile, profileLoading } = useDashboard();
  const [dismissed, setDismissed] = useState<boolean>(true);

  // A founder is never also a Starter customer, but check founding first
  // so the higher-status recognition wins if the data ever overlaps.
  const variant: Variant | null = agentProfile.isFoundingMember
    ? 'founding'
    : agentProfile.membershipTier === 'starter'
      ? 'starter'
      : null;

  // Hydration-safe read of localStorage. Default dismissed=true so the
  // banner doesn't flash on the initial render before we know the tier.
  useEffect(() => {
    if (typeof window === 'undefined' || !user || !variant) return;
    const stored = window.localStorage.getItem(`${STORAGE_KEY}-${variant}-${user.uid}`);
    setDismissed(stored === 'true');
  }, [user, variant]);

  if (profileLoading) return null;
  if (!user) return null;
  if (!variant) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`${STORAGE_KEY}-${variant}-${user.uid}`, 'true');
    }
    setDismissed(true);
  };

  // Founding members get the brand gold (#fdcc02) on the deep-teal
  // gradient + a faint gold frame, so the recognition reads as premium.
  // Starter keeps the standard teal accent.
  const config =
    variant === 'founding'
      ? {
          title: 'You’re a founding member.',
          body:
            'Locked in free for life — thank you for betting on AgentForLife before anyone else did. You’ll always be first in line for what we build next.',
          frame: 'ring-1 ring-inset ring-[#fdcc02]/60',
          iconWrap: 'bg-[#fdcc02]/20',
          icon: 'text-[#fdcc02]',
          titleColor: 'text-[#fdcc02]',
        }
      : {
          title: 'You’re on Growth now — still $29.',
          body:
            'The Starter plan is retiring, but as one of our first agents you’re grandfathered onto Growth at your original $29/month, for as long as you’re with us. Thank you for being here early.',
          frame: '',
          iconWrap: 'bg-[#3DD6C3]/20',
          icon: 'text-[#3DD6C3]',
          titleColor: 'text-white',
        };

  return (
    <div className={`bg-gradient-to-r from-[#0D4D4D] to-[#1a6868] rounded-lg p-4 mb-6 flex items-center gap-4 shadow-sm ${config.frame}`}>
      <div className={`w-10 h-10 rounded-full ${config.iconWrap} flex items-center justify-center flex-shrink-0`}>
        <svg className={`w-5 h-5 ${config.icon}`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.368 2.447a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.367-2.447a1 1 0 00-1.176 0l-3.367 2.447c-.784.57-1.838-.197-1.539-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.075 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${config.titleColor}`}>{config.title}</p>
        <p className="text-white/75 text-xs mt-0.5">{config.body}</p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="text-white/60 hover:text-white/90 transition-colors p-1 flex-shrink-0"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
