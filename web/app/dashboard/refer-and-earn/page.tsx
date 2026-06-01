'use client';

import { useState } from 'react';
import { useDashboard } from '../DashboardContext';

/**
 * /dashboard/refer-and-earn — agent-facing affiliate program surface.
 *
 * Three states:
 *   1. Not enrolled — marketing copy + "Get my link" CTA.
 *   2. Enrolled — show tracking link + copy button + earnings math
 *      reminder + link to FirstPromoter affiliate dashboard for live
 *      stats.
 *   3. Unavailable (server says FP env vars not configured) — graceful
 *      "Coming soon" state. Lets us ship the surface ahead of the
 *      FIRSTPROMOTER_API_KEY / FIRSTPROMOTER_ACCOUNT_ID rollout.
 *
 * Per the May 30 growth + distribution lock
 * (`docs/AFL_Growth_Distribution_Lock_2026-05-30.md`):
 *   - Open enrollment (every agent can self-enroll, no waitlist)
 *   - 20% of year-1 subscription revenue, paid monthly via FP
 *   - $117.60/yr per Growth agent ($588 × 20%)
 *   - $237.60/yr per Pro agent ($1,188 × 20%)
 */

const GROWTH_ANNUAL = 49 * 12; // $588
const PRO_ANNUAL = 99 * 12; // $1,188
const COMMISSION_RATE = 0.2;
const GROWTH_PAYOUT = GROWTH_ANNUAL * COMMISSION_RATE; // $117.60
const PRO_PAYOUT = PRO_ANNUAL * COMMISSION_RATE; // $237.60

