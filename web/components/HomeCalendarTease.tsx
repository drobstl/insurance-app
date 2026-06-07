'use client';

// Home-page Calendar entry point / Pro tease (IA v2). Pro agents get a quick
// "view your week" shortcut; lower tiers (Starter/Growth) get the same card
// framed as a Pro tease (badge + "Unlock with Pro" CTA). Both route to
// /dashboard/calendar, which serves the real week view or the upgrade card
// per tier — so this component never has to decide the destination, only the
// framing. Renders nothing when IA v2 is off (no calendar surface yet) or when
// lead mode is globally disabled.

import { useRouter } from 'next/navigation';
import { useDashboard } from '../app/dashboard/DashboardContext';
import { leadsAccessReason } from '../lib/tier-gating';

export default function HomeCalendarTease() {
  const router = useRouter();
  const { user, agentProfile, isAdmin } = useDashboard();

  const iaEnabled = isAdmin || process.env.NEXT_PUBLIC_IA_V2 === 'on';
  if (!iaEnabled) return null;

  const reason = leadsAccessReason(agentProfile.membershipTier, user?.email, agentProfile.trialEndsAt);
  if (reason === 'env_off') return null;
  const isPro = reason === 'accessible';

  return (
    <button
      type="button"
      onClick={() => router.push('/dashboard/calendar')}
      className="w-full text-left bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-8 hover:bg-[#f8f8f8] transition-colors group"
    >
      <div className="flex items-center gap-4">
        <div className="shrink-0 w-12 h-12 rounded-lg bg-[#daf3f0] flex items-center justify-center">
          <svg className="w-6 h-6 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[#000000]">Your week, one screen</h3>
            {!isPro && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#44bbaa]/15 text-[#005851]">
                Pro
              </span>
            )}
          </div>
          <p className="text-sm text-[#707070] mt-0.5">
            Every booked sit on a week grid — drag to reschedule, your Google calendar shaded in behind it.
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-[#005851] whitespace-nowrap group-hover:underline">
          {isPro ? 'View calendar →' : 'Unlock with Pro →'}
        </span>
      </div>
    </button>
  );
}
