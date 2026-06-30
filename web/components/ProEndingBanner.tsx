'use client';

import { useEffect, useState } from 'react';
import { useDashboard } from '../app/dashboard/DashboardContext';

/**
 * "Your free Pro is ending" banner. Shown at the top of the dashboard home in
 * the final 10 days before a comped Pro subscription's scheduled cancellation
 * (`subscriptionCancelAt`). Gives the agent three choices:
 *
 *   - Keep Pro ($99/mo)      → POST /api/stripe/resolve-comp { keep_pro }
 *   - Switch to Growth ($49) → POST /api/stripe/resolve-comp { switch_growth }
 *   - Let it end (no charge) → just dismiss; the scheduled cancel handles it.
 *
 * The default — do nothing — is the safe path: the subscription simply cancels
 * on the date and the card is never charged. Picking a paid option clears the
 * scheduled cancel server-side so it continues at the chosen price.
 *
 * Dismissal is per-device via localStorage, keyed by uid + the cancel date so a
 * dismissal only suppresses THIS window. Defaults to dismissed=true so the
 * banner never flashes before the client knows the subscription state.
 */
const STORAGE_KEY = 'pro-ending-banner-dismissed';
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 10;

type Choice = 'keep_pro' | 'switch_growth';

export default function ProEndingBanner() {
  const { user, agentProfile, profileLoading } = useDashboard();
  const [dismissed, setDismissed] = useState<boolean>(true);
  const [loading, setLoading] = useState<Choice | null>(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const cancelAtMs = agentProfile.subscriptionCancelAt ?? null;
  const tier = agentProfile.membershipTier;
  const hasProAccess = tier === 'pro' || tier === 'agency';
  const msLeft = cancelAtMs ? cancelAtMs - Date.now() : null;
  const inWindow =
    msLeft != null && msLeft > 0 && msLeft <= WINDOW_DAYS * DAY_MS;
  const eligible = hasProAccess && inWindow;

  const storageKey =
    user && cancelAtMs ? `${STORAGE_KEY}-${user.uid}-${cancelAtMs}` : null;

  // Hydration-safe localStorage read; default dismissed=true avoids a flash.
  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) return;
    setDismissed(window.localStorage.getItem(storageKey) === 'true');
  }, [storageKey]);

  if (profileLoading || !user || !eligible) return null;
  if (dismissed && !result) return null;

  const daysLeft = Math.max(1, Math.ceil((msLeft as number) / DAY_MS));
  const endDate = new Date(cancelAtMs as number).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });

  const persistDismiss = () => {
    if (typeof window !== 'undefined' && storageKey) {
      window.localStorage.setItem(storageKey, 'true');
    }
    setDismissed(true);
  };

  const handleResolve = async (choice: Choice) => {
    if (!user || loading) return;
    setLoading(choice);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/stripe/resolve-comp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ choice }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      setResult({
        ok: true,
        msg:
          choice === 'keep_pro'
            ? `You’re all set — Pro continues at $99/mo after ${endDate}. Your card won’t be charged before then.`
            : `Done — you’ll move to Growth ($49/mo) after ${endDate}. You keep Pro until then, and your card isn’t charged before that.`,
      });
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setLoading(null);
    }
  };

  // ── Success / error confirmation state ──
  if (result) {
    return (
      <div
        className={`rounded-lg p-4 mb-6 flex items-center gap-3 shadow-sm ${
          result.ok
            ? 'bg-gradient-to-r from-[#0D4D4D] to-[#1a6868]'
            : 'bg-red-50 ring-1 ring-inset ring-red-200'
        }`}
      >
        <p className={`flex-1 text-sm ${result.ok ? 'text-white' : 'text-red-700'}`}>
          {result.ok ? '✓ ' : ''}
          {result.msg}
        </p>
        <button
          type="button"
          onClick={() => {
            if (result.ok) persistDismiss();
            setResult(null);
          }}
          aria-label="Close"
          className={`p-1 flex-shrink-0 transition-colors ${
            result.ok ? 'text-white/60 hover:text-white/90' : 'text-red-400 hover:text-red-600'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  // ── Decision banner ──
  return (
    <div className="bg-gradient-to-r from-[#0D4D4D] to-[#1a6868] rounded-lg p-4 mb-6 shadow-sm ring-1 ring-inset ring-[#fdcc02]/40">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-[#fdcc02]/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-[#fdcc02]">
            Your free Pro ends in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}.
          </p>
          <p className="text-white/80 text-xs mt-0.5">
            On {endDate} your 3 free months wrap up. Keep everything running, switch to a
            lighter plan, or let it wind down — your card won’t be charged unless you choose
            to continue.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => handleResolve('keep_pro')}
              disabled={loading !== null}
              className="bg-[#fdcc02] text-[#0D4D4D] px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap hover:bg-[#ffd633] transition-colors disabled:opacity-60"
            >
              {loading === 'keep_pro' ? 'Saving…' : 'Keep Pro — $99/mo'}
            </button>
            <button
              type="button"
              onClick={() => handleResolve('switch_growth')}
              disabled={loading !== null}
              className="bg-white/10 text-white px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap hover:bg-white/20 transition-colors ring-1 ring-inset ring-white/25 disabled:opacity-60"
            >
              {loading === 'switch_growth' ? 'Saving…' : 'Switch to Growth — $49/mo'}
            </button>
            <button
              type="button"
              onClick={persistDismiss}
              disabled={loading !== null}
              className="text-white/65 hover:text-white/90 px-2 py-2 text-sm whitespace-nowrap transition-colors disabled:opacity-60"
            >
              Let it end (no charge)
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={persistDismiss}
          aria-label="Dismiss"
          className="text-white/60 hover:text-white/90 transition-colors p-1 flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
