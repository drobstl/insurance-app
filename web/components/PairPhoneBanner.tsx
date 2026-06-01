'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '../app/dashboard/DashboardContext';

/**
 * Dismissable banner shown at the top of the dashboard home until the
 * agent pairs their phone. Hides automatically once `phonePaired` is
 * true. Dismissal is per-device via localStorage — if they dismiss on
 * laptop and don't pair, the banner returns on next browser. Fine,
 * because once they pair it's gone forever regardless.
 *
 * Visual: subtle teal pill banner with a primary CTA. Sits above the
 * dashboard's existing content, doesn't dominate the page.
 */
const STORAGE_KEY = 'pair-phone-banner-dismissed';

export default function PairPhoneBanner() {
  const router = useRouter();
  const { user, agentProfile, profileLoading } = useDashboard();
  const [dismissed, setDismissed] = useState<boolean>(true);

  // Hydration-safe read of localStorage. We default to dismissed=true
  // so the banner doesn't briefly flash on the initial server render
  // before the client knows whether to show it.
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    const key = `${STORAGE_KEY}-${user.uid}`;
    const stored = window.localStorage.getItem(key);
    setDismissed(stored === 'true');
  }, [user]);

  if (profileLoading) return null;
  if (agentProfile.phonePaired) return null;
  if (dismissed) return null;
  if (!user) return null;

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`${STORAGE_KEY}-${user.uid}`, 'true');
    }
    setDismissed(true);
  };

  return (
    <div className="bg-gradient-to-r from-[#0D4D4D] to-[#1a6868] rounded-lg p-4 mb-6 flex items-center gap-4 shadow-sm">
      <div className="w-10 h-10 rounded-full bg-[#3DD6C3]/20 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm">
          Send appointment confirmations from your phone in two taps.
        </p>
        <p className="text-white/75 text-xs mt-0.5">
          Pair your phone once. When a lead books, you’ll get a notification — tap it and the text is ready to send.
        </p>
      </div>
      <button
        type="button"
        onClick={() => router.push('/dashboard/pair-phone')}
        className="bg-[#3DD6C3] text-[#0D4D4D] px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap hover:bg-[#5fe0d0] transition-colors"
      >
        Set up
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
