'use client';

// Top-level Calendar surface (IA v2). The calendar started life as a tab
// inside Leads; it's "time" — its own noun that grows past pre-sale sits
// into client reviews, retention touchpoints, and birthdays — so it earns
// its own home. The week view itself is the same self-contained
// LeadsCalendar the Leads page renders (Firestore sits + Google busy);
// here it just gets a route + page chrome.
//
// Gating mirrors the Leads page, because the calendar surfaces the
// pre-sale pipeline's booked sits — Pro-tier value:
//   1. iaEnabled (isAdmin || NEXT_PUBLIC_IA_V2==='on') — the single
//      dark-launch switch for all of IA v2; off → admins only.
//   2. leadsAccessReason — the SAME Pro+ tier gate Leads uses, so a
//      non-Pro agent gets the upgrade card here too instead of an empty
//      calendar. When Calendar was a Leads tab this came for free; the
//      promotion to a standalone route has to re-assert it so the two
//      surfaces can't drift.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '../DashboardContext';
import { leadsAccessReason } from '../../../lib/tier-gating';
import LeadsCalendar from '../../../components/LeadsCalendar';
import UpgradeToProCard from '../../../components/UpgradeToProCard';

export default function CalendarPage() {
  const router = useRouter();
  const { user, agentProfile, profileLoading, isAdmin } = useDashboard();
  const iaEnabled = isAdmin || process.env.NEXT_PUBLIC_IA_V2 === 'on';
  const reason = leadsAccessReason(agentProfile.membershipTier, user?.email, agentProfile.trialEndsAt);

  useEffect(() => {
    // Wait for the profile so an admin / Pro agent mid-load isn't bounced.
    if (!user || profileLoading) return;
    // Calendar dark-launched off for this agent, OR lead mode globally
    // disabled → no surface to show; send them home.
    if (!iaEnabled || reason === 'env_off') router.replace('/dashboard');
  }, [user, profileLoading, iaEnabled, reason, router]);

  if (!user || profileLoading) return null;
  if (!iaEnabled || reason === 'env_off') return null;
  // Pro+ gate — identical to the Leads page so Calendar can't outrun it.
  if (reason === 'tier_locked') {
    return <UpgradeToProCard surface="leads" />;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-extrabold text-[#005851]">Calendar</h1>
        <p className="text-sm text-[#707070] mt-0.5">
          Your week — booked sits up front, your Google busy-blocks behind them.
        </p>
      </div>
      {/* "Go to call queue" drops into the Leads Call mode via ?call=1. */}
      <LeadsCalendar onGoToQueue={() => router.push('/dashboard/leads?call=1')} />
    </div>
  );
}
