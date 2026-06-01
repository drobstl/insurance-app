'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';
import { isStripeBillableTier, PRICING_TIERS } from '../../lib/pricing';

/**
 * /signup — deferred-account entry (May 25, 2026).
 *
 * No Firebase Auth user is created here. The form posts email/name/
 * tier to /api/signup/start-checkout which creates a Stripe Checkout
 * session and writes a pendingSignups doc. The webhook creates the
 * Firebase user only after payment succeeds. See start-checkout
 * route for the full rationale.
 *
 * Routing rules:
 *   - No tier in URL → redirect to /pricing (preserving ?ref=).
 *     Closes the bare-/signup hole that let Pryor Hovis sign up
 *     without ever reaching Stripe.
 *   - Already-authed user → forward to /dashboard (the
 *     SubscriptionGate handles inactive subs).
 *   - Tier present + not authed → show the email/name form.
 */

/**
 * Resolves the FirstPromoter tracking id (tid) for the current visitor.
 * Returns null if no tid is available (visitor arrived without an
 * affiliate link, or fpr.js never loaded successfully).
 *
 * Order:
 *   1. `window.FPROM.data.tid` — populated synchronously by fpr.js
 *      once the queued `fpr("click")` from the root layout runs.
 *   2. `_fprom_tid` cookie — written by fpr.js after the click
 *      response. Canonical per FirstPromoter's own docs, and survives
 *      navigation, bfcache restore, and intermittent CDN failures
 *      when the global is missing.
 */
