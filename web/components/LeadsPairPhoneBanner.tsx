'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '../app/dashboard/DashboardContext';

/**
 * Dismissable pairing banner shown at the top of the Leads list until the
 * agent pairs their phone. This is the Leads-tab sibling of
 * `PairPhoneBanner` (dashboard home) — same teal treatment + per-device
 * localStorage dismiss — but the copy ties pairing to the booked-lead
 * payoff (confirmation + prep page fired from your phone).
 *
 * Why a separate banner here at all: the only persistent pairing doors
 * today are a buried profile-menu item and a dismissable home banner.
 * Agents live on the Leads tab and book from it, so the highest-leverage
 * place to surface pairing is right here.
 *
 * Gating (self-contained):
 *   - hidden while the profile is still loading (no flash),
 *   - hidden once `phonePaired` flips true (vanishes for good, no reload),
 *   - hidden for agents who send confirmations by EMAIL (they don't need a
 *     phone — same text-only gate the send drawer uses),
 *   - hidden once dismissed on this device.
 * The Leads page additionally only mounts this on the main list view, so it
 * never intrudes on Call mode / Calendar. The pinned toolbar button (in the
 * Leads action bar) is the always-present door that survives dismissal.
 */
const STORAGE_KEY = 'leads-pair-phone-banner-dismissed';
const DISMISS_EVENT = 'leads-pair-phone-banner:dismissed';

// External-store subscription for the dismiss flag: cross-tab `storage`
// events plus our own same-tab dismissal event. Reading the flag via
// useSyncExternalStore (rather than a setState-in-effect) keeps the read
// hydration-safe without cascading renders.
function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener(DISMISS_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(DISMISS_EVENT, callback);
  };
}

export default function LeadsPairPhoneBanner() {
  const router = useRouter();
  const { user, agentProfile, profileLoading } = useDashboard();
  const uid = user?.uid;

  // Server snapshot is "dismissed" so nothing flashes before the client
  // reads localStorage; React swaps in the real client value right after
  // hydration. (The `user` gate below means there's no SSR content anyway.)
  const dismissed = useSyncExternalStore(
    subscribe,
    () => (uid ? window.localStorage.getItem(`${STORAGE_KEY}-${uid}`) === 'true' : true),
    () => true,
  );

  const handleDismiss = useCallback(() => {
    if (typeof window === 'undefined' || !uid) return;
    window.localStorage.setItem(`${STORAGE_KEY}-${uid}`, 'true');
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }, [uid]);

  if (profileLoading) return null;
  if (!user) return null;
  if (agentProfile.phonePaired) return null;
  if (agentProfile.confirmationChannel === 'email') return null;
  if (dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-[#0D4D4D] to-[#1a6868] rounded-lg p-4 mb-4 flex items-center gap-4 shadow-sm">
      <div className="w-10 h-10 rounded-full bg-[#3DD6C3]/20 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm">
          {agentProfile.pushRevoked
            ? 'Your phone dropped off — booking alerts stopped reaching it.'
            : 'Your booked leads can show up warm — straight from your phone.'}
        </p>
        <p className="text-white/75 text-xs mt-0.5">
          {agentProfile.pushRevoked
            ? 'Reconnect once to get tap-to-send confirmations back — takes about a minute.'
            : 'Pair once. When a lead books, you get a tap-to-send text with their confirmation and your prep page — your intro video, client stories, a quick intake.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => router.push('/dashboard/pair-phone')}
        className="bg-[#3DD6C3] text-[#0D4D4D] px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap hover:bg-[#5fe0d0] transition-colors"
      >
        {agentProfile.pushRevoked ? 'Reconnect' : 'Set up'}
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="text-white/60 hover:text-white/90 transition-colors p-1"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