export default function ReferAndEarnPage() {
  const { user, agentProfile, refreshProfile } = useDashboard();
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const affiliate = agentProfile.affiliate;
  const isEnrolled = Boolean(affiliate?.refLink);

  const handleEnroll = async () => {
    if (!user) {
      setError('You need to be signed in to enroll.');
      return;
    }
    setError(null);
    setEnrolling(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/affiliate/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => null);
      if (res.status === 503 && data?.error === 'affiliate_program_unavailable') {
        setError(
          "The affiliate program isn't quite live yet — we're finalizing setup. Check back soon.",
        );
        return;
      }
      if (!res.ok) {
        setError(
          data?.message ||
            'Something went wrong setting up your link. Please try again in a moment.',
        );
        return;
      }
      // Server wrote `affiliate.refLink` to the agent doc. Re-fetch
      // the profile so this page re-renders in the enrolled state.
      // (DashboardContext uses one-shot getDoc, not a live snapshot.)
      await refreshProfile();
    } catch (err) {
      console.error('[refer-and-earn] enroll error', err);
      setError('Network error. Please try again.');
    } finally {
      setEnrolling(false);
    }
  };

  const handleCopyLink = async () => {
    if (!affiliate?.refLink) return;
    try {
      await navigator.clipboard.writeText(affiliate.refLink);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      // Clipboard API can fail on insecure contexts or older browsers;
      // fall back to the older execCommand path.
      try {
        const ta = document.createElement('textarea');
        ta.value = affiliate.refLink;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopyState('copied');
        setTimeout(() => setCopyState('idle'), 2000);
      } catch {
        setError('Could not copy the link automatically. You can select and copy it manually above.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] py-8 px-4 sm:px-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#005851]">Refer & Earn</h1>
          <p className="text-[#555] mt-2">
            Share AgentForLife with other agents — get paid every month they pay us.
          </p>
        </header>

        <section className="bg-white rounded-lg shadow-sm border border-[#e0e0e0] p-6 mb-6">
          <h2 className="text-xl font-semibold text-[#005851] mb-4">How it works</h2>
          <ol className="space-y-3 text-[#333]">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#45bcaa] text-white font-semibold text-sm flex items-center justify-center">
                1
              </span>
              <span>Get your unique referral link below.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#45bcaa] text-white font-semibold text-sm flex items-center justify-center">
                2
              </span>
              <span>
                Share it with other agents — IMO meetings, training calls, group chats, wherever.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#45bcaa] text-white font-semibold text-sm flex items-center justify-center">
                3
              </span>
              <span>
                When they sign up and pay, you earn{' '}
                <span className="font-semibold">20% of their first year</span> — paid monthly.
              </span>
            </li>
          </ol>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-[#e0e0e0] p-6 mb-6">
          <h2 className="text-xl font-semibold text-[#005851] mb-4">What you earn per agent</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="border border-[#e0e0e0] rounded-md p-4">
              <div className="text-sm text-[#666] mb-1">Growth ($49/mo)</div>
              <div className="text-2xl font-bold text-[#005851]">
                ${GROWTH_PAYOUT.toFixed(2)}
                <span className="text-base font-normal text-[#666]">/yr</span>
              </div>
              <div className="text-xs text-[#666] mt-1">
                20% of ${GROWTH_ANNUAL.toLocaleString()} year-1 revenue
              </div>
            </div>
            <div className="border border-[#e0e0e0] rounded-md p-4">
              <div className="text-sm text-[#666] mb-1">Pro ($99/mo)</div>
              <div className="text-2xl font-bold text-[#005851]">
                ${PRO_PAYOUT.toFixed(2)}
                <span className="text-base font-normal text-[#666]">/yr</span>
              </div>
              <div className="text-xs text-[#666] mt-1">
                20% of ${PRO_ANNUAL.toLocaleString()} year-1 revenue
              </div>
            </div>
          </div>
          <p className="text-xs text-[#666] mt-4">
            Year-1 only — no perpetual residual. Bring 25 agents and you're looking at
            ${(GROWTH_PAYOUT * 25).toLocaleString()}+ a year passive.
          </p>
        </section>

        {isEnrolled ? (
          <section className="bg-white rounded-lg shadow-md border-2 border-[#45bcaa] p-6 relative overflow-hidden">
            {/* Subtle "you're in" tint stripe down the side */}
            <div className="absolute top-0 left-0 bottom-0 w-1 bg-[#45bcaa]" aria-hidden="true" />
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#daf3f0] flex items-center justify-center">
                <svg className="w-6 h-6 text-[#0d8a7a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#005851]">You&apos;re enrolled</h2>
                <p className="text-sm text-[#0d8a7a] font-medium">Share your link and start earning.</p>
              </div>
            </div>
            <div className="text-sm font-semibold text-[#005851] mb-2">Your referral link</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={affiliate!.refLink}
                readOnly
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 px-4 py-2 border border-[#d0d0d0] rounded-md bg-[#fafafa] text-[#333] font-mono text-sm"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-4 py-2 bg-[#45bcaa] text-white font-semibold rounded-md hover:bg-[#3aab9a] transition-colors"
              >
                {copyState === 'copied' ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-[#666] mt-2">
              Anyone who clicks this link and signs up will be tagged to you for a full year.
            </p>
            <div className="mt-6 pt-6 border-t border-[#e0e0e0]">
              <h3 className="text-sm font-semibold text-[#005851] mb-2">Track your earnings</h3>
              <p className="text-sm text-[#555] mb-3">
                Clicks, signups, and payouts are tracked in FirstPromoter — our affiliate
                partner. You'll get a separate login from them by email.
              </p>
              <a
                href="https://app.firstpromoter.com/login"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#45bcaa] hover:text-[#3aab9a] font-semibold inline-flex items-center gap-1"
              >
                Open FirstPromoter dashboard
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          </section>
        ) : (
          <section className="bg-white rounded-lg shadow-sm border border-[#e0e0e0] p-6">
            <h2 className="text-xl font-semibold text-[#005851] mb-4">Get your link</h2>
            <p className="text-[#555] mb-4">
              Click below and we'll create your unique referral link. Takes about 2 seconds.
            </p>
            {error && (
              <div className="mb-4 px-4 py-3 bg-[#fff4f4] border border-[#f4caca] rounded-md text-[#a02020] text-sm">
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={handleEnroll}
              disabled={enrolling || !user}
              className="px-6 py-3 bg-[#45bcaa] text-white font-semibold rounded-md hover:bg-[#3aab9a] disabled:bg-[#bbb] disabled:cursor-not-allowed transition-colors"
            >
              {enrolling ? 'Setting up…' : 'Get my referral link'}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