function resolveFpTid(): string | null {
  if (typeof window === 'undefined') return null;
  const fromGlobal = (
    window as unknown as { FPROM?: { data?: { tid?: string } } }
  ).FPROM?.data?.tid;
  if (typeof fromGlobal === 'string' && fromGlobal.length > 0) {
    return fromGlobal;
  }
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)_fprom_tid=([^;]+)/);
  if (!match) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return match[1].length > 0 ? match[1] : null;
  }
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<React.ReactNode>('');
  const [loading, setLoading] = useState(false);

  const [refCode, setRefCode] = useState<string | null>(null);
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const tierParam = searchParams.get('tier');
  const selectedTier = tierParam && isStripeBillableTier(tierParam) ? tierParam : null;
  const selectedTierInfo = selectedTier ? PRICING_TIERS[selectedTier] : null;
  // Coming-soon tiers cannot be purchased — even via a bookmarked
  // /signup?tier=pro URL. Mirror of the server-side block in
  // /api/signup/start-checkout. Bounce to /pricing with a notice
  // query param the pricing page can surface as a banner if desired.
  const tierComingSoon = !!selectedTierInfo?.comingSoon;

  // No-tier path (or coming-soon tier): route to /pricing so the user
  // can see the tier card with the Coming-soon badge + notify-me CTA.
  // Carry the ref code through so the referral credit isn't lost.
  useEffect(() => {
    if (selectedTier && !tierComingSoon) return;
    const ref = searchParams.get('ref');
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    if (tierComingSoon && selectedTier) params.set('notice', `${selectedTier}-coming-soon`);
    const qs = params.toString();
    router.replace(`/pricing${qs ? `?${qs}` : ''}`);
  }, [selectedTier, tierComingSoon, searchParams, router]);

  // Validate referral code (if present) and look up the referrer name
  // for the "Invited by ..." pill. Same UX as the previous flow.
  useEffect(() => {
    const code = searchParams.get('ref');
    if (!code) return;
    setRefCode(code);
    fetch('/api/agent-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setReferrerName(data.referrerName);
        } else {
          setRefCode(null);
        }
      })
      .catch(() => setRefCode(null));
  }, [searchParams]);

  // Already-authed visitors → /dashboard. Avoids re-running checkout
  // for someone who's already paid and just clicked a stale link.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setAuthChecked(true);
        return;
      }
      router.replace('/dashboard');
    });
    return unsub;
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTier) return;
    setError('');
    setLoading(true);

    try {
      // FirstPromoter tracking ID — forwarded into Stripe Checkout
      // metadata so FirstPromoter's Stripe listener can credit the
      // affiliate on conversion.
      //
      // Two sources, in order:
      //   1. `window.FPROM.data.tid` — set by fpr.js after the inline
      //      `fpr("click")` runs. This is the "happy path" — when the
      //      script loaded successfully on this page or a prior page
      //      this session.
      //   2. `_fprom_tid` cookie — written by fpr.js when the click
      //      response returns. Per FirstPromoter's own docs, the
      //      cookie IS the canonical source for the tid. We fall back
      //      to it when the global is missing because the script can
      //      be in an inconsistent state: e.g. fpr.js failed to load
      //      from CDN on this page (ad blocker, network blip, racing
      //      with bfcache restore after a Stripe Checkout back-nav).
      //
      // Verified May 31, 2026: the cookie and the global hold the
      // SAME UUID when both are present, so the cookie is a safe
      // recovery path. PR #58's metadata path on the server side
      // accepts the tid identically from either source.
      const fpTid = resolveFpTid();

      const res = await fetch('/api/signup/start-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim(),
          tier: selectedTier,
          refCode,
          fp_tid: fpTid,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }

      if (res.status === 409 && data.error === 'email_in_use') {
        setError(
          <>
            That email already has an account.{' '}
            <Link href="/login" className="font-semibold underline">
              Log in instead
            </Link>
            .
          </>,
        );
      } else if (data.error === 'invalid_email') {
        setError('Please enter a valid email address.');
      } else if (data.error === 'invalid_name') {
        setError('Please enter your full name.');
      } else {
        setError('Could not start checkout. Please try again.');
      }
    } catch (err) {
      console.error('[signup] start-checkout error', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // While the no-tier or coming-soon redirect resolves, hold a spinner
  // so the form never flashes on the way to /pricing.
  if (!selectedTier || tierComingSoon || !authChecked) {
    return (
      <div className="min-h-screen bg-[#e4e4e4] flex items-center justify-center">
        <svg className="animate-spin w-8 h-8 text-[#44bbaa]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#e4e4e4] relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 right-0 h-80 bg-gradient-to-b from-[#005851] to-[#003e3a]">
          <div className="absolute top-16 left-10 w-64 h-64 bg-[#45bcaa] rounded-full blur-3xl opacity-15"></div>
          <div className="absolute top-8 right-10 w-80 h-80 bg-[#45bcaa] rounded-full blur-3xl opacity-10"></div>
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-12">
        <Link href="/" className="flex items-center gap-3 mb-8 group">
          <img
            src="/logo.png"
            alt="AgentForLife Logo"
            className="w-20 h-12 object-contain group-hover:scale-105 transition-transform"
          />
          <span className="text-2xl text-white brand-title">AgentForLife™</span>
        </Link>

        <div className="w-full max-w-md">
          <div className="bg-white rounded-[5px] shadow-xl border border-[#d0d0d0] p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-[#005851]">Create Your Account</h1>
              <p className="text-[#707070] mt-2">Add your card on the next step. Set your password right after.</p>
            </div>

            {referrerName && (
              <div className="flex items-center gap-2 bg-[#f0faf8] rounded-[5px] px-4 py-2.5 mb-4 border border-[#44bbaa]/30">
                <svg className="w-4 h-4 text-[#005851] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>
                <p className="text-sm text-[#005851]">
                  Invited by <span className="font-bold">{referrerName}</span> — welcome to smarter client retention
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-[#f95951] rounded-[5px] p-4 flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#f95951] mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[#b20221] text-sm">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-[#000000] mb-2">
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  className="w-full px-4 py-3 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-[#000000] placeholder-[#707070] focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200"
                  placeholder="John Smith"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#000000] mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-[#000000] placeholder-[#707070] focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200"
                  placeholder="agent@insurance.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-[#a1c3be] disabled:cursor-not-allowed text-white font-semibold rounded-[5px] shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Redirecting to payment...
                  </>
                ) : (
                  'Continue to Payment'
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-[#d0d0d0]">
              <div className="flex items-center justify-center gap-2 text-[#707070] text-sm">
                <svg className="w-4 h-4 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>
                  {selectedTierInfo
                    ? selectedTierInfo.trialDays > 0
                      ? `${selectedTierInfo.name} · ${selectedTierInfo.trialDays}-day free trial · $${selectedTierInfo.priceMonthly}/mo after`
                      : `${selectedTierInfo.name} · $${selectedTierInfo.priceMonthly}/mo`
                    : ''}
                </span>
              </div>
            </div>

            <div className="mt-4 text-center">
              <p className="text-[#707070]">
                Already have an account?{' '}
                <Link href="/login" className="text-[#45bcaa] hover:text-[#005751] font-semibold transition-colors">
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link href="/pricing" className="text-[#707070] hover:text-[#005851] text-sm transition-colors inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to pricing
            </Link>
          </div>
        </div>

        <p className="text-center text-[#707070] text-sm mt-8">
          © 2026 AgentForLife. All rights reserved.
        </p>
      </div>
    </div>
  );
}
