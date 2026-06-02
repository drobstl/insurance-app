'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from './DashboardContext';
import { isTrialActive } from '../../lib/tier-gating';
import { PRICING_TIERS } from '../../lib/pricing';

/**
 * PlanPickerGate — the day-12 "back wall" of the no-card trial
 * (Entry-mechanism cutover, Phase 2; May 30 Growth + Distribution Lock
 * §2). A full-screen, non-dismissable overlay shown to trial agents in
 * the final stretch of their trial. The ONLY ways out are the three
 * explicit choices — there is no close button and the backdrop doesn't
 * dismiss — but one of them ("Stay Free") is a one-click, no-cost path,
 * so the wall never traps anyone behind a paywall.
 *
 * Self-gating: it reads the live profile and renders null unless the
 * agent is on an ACTIVE trial whose end is within PICKER_WINDOW_MS. A
 * Free agent (already chose / defaulted) fails `isTrialActive`, so it
 * disappears the moment they pick. Mounted once inside SubscriptionGate.
 *
 * Pro respects `PRICING_TIERS.pro.comingSoon`: while Pro isn't bookable
 * its card shows a "Coming soon" state instead of a live checkout CTA.
 * Flip that one flag in pricing.ts and the Pro CTA lights up — no change
 * here.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
// Show the picker once the trial has 2 days or less remaining (the
// "day 12" of a 14-day trial). Kept in sync conceptually with the
// trial-lifecycle cron's REMINDER_WINDOW_MS.
const PICKER_WINDOW_MS = 2 * DAY_MS;

type PendingChoice = 'growth' | 'pro' | 'free' | null;

export default function PlanPickerGate() {
  const { user, agentProfile } = useDashboard();
  const [pending, setPending] = useState<PendingChoice>(null);
  const [error, setError] = useState<string | null>(null);

  const trialEndsAtMs =
    typeof agentProfile.trialEndsAt === 'number' ? agentProfile.trialEndsAt : null;

  const show = useMemo(() => {
    if (!user) return false;
    if (!isTrialActive(agentProfile.membershipTier, trialEndsAtMs)) return false;
    if (trialEndsAtMs == null) return false;
    return trialEndsAtMs - Date.now() <= PICKER_WINDOW_MS;
  }, [user, agentProfile.membershipTier, trialEndsAtMs]);

  if (!show) return null;

  const daysLeft = trialEndsAtMs
    ? Math.max(1, Math.ceil((trialEndsAtMs - Date.now()) / DAY_MS))
    : 1;

  const growth = PRICING_TIERS.growth;
  const pro = PRICING_TIERS.pro;
  const free = PRICING_TIERS.free;

  const startCheckout = async (tier: 'growth' | 'pro') => {
    if (!user || pending) return;
    setError(null);
    setPending(tier);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tier, returnPath: '/dashboard' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data?.url === 'string') {
        window.location.href = data.url;
        return; // navigating away; keep the spinner
      }
      throw new Error(typeof data?.error === 'string' ? data.error : 'checkout_failed');
    } catch (e) {
      console.error('[plan-picker] checkout failed', e);
      setError("We couldn't start checkout. Please try again in a moment.");
      setPending(null);
    }
  };

  const chooseFree = async () => {
    if (!user || pending) return;
    setError(null);
    setPending('free');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/trial/stay-free', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        // Reload so the gate re-reads the now-Free profile: the picker
        // disappears (no longer a trial) and the dashboard renders.
        window.location.reload();
        return;
      }
      throw new Error('stay_free_failed');
    } catch (e) {
      console.error('[plan-picker] stay-free failed', e);
      setError("We couldn't switch you to the free plan. Please try again.");
      setPending(null);
    }
  };

  const busy = pending !== null;
  const proComingSoon = pro.comingSoon === true;

  return (
    <div className="fixed inset-0 z-[200] bg-[#003f3a]/95 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="my-8 w-full max-w-4xl bg-white rounded-[10px] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#005851] px-6 py-6 sm:px-8 text-center">
          <p className="text-[#9fe6db] text-xs font-bold uppercase tracking-widest mb-1">
            {daysLeft === 1 ? 'Your trial ends tomorrow' : `Your trial ends in ${daysLeft} days`}
          </p>
          <h2 className="text-white text-2xl sm:text-3xl font-bold">Pick how you want to keep going</h2>
          <p className="text-white/70 text-sm mt-2 max-w-xl mx-auto">
            Your account and your whole book stay put either way. Choose a plan to keep the engine running, or stay free and the engine simply pauses until you switch it back on. No surprise charges — ever.
          </p>
        </div>

        {error && (
          <div className="mx-6 mt-5 sm:mx-8 rounded-[6px] border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3">
            <p className="text-sm text-[#B91C1C]">{error}</p>
          </div>
        )}

        {/* Cards */}
        <div className="p-6 sm:p-8 grid gap-4 md:grid-cols-3">
          {/* Growth — the bookable paid anchor */}
          <div className="relative flex flex-col rounded-[8px] border-2 border-[#44bbaa] p-5">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#44bbaa] text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
              Most popular
            </span>
            <h3 className="text-lg font-bold text-[#005851]">{growth.name}</h3>
            <p className="text-xs text-[#6B7280] mb-3">{growth.tagline}</p>
            <p className="mb-4">
              <span className="text-3xl font-extrabold text-[#0D4D4D]">${growth.priceMonthly}</span>
              <span className="text-sm text-[#6B7280]">/mo</span>
            </p>
            <ul className="space-y-2 mb-5 flex-1">
              {growth.bullets.slice(0, 4).map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-[#374151]">
                  <svg className="w-4 h-4 text-[#44bbaa] mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>
            <button
              onClick={() => startCheckout('growth')}
              disabled={busy}
              className="w-full py-2.5 px-4 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[6px] transition-colors disabled:opacity-60"
            >
              {pending === 'growth' ? 'Starting checkout…' : `Choose ${growth.name}`}
            </button>
          </div>

          {/* Pro — keeps everything they used during the trial */}
          <div className="relative flex flex-col rounded-[8px] border border-[#d0d0d0] p-5">
            <h3 className="text-lg font-bold text-[#005851]">{pro.name}</h3>
            <p className="text-xs text-[#6B7280] mb-3">{pro.tagline}</p>
            <p className="mb-4">
              <span className="text-3xl font-extrabold text-[#0D4D4D]">${pro.priceMonthly}</span>
              <span className="text-sm text-[#6B7280]">/mo</span>
            </p>
            <ul className="space-y-2 mb-5 flex-1">
              {pro.bullets.slice(0, 4).map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-[#374151]">
                  <svg className="w-4 h-4 text-[#44bbaa] mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>
            {proComingSoon ? (
              <button
                disabled
                className="w-full py-2.5 px-4 bg-[#f1f1f1] text-[#9CA3AF] font-semibold rounded-[6px] cursor-default"
              >
                Coming soon
              </button>
            ) : (
              <button
                onClick={() => startCheckout('pro')}
                disabled={busy}
                className="w-full py-2.5 px-4 bg-[#005851] hover:bg-[#0D4D4D] text-white font-semibold rounded-[6px] transition-colors disabled:opacity-60"
              >
                {pending === 'pro' ? 'Starting checkout…' : `Choose ${pro.name}`}
              </button>
            )}
          </div>

          {/* Stay Free — the one-click, no-cost path */}
          <div className="relative flex flex-col rounded-[8px] border border-[#d0d0d0] p-5">
            <h3 className="text-lg font-bold text-[#005851]">{free.name}</h3>
            <p className="text-xs text-[#6B7280] mb-3">{free.tagline}</p>
            <p className="mb-4">
              <span className="text-3xl font-extrabold text-[#0D4D4D]">$0</span>
              <span className="text-sm text-[#6B7280]">/mo</span>
            </p>
            <ul className="space-y-2 mb-5 flex-1">
              {free.bullets.slice(0, 4).map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-[#374151]">
                  <svg className="w-4 h-4 text-[#9CA3AF] mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>
            <button
              onClick={chooseFree}
              disabled={busy}
              className="w-full py-2.5 px-4 border border-[#005851] text-[#005851] hover:bg-[#f0faf8] font-semibold rounded-[6px] transition-colors disabled:opacity-60"
            >
              {pending === 'free' ? 'Switching…' : 'Stay free'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
