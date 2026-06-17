'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { doc, collection, onSnapshot, query, where, Timestamp, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { DashboardProvider, useDashboard } from './DashboardContext';
import PlanPickerGate from './PlanPickerGate';
import PWAInstaller from '../../components/PWAInstaller';
import AdminGrowthBadge from '../../components/AdminGrowthBadge';
import MaintenanceBanner from '../../components/MaintenanceBanner';
import DashboardAssistant from '../../components/DashboardAssistant';
import DashboardTicker from '../../components/DashboardTicker';
import MfaGate, { MfaHeadsUpBanner } from '../../components/MfaGate';
import type { AgentAggregates } from '../../lib/stats-aggregation';
import { computeAPV } from '../../lib/apv';
import { ANALYTICS_EVENTS } from '../../lib/analytics-events';
import { captureEvent } from '../../lib/posthog';
import { leadsAccessReason, activityAccessReason, isTrialActive, isProOrAbove, isFreeTier, performanceAccess } from '../../lib/tier-gating';

const FOUNDING_ACTIVATION_TIMEOUT_MS = 12000;
// Hard ceiling for the activation spinner: if `activatingFounding` is still true
// after this many ms, force-resolve and surface a user-visible error. Lifetime
// is tied solely to `activatingFounding`, not to the activation effect's deps,
// so it cannot be cleared by `profileLoading` flicker during `refreshProfile()`.
const ACCESS_GATE_ACTIVATION_HARD_TIMEOUT_MS = 13000;
// Top-level gate ceiling: if any loading state has been continuously true for
// this long, the gate is considered hung. Independent of `activatingFounding`
// so it also catches `loading` / `profileLoading` regressions.
const ACCESS_GATE_OVERALL_HARD_TIMEOUT_MS = 15000;
const ACCESS_GATE_ERROR_MESSAGE = 'We could not verify account access automatically. You can retry now or continue below.';
const GATE_HARD_TIMEOUT_MESSAGE = 'Account access is taking longer than expected. Try refreshing, or sign out and try again.';

function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { user, loading, profileLoading, agentProfile, handleLogout, refreshProfile } = useDashboard();
  const router = useRouter();
  // Access is granted by an active paid subscription OR an active no-card
  // trial (Entry-mechanism cutover, Phase 1). Trial users have no
  // subscription, so a `subscriptionStatus === 'active'` check alone would
  // wall them out of the dashboard. Computed once and used for the
  // founding-activation skip, the resolution telemetry, and the gate render.
  const hasAccess =
    agentProfile.subscriptionStatus === 'active' ||
    isTrialActive(agentProfile.membershipTier, agentProfile.trialEndsAt) ||
    // Entry-mechanism cutover, Phase 2: the post-trial Free tier is a
    // real (unpaid) membership, not a locked-out state. It's
    // data-preserved — the agent's whole book stays viewable and
    // exportable — so admit it, letting an expired trial land on the
    // dashboard instead of the "Subscription Required" wall. Free's
    // limits are enforced downstream, never by walling the dashboard:
    // pre-sale tools stay locked via hasProAccess, and the active engine
    // (automated outreach + new application parsing) is paused by
    // outbound crons skipping Free + upload gating at the UI.
    isFreeTier(agentProfile.membershipTier);
  const [activatingFounding, setActivatingFounding] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationRetryNonce, setActivationRetryNonce] = useState(0);
  const [gateHardTimedOut, setGateHardTimedOut] = useState(false);
  const activationAttemptedForUserRef = useRef<string | null>(null);
  const gateStartedAtRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : 0);
  const resolutionEmittedRef = useRef(false);

  // Mirror latest gate-state values into a ref so timer callbacks can read fresh
  // values without triggering effect re-runs (which would reset their timers).
  const gateStateRef = useRef({
    loading,
    profileLoading,
    activatingFounding,
    hasUser: Boolean(user),
    subscriptionStatus: agentProfile.subscriptionStatus,
  });
  gateStateRef.current = {
    loading,
    profileLoading,
    activatingFounding,
    hasUser: Boolean(user),
    subscriptionStatus: agentProfile.subscriptionStatus,
  };

  useEffect(() => {
    if (!user || loading || profileLoading) return;
    const status = agentProfile.subscriptionStatus;
    // Active sub OR active trial → already has access; clear any prior
    // activation error and skip the founding-member auto-attempt. A trial
    // user has no `subscriptionStatus`, so without this they'd fall through
    // to the founding-activation fetch below.
    if (hasAccess) {
      setActivationError(null);
      return;
    }
    // Only auto-check founding activation for unknown/new account states.
    if (status && status !== 'inactive' && status !== 'none') return;
    const attemptKey = `${user.uid}:${activationRetryNonce}`;
    if (activationAttemptedForUserRef.current === attemptKey) return;

    activationAttemptedForUserRef.current = attemptKey;

    const tryFoundingActivation = async () => {
      setActivatingFounding(true);
      setActivationError(null);
      const startedAt = performance.now();
      let timedOut = false;
      let requestTimeout: ReturnType<typeof setTimeout> | null = null;
      let tokenTimeout: ReturnType<typeof setTimeout> | null = null;
      const statusBefore = status || 'unknown';

      captureEvent(ANALYTICS_EVENTS.DASHBOARD_ACCESS_GATE_CHECK, {
        stage: 'start',
        status_before: statusBefore,
      });

      try {
        const token = await Promise.race<string>([
          user.getIdToken(),
          new Promise<string>((_, reject) => {
            tokenTimeout = setTimeout(() => {
              timedOut = true;
              captureEvent(ANALYTICS_EVENTS.DASHBOARD_ACCESS_GATE_CHECK, {
                stage: 'timeout',
                status_before: statusBefore,
                reason: 'id_token_timeout',
                duration_ms: Math.round(performance.now() - startedAt),
              });
              reject(new Error('id_token_timeout'));
            }, FOUNDING_ACTIVATION_TIMEOUT_MS);
          }),
        ]);
        const controller = new AbortController();
        requestTimeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
          captureEvent(ANALYTICS_EVENTS.DASHBOARD_ACCESS_GATE_CHECK, {
            stage: 'timeout',
            status_before: statusBefore,
            duration_ms: Math.round(performance.now() - startedAt),
          });
          setActivationError(ACCESS_GATE_ERROR_MESSAGE);
        }, FOUNDING_ACTIVATION_TIMEOUT_MS);
        const res = await fetch('/api/founding-member/activate', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result?.activated) {
          captureEvent(ANALYTICS_EVENTS.DASHBOARD_ACCESS_GATE_CHECK, {
            stage: 'success',
            status_before: statusBefore,
            activated: true,
            http_status: res.status,
            duration_ms: Math.round(performance.now() - startedAt),
          });
          await refreshProfile();
        } else {
          captureEvent(ANALYTICS_EVENTS.DASHBOARD_ACCESS_GATE_CHECK, {
            stage: 'not_activated',
            status_before: statusBefore,
            activated: false,
            reason: typeof result?.reason === 'string' ? result.reason : undefined,
            http_status: res.status,
            duration_ms: Math.round(performance.now() - startedAt),
          });
        }
      } catch (error) {
        if (error instanceof Error && (error.name === 'AbortError' || error.message === 'id_token_timeout')) {
          setActivationError(ACCESS_GATE_ERROR_MESSAGE);
        }
        if (!timedOut) {
          captureEvent(ANALYTICS_EVENTS.DASHBOARD_ACCESS_GATE_CHECK, {
            stage: 'error',
            status_before: statusBefore,
            reason: error instanceof Error ? error.name : 'unknown_error',
            duration_ms: Math.round(performance.now() - startedAt),
          });
        }
        console.error('Founding activation check failed:', error);
      } finally {
        if (requestTimeout) clearTimeout(requestTimeout);
        if (tokenTimeout) clearTimeout(tokenTimeout);
        // Always exit the spinner state. Previously this was guarded by a
        // `cancelled` flag set by the effect's cleanup function — but
        // `refreshProfile()` flicks `profileLoading` to true synchronously,
        // which re-runs this effect and triggers cleanup mid-flight, leaving
        // `activatingFounding` permanently true on the success path. Setting
        // state on a stale closure is a React 18+ no-op; the unconditional
        // call is what makes the spinner exit hang-proof.
        setActivatingFounding(false);
      }
    };

    void tryFoundingActivation();
    // No cleanup function: in-flight activation must run its `finally` block.
    // Hang protection is provided by the activation hard-timeout effect below
    // (keyed on `activatingFounding`) and the gate ceiling effect, both of
    // which have lifetimes independent of this effect's deps.
  }, [user, loading, profileLoading, hasAccess, agentProfile.subscriptionStatus, refreshProfile, activationRetryNonce]);

  // Activation hard timeout — keyed solely on `activatingFounding` so its
  // lifetime is tied to the spinner being shown, not to the activation
  // effect's deps. Cannot be inadvertently cleared by `profileLoading`
  // flicker during `refreshProfile()`.
  useEffect(() => {
    if (!activatingFounding) return;
    const startedAt = performance.now();
    const timer = window.setTimeout(() => {
      console.warn('Founding activation check timed out (activation hard timeout).');
      setActivatingFounding(false);
      setActivationError(ACCESS_GATE_ERROR_MESSAGE);
      const snapshot = gateStateRef.current;
      captureEvent(ANALYTICS_EVENTS.DASHBOARD_AUTH_GATE_TIMEOUT, {
        phase: 'activation',
        duration_ms: Math.round(performance.now() - startedAt),
        was_loading: snapshot.loading,
        was_profile_loading: snapshot.profileLoading,
        was_activating_founding: snapshot.activatingFounding,
        had_user: snapshot.hasUser,
        subscription_status_known: Boolean(snapshot.subscriptionStatus),
      });
    }, ACCESS_GATE_ACTIVATION_HARD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [activatingFounding]);

  // Top-level gate ceiling — fires if the gate is continuously in any loading
  // state past the bound, surfacing a user-visible recovery UI. Independent of
  // every other timer; this is the backstop for hypothetical regressions in
  // `loading` or `profileLoading` paths.
  const isAnyLoading = loading || profileLoading || activatingFounding;
  useEffect(() => {
    if (!isAnyLoading) {
      setGateHardTimedOut(false);
      return;
    }
    const startedAt = performance.now();
    const timer = window.setTimeout(() => {
      const snapshot = gateStateRef.current;
      console.warn('Dashboard auth gate hard timeout reached.', snapshot);
      setGateHardTimedOut(true);
      captureEvent(ANALYTICS_EVENTS.DASHBOARD_AUTH_GATE_TIMEOUT, {
        phase: 'overall',
        duration_ms: Math.round(performance.now() - startedAt),
        was_loading: snapshot.loading,
        was_profile_loading: snapshot.profileLoading,
        was_activating_founding: snapshot.activatingFounding,
        had_user: snapshot.hasUser,
        subscription_status_known: Boolean(snapshot.subscriptionStatus),
      });
    }, ACCESS_GATE_OVERALL_HARD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isAnyLoading]);

  // Emit `dashboard_auth_gate_resolved` exactly once per gate cycle. A new
  // cycle begins on retry (handled in the retry button) or on user change.
  const userKey = user?.uid ?? null;
  useEffect(() => {
    resolutionEmittedRef.current = false;
    gateStartedAtRef.current = performance.now();
  }, [userKey]);

  useEffect(() => {
    if (resolutionEmittedRef.current) return;
    if (gateHardTimedOut) {
      resolutionEmittedRef.current = true;
      captureEvent(ANALYTICS_EVENTS.DASHBOARD_AUTH_GATE_RESOLVED, {
        outcome: 'timeout',
        duration_ms: Math.round(performance.now() - gateStartedAtRef.current),
      });
      return;
    }
    if (loading || profileLoading || activatingFounding) return;
    if (activationError) {
      resolutionEmittedRef.current = true;
      captureEvent(ANALYTICS_EVENTS.DASHBOARD_AUTH_GATE_RESOLVED, {
        outcome: 'error',
        duration_ms: Math.round(performance.now() - gateStartedAtRef.current),
      });
      return;
    }
    if (hasAccess) {
      resolutionEmittedRef.current = true;
      captureEvent(ANALYTICS_EVENTS.DASHBOARD_AUTH_GATE_RESOLVED, {
        outcome: 'authenticated',
        duration_ms: Math.round(performance.now() - gateStartedAtRef.current),
      });
    }
  }, [
    gateHardTimedOut,
    loading,
    profileLoading,
    activatingFounding,
    activationError,
    hasAccess,
  ]);

  const handleRetryActivation = useCallback(() => {
    activationAttemptedForUserRef.current = null;
    setActivationError(null);
    setGateHardTimedOut(false);
    resolutionEmittedRef.current = false;
    gateStartedAtRef.current = performance.now();
    setActivationRetryNonce((prev) => prev + 1);
  }, []);

  if (gateHardTimedOut) {
    return (
      <div className="min-h-screen bg-[#e4e4e4] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-[5px] shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-[#FEF3C7] rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-[#D97706]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-[#005851] mb-3">We&apos;re having trouble loading your dashboard</h2>
            <p className="text-[#6B7280] mb-6">{GATE_HARD_TIMEOUT_MESSAGE}</p>
            <div className="space-y-2">
              <button
                onClick={() => { window.location.reload(); }}
                className="w-full py-3 px-6 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors"
              >
                Refresh page
              </button>
              <button
                onClick={() => { void handleLogout(); }}
                className="w-full py-3 px-6 border border-[#005851] text-[#005851] hover:bg-[#f0faf8] font-semibold rounded-[5px] transition-colors"
              >
                Sign out and try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-[#e4e4e4] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin w-10 h-10 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-[#000000]">Loading account...</p>
        </div>
      </div>
    );
  }

  if (activatingFounding) {
    return (
      <div className="min-h-screen bg-[#e4e4e4] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin w-10 h-10 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-[#000000]">Checking account access...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-[#e4e4e4]">
        <nav className="bg-[#005851]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#44bbaa] rounded-[5px] flex items-center justify-center shadow-lg shadow-[#45bcaa]/30">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <span className="text-xl font-bold text-white">Agent Portal</span>
              </div>
              <button onClick={handleLogout} className="px-4 py-2 text-white/80 hover:text-white transition-colors text-sm">
                Sign Out
              </button>
            </div>
          </div>
        </nav>
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)] p-4">
          <div className="max-w-md w-full">
            <div className="bg-white rounded-[5px] shadow-xl p-8 text-center">
              <div className="w-16 h-16 bg-[#FEF3C7] rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-[#D97706]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-[#005851] mb-3">Subscription Required</h2>
              {activationError && (
                <div className="mb-4 rounded-[5px] border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-left">
                  <p className="text-sm text-[#92400E]">{activationError}</p>
                  <button
                    onClick={handleRetryActivation}
                    className="mt-2 text-sm font-semibold text-[#0F766E] hover:text-[#115E59] transition-colors"
                  >
                    Retry account check
                  </button>
                </div>
              )}
              <p className="text-[#6B7280] mb-6">
                {agentProfile.subscriptionStatus === 'canceled'
                  ? 'Your subscription has been canceled. Please resubscribe to continue using the dashboard.'
                  : agentProfile.subscriptionStatus === 'past_due'
                  ? 'Your payment is past due. Please update your payment method to continue.'
                  : 'You need an active subscription to access the agent dashboard and manage your clients.'}
              </p>
              <button
                onClick={() => router.push('/subscribe')}
                className="w-full py-3 px-6 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                {agentProfile.subscriptionStatus === 'canceled' || agentProfile.subscriptionStatus === 'past_due'
                  ? 'Reactivate Subscription'
                  : 'Subscribe Now'}
              </button>
              <p className="text-sm text-[#9CA3AF] mt-4">Subscribe to access your agent dashboard and all features</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      {/* Day-12 plan-picker "back wall" (Entry-mechanism cutover, Phase 2).
          Self-gating: renders null unless the agent is on an ACTIVE trial
          whose end is within the picker window, so it only surfaces for
          trial agents in their final stretch — never for paid or Free. */}
      <PlanPickerGate />
    </>
  );
}

const NAV_ITEMS = [
  { key: 'home', path: '/dashboard', label: 'Home', icon: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )},
  { key: 'clients', path: '/dashboard/clients', label: 'Clients', icon: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )},
  // Pre-clients (Phase 1 lead-mode). Manual create + PDF upload (Mail-In /
  // Call-In / Digital). Lead docs live at agents/{agentId}/leads/{leadId};
  // generated codes are prefixed `L`. Lead-mode mobile screen lives at
  // mobile/app/lead-home.tsx and detects lead vs client by accessType
  // returned from /api/mobile/lookup-client-code.
  { key: 'leads', path: '/dashboard/leads', label: 'Leads', icon: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
    </svg>
  )},
  // Agent activity stats (May 20, 2026). Closr-style KPI dashboard:
  // dials, contacts, booked, sales, APV (split by source: bought
  // leads / referrals / rewrites / manual), saved APV from retention
  // wins, funnel viz, recent wins. Computed on-demand from existing
  // leads / appointments / clients / policies / conservationAlerts.
  { key: 'activity', path: '/dashboard/activity', label: 'Activity', icon: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17l6-6 4 4 7-7m-3 0h3v3" />
    </svg>
  )},
  // Cross-lane agent action items surface (May 9, 2026 — Item 7).
  // Replaces the welcome-only queue. Tabs: Welcome / Retention /
  // Anniversary / Referral. Per-lane card components live in
  // `web/components/`. Legacy `/dashboard/welcomes` redirects here
  // with `?lane=welcome`.
  { key: 'action-items', path: '/dashboard/action-items', label: 'Action Items', icon: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ), badge: 'action-items' as const },
  { key: 'referrals', path: '/dashboard/referrals', label: 'Referrals', icon: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ), badge: 'referrals' as const },
  { key: 'conservation', path: '/dashboard/conservation', label: 'Retention', icon: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ), badge: 'conservation' as const },
  { key: 'policy-reviews', path: '/dashboard/policy-reviews', label: 'Rewrites', icon: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )},
  { key: 'resources', path: '/dashboard/resources', label: 'Resources', icon: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )},
  // Refer & Earn — agent-side affiliate program surface (May 31, 2026).
  // Sourced from the May 30 growth + distribution lock; FirstPromoter
  // is the underlying tracking provider (PR #58). Self-serve enrollment
  // via /api/affiliate/create. Hidden gracefully if FIRSTPROMOTER_API_KEY
  // / FIRSTPROMOTER_ACCOUNT_ID env vars aren't set yet — the page itself
  // surfaces a "Coming soon" message in that case so we can ship the
  // surface ahead of the FP key rollout.
  { key: 'refer-and-earn', path: '/dashboard/refer-and-earn', label: 'Refer & Earn', icon: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  )},
  { key: 'feedback', path: '/dashboard/feedback', label: 'Feedback', icon: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )},
];

// IA v2 — Calendar is promoted to its own top-level nav item (route at
// /dashboard/calendar). Kept OUT of NAV_ITEMS so the flat (flag-off)
// sidebar and the mobile bottom bar stay unchanged; it's spliced into the
// Pipeline group below, and only for Pro+ agents (same gate as Leads).
const CALENDAR_NAV_ITEM = { key: 'calendar', path: '/dashboard/calendar', label: 'Calendar', icon: (
  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)};

// Coaching (the individual Performance page) — like Calendar, kept OUT of
// NAV_ITEMS so the flat / mobile nav stay unchanged; spliced into the
// Performance group below. Visible to everyone except locked (Free) tiers
// — metered on Growth, unlimited on Pro+; the Free upsell renders under
// "Unlock with Pro" like Leads / Activity.
const COACHING_NAV_ITEM = { key: 'coaching', path: '/dashboard/coaching', label: 'Coaching', icon: (
  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
)};

// Workflow clusters for the IA-v2 sidebar — divider-separated with quiet
// section labels so a ~10-item rail reads as a few scannable zones. Keys
// resolve against NAV_ITEMS (+ Calendar / Coaching) at render; per-item
// gating (leads / activity / coaching accessibility) still applies.
// Resources + Feedback intentionally live in the avatar menu, not here.
const NAV_GROUPS: Array<{ label?: string; keys: string[] }> = [
  { label: 'Workspace', keys: ['home', 'leads', 'calendar', 'action-items'] },
  { label: 'Book', keys: ['clients', 'conservation', 'policy-reviews', 'referrals'] },
  { label: 'Performance', keys: ['activity', 'coaching'] },
  { keys: ['refer-and-earn'] },
];
const NAV_ITEM_BY_KEY = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.key, item] as [string, (typeof NAV_ITEMS)[number]]),
);

const ADMIN_NAV_ITEMS = [
  { key: 'admin-growth', path: '/dashboard/admin/growth', label: 'Growth', icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  )},
  { key: 'admin-analytics', path: '/dashboard/admin/feedback', label: 'Analytics', icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )},
  { key: 'admin-applications', path: '/dashboard/admin/applications', label: 'Applications', icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )},
  { key: 'admin-stats', path: '/dashboard/admin/stats', label: 'Stats', icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )},
  { key: 'admin-agent-emails', path: '/dashboard/admin/agent-emails', label: 'Agent Emails', icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )},
  { key: 'admin-manage-agents', path: '/dashboard/admin/manage-agents', label: 'Manage Agents', icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )},
];

// Conservation alert statuses that count as an open at-risk policy for the
// dashboard ticker — active retention campaigns plus the two pre-campaign
// states a fresh flag sits in before its first touch fires. Mirrors
// ACTIVE_RETENTION_STATUSES in lib/conservation-types.ts; inlined because that
// module imports firebase-admin and can't be pulled into this client bundle.
const TICKER_ACTIVE_ALERT_STATUSES = new Set<string>([
  'new',
  'outreach_scheduled',
  'outreach_sent',
  'drip_1',
  'drip_2',
  'drip_3',
]);

function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    user,
    agentProfile,
    setAgentProfile,
    isAdmin,
    handleLogout,
    refreshProfile,
  } = useDashboard();

  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showCancelWarning, setShowCancelWarning] = useState(false);

  const [showSubscriptionCelebration, setShowSubscriptionCelebration] = useState(false);
  // Tier purchased in the just-completed checkout, captured from the
  // `?tier=` param on the success redirect BEFORE we strip the query.
  // Preferred over agentProfile.membershipTier for the celebration copy
  // so a Pro buyer never briefly sees the growth variant while the Stripe
  // webhook → Firestore tier write is still propagating.
  const [celebrationTier, setCelebrationTier] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [adminOpen, setAdminOpen] = useState(() => pathname.startsWith('/dashboard/admin'));

  const [tickerStats, setTickerStats] = useState<AgentAggregates | null>(null);
  const [tickerClientCount, setTickerClientCount] = useState(0);
  const [tickerAtRiskCount, setTickerAtRiskCount] = useState(0);
  const [tickerAtRiskApv, setTickerAtRiskApv] = useState(0);
  const [tickerApptsToday, setTickerApptsToday] = useState(0);
  const [tickerUncalledLeads, setTickerUncalledLeads] = useState(0);


  useEffect(() => {
    if (!user) return;
    const statsRef = doc(db, 'agents', user.uid, 'stats', 'aggregates');
    const unsubStats = onSnapshot(statsRef, (snap) => {
      if (snap.exists()) setTickerStats(snap.data() as AgentAggregates);
    }, () => {});

    const clientsQ = query(collection(db, 'agents', user.uid, 'clients'));
    const unsubClients = onSnapshot(clientsQ, (snap) => {
      setTickerClientCount(snap.size);
    }, () => {});

    // Open at-risk policies — counted client-side from the alert status so the
    // ticker's "N at risk" matches what the Retention page treats as live. APV
    // sums computeAPV(premiumAmount) exactly the way Saved APV does in
    // stats-aggregation, so a policy's at-risk dollars equal the dollars it
    // contributes to Saved APV once it's retained (same field, same math).
    const alertsQ = query(collection(db, 'agents', user.uid, 'conservationAlerts'));
    const unsubAlerts = onSnapshot(alertsQ, (snap) => {
      let count = 0;
      let apv = 0;
      snap.forEach((d) => {
        const data = d.data();
        if (!TICKER_ACTIVE_ALERT_STATUSES.has((data.status as string) ?? '')) return;
        count += 1;
        apv += computeAPV(data.premiumAmount as number | null);
      });
      setTickerAtRiskCount(count);
      setTickerAtRiskApv(apv);
    }, () => {});

    // Today's scheduled appointments. The [start, end) window is captured per
    // snapshot in the agent's local day — fine for an at-a-glance count.
    const apptsQ = query(collection(db, 'agents', user.uid, 'appointments'));
    const unsubAppts = onSnapshot(apptsQ, (snap) => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const end = start + 24 * 60 * 60 * 1000;
      let count = 0;
      snap.forEach((d) => {
        const data = d.data();
        if (data.status !== 'scheduled') return;
        const ts = data.scheduledAt;
        const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null;
        if (ms !== null && ms >= start && ms < end) count += 1;
      });
      setTickerApptsToday(count);
    }, () => {});

    // Fresh, never-dialed leads — a speed-to-lead nudge. Bounded to leads
    // created in the last 7 days (a createdAt range query, so we don't read the
    // whole leads collection), then counted client-side by empty dialLog.
    // Naturally empty for agents without leads (Starter/Growth), so it hides.
    const sevenDaysAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const leadsQ = query(
      collection(db, 'agents', user.uid, 'leads'),
      where('createdAt', '>=', sevenDaysAgo),
    );
    const unsubLeads = onSnapshot(leadsQ, (snap) => {
      let count = 0;
      snap.forEach((d) => {
        const dialLog = d.data().dialLog;
        if (!Array.isArray(dialLog) || dialLog.length === 0) count += 1;
      });
      setTickerUncalledLeads(count);
    }, () => {});

    return () => { unsubStats(); unsubClients(); unsubAlerts(); unsubAppts(); unsubLeads(); };
  }, [user]);

  useEffect(() => {
    if (!user) setShowSubscriptionCelebration(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (searchParams.get('subscription') !== 'success') return;
    // Capture the purchased tier from the URL before router.replace strips
    // it. Both Stripe entry points (create-checkout-session + upgrade-tier)
    // append `&tier=<purchased>` to the success redirect so the celebration
    // copy is correct on first paint, even before the tier write lands.
    const purchasedTier = searchParams.get('tier');
    if (purchasedTier) setCelebrationTier(purchasedTier);
    setShowSubscriptionCelebration(true);
    router.replace('/dashboard');
  }, [searchParams, router, user]);

  useEffect(() => {
    if (!user) return;
    if (agentProfile.pendingSubscriptionCelebration !== true) return;
    setShowSubscriptionCelebration(true);
  }, [agentProfile.pendingSubscriptionCelebration, user]);

  useEffect(() => {
    if (pathname.startsWith('/dashboard/admin')) {
      setAdminOpen(true);
    }
  }, [pathname]);

  const handleManageSubscription = async () => {
    if (!user) return;
    setPortalLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create portal session');
      window.location.href = data.url;
    } catch (error) {
      console.error('Error opening customer portal:', error);
      alert('Failed to open subscription management. Please try again.');
      setPortalLoading(false);
    }
  };

  const activeKey = (() => {
    if (pathname === '/dashboard') return 'home';
    if (pathname.startsWith('/dashboard/clients')) return 'clients';
    if (pathname.startsWith('/dashboard/leads')) return 'leads';
    if (pathname.startsWith('/dashboard/calendar')) return 'calendar';
    if (pathname.startsWith('/dashboard/activity')) return 'activity';
    if (pathname.startsWith('/dashboard/coaching')) return 'coaching';
    if (pathname.startsWith('/dashboard/action-items')) return 'action-items';
    if (pathname.startsWith('/dashboard/referrals')) return 'referrals';
    if (pathname.startsWith('/dashboard/conservation')) return 'conservation';
    if (pathname.startsWith('/dashboard/policy-reviews')) return 'policy-reviews';
    if (pathname.startsWith('/dashboard/resources')) return 'resources';
    if (pathname.startsWith('/dashboard/refer-and-earn')) return 'refer-and-earn';
    if (pathname.startsWith('/dashboard/feedback')) return 'feedback';
    if (pathname.startsWith('/dashboard/settings')) return 'settings';
    if (pathname.startsWith('/dashboard/admin')) return 'admin';
    return 'home';
  })();

  const isAdminRoute = pathname.startsWith('/dashboard/admin');
  const activeAdminKey = ADMIN_NAV_ITEMS.find(item => pathname.startsWith(item.path))?.key ?? null;
  // Tier-aware visibility (locked May 26, 2026). Three outcomes per
  // surface — see web/lib/tier-gating.ts:
  //   accessible  → render in the main nav, fully clickable
  //   env_off     → render under "Coming soon" group, non-interactive
  //   tier_locked → render under "Unlock with Pro" group, clickable
  //                 (clicking lands the agent on the route's
  //                  UpgradeToProCard upsell)
  // Compute once per render so sidebar / mobile-nav / placeholder
  // logic can't drift. Admin override still applies via the
  // helpers themselves.
  const leadsReason = leadsAccessReason(agentProfile.membershipTier, user?.email, agentProfile.trialEndsAt);
  const activityReason = activityAccessReason(agentProfile.membershipTier, user?.email, agentProfile.trialEndsAt);
  // Coaching (individual Performance) — 'locked' for Free, else accessible
  // (metered on Growth, unlimited on Pro+). See performanceAccess().
  const coachingAccessLevel = performanceAccess(agentProfile.membershipTier, user?.email, agentProfile.trialEndsAt).level;
  // IA v2 (dark-launch): admins always; everyone else when
  // NEXT_PUBLIC_IA_V2=on. The single switch — gates the sidebar regroup,
  // the Calendar promotion, and the Leads Call-mode fold. Mirrors the flag
  // the Leads page reads so the two surfaces stay in lockstep.
  const iaEnabled = isAdmin || process.env.NEXT_PUBLIC_IA_V2 === 'on';
  // 6 items on mobile bottom bar. Leads replaces the previous Settings
  // slot — settings is already reachable via the gear in the top-right
  // header, so duplicating it down here wastes a tap target. Mobile
  // omits both env-off AND tier-locked items entirely (no placeholder)
  // because mobile real estate is tight and the desktop sidebar carries
  // the upsell surface.
  const mobileNavItems = NAV_ITEMS.filter((item) => {
    if (item.key === 'leads' && leadsReason !== 'accessible') return false;
    return ['home', 'clients', 'leads', 'action-items', 'referrals', 'conservation'].includes(item.key);
  });

  // Single sidebar nav button — shared by the flat (flag-off) list and the
  // IA-v2 workflow groups so both render pixel-identical.
  const renderNavItem = (item: (typeof NAV_ITEMS)[number] | typeof CALENDAR_NAV_ITEM | typeof COACHING_NAV_ITEM) => {
    // Refer & Earn gets a permanent gold accent — it's the one nav item
    // where the agent can EARN money, so it stands out from daily tools.
    const isReferEarn = item.key === 'refer-and-earn';
    return (
      <button
        key={item.key}
        data-onboarding-target={item.key === 'clients' ? 'nav-clients' : undefined}
        onClick={() => router.push(item.path)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 group relative ${
          activeKey === item.key
            ? 'bg-[#daf3f0] text-[#005851]'
            : isReferEarn
              ? 'text-[#f5c542] hover:bg-[#f5c542]/10 hover:text-[#ffd860]'
              : 'text-white/80 hover:bg-white/10 hover:text-white'
        }`}
      >
        <div className="relative shrink-0">
          {item.icon}
        </div>
        <span className="whitespace-nowrap overflow-hidden text-sm font-semibold opacity-100 w-auto">
          {item.label}
        </span>
        {isReferEarn && activeKey !== item.key && (
          <span
            aria-hidden="true"
            className="ml-auto text-[10px] font-bold text-[#f5c542]/90 tracking-widest"
          >
            $
          </span>
        )}
      </button>
    );
  };
  const navItemAccessible = (key: string) =>
    key === 'leads' ? leadsReason === 'accessible'
    : key === 'activity' ? activityReason === 'accessible'
    : key === 'coaching' ? coachingAccessLevel !== 'locked'
    : true;
  // IA-v2 workflow clusters resolved to their accessible items; empty
  // groups dropped so a divider never leads a section that rendered nothing.
  const groupedNav = NAV_GROUPS
    .map((group) => ({
      label: group.label,
      items: group.keys
        // Calendar follows the SAME Pro+ tier gate as Leads (it surfaces
        // the pre-sale pipeline). Visibility otherwise rides iaEnabled,
        // which already wraps this whole grouped render.
        .filter((key) => key !== 'calendar' || leadsReason === 'accessible')
        .filter(navItemAccessible)
        .map((key) =>
          key === 'calendar' ? CALENDAR_NAV_ITEM
          : key === 'coaching' ? COACHING_NAV_ITEM
          : NAV_ITEM_BY_KEY[key]),
    }))
    .filter((group) => group.items.length > 0);
  const dismissSubscriptionCelebration = () => {
    setShowSubscriptionCelebration(false);
    if (user) {
      setAgentProfile((prev) => ({ ...prev, pendingSubscriptionCelebration: false }));
      void updateDoc(doc(db, 'agents', user.uid), {
        pendingSubscriptionCelebration: false,
        subscriptionCelebrationSeenAt: serverTimestamp(),
      }).then(() => refreshProfile()).catch((error) => {
        console.error('Failed to clear subscription celebration flag:', error);
      });
    }
  };

  // Tier-aware post-purchase celebration. Pro/Agency land on the pre-sale
  // pipeline value (warmed-up leads, call queue, one-tap confirmations);
  // everyone else gets the post-sale growth-engine framing. Prefer the
  // tier captured from the checkout success URL over the live profile so
  // the copy is right on first paint, before the tier write propagates.
  const celebrationEffectiveTier = celebrationTier ?? agentProfile.membershipTier;
  const celebrationCopy = isProOrAbove(celebrationEffectiveTier)
    ? {
        eyebrow: 'Welcome to Pro',
        headline: "You're officially Pro.",
        body: "Congratulations — you've unlocked the full Pro experience. Warmed-up leads before you dial, a queue that tells you who's next, one-tap appointment confirmations, and every dial and sale tracked for you. This is how the busiest agents book more and close more.",
        chips: ['Warmed-up leads + call queue', 'Your whole week on one calendar', '1-tap appointment confirmations', 'Activity + APV tracking'],
        cta: "Let's Pro",
      }
    : {
        eyebrow: 'Subscription Confirmed',
        headline: "You're officially in.",
        body: 'Purchase successful. Your AgentForLife subscription is active and your automated growth engine is now locked in for your business.',
        chips: ['Client follow-up automation', 'Referral momentum tracking', 'Retention alerts + rewrites'],
        cta: "Let's grow",
      };

  return (
    <div className="min-h-screen bg-[#e4e4e4] flex">
      {/* May 12 relaunch — read-only maintenance banner. Renders nothing
          unless MAINTENANCE_MODE_READONLY=true on the server. See
          web/lib/maintenance-mode.ts. */}
      <MaintenanceBanner />
      {/* Phase 1 Track B — registers the agent-side service worker, captures
          the install prompt, syncs Web Push subscription state to the
          agent doc, and drives the pwaInstalled / webPushGranted hard
          onboarding milestones. Renders nothing. */}
      <PWAInstaller />
      <div className="md:hidden fixed top-0 inset-x-0 h-14 bg-white border-b border-[#d0d0d0] z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="AgentForLife™" className="w-8 h-5 object-contain" />
          <span className="text-[#005851] text-sm font-bold">AgentForLife</span>
        </div>
        <button
          data-onboarding-target="nav-settings"
          onClick={() => router.push('/dashboard/settings')}
          className="w-8 h-8 rounded-[5px] bg-[#f1f1f1] text-[#005851] flex items-center justify-center"
          aria-label="Open settings"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className="hidden md:flex md:flex-col fixed left-0 top-0 h-full bg-[#005851] z-50 w-56"
      >
        <div className="h-14 flex items-center px-4 border-b border-white/10 shrink-0">
          <img src="/logo.png" alt="AgentForLife™" className="w-11 h-7 object-contain" />
          <span className="ml-3 text-white text-lg whitespace-nowrap overflow-hidden brand-title opacity-100 w-auto">
            AgentForLife™
          </span>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto mt-4 px-2 pb-4 space-y-1">
          {/* Tier-gated surfaces render in one of three states (see
              `leadsAccessReason` / `activityAccessReason`):
                - accessible  → in the main nav, clickable
                - env_off     → "Coming soon" group below, non-interactive
                - tier_locked → "Unlock with Pro" group below, clickable
              Daily-workflow tools stay in the prime real estate at the
              top regardless of which mode the gated items are in. */}
          {iaEnabled
            ? groupedNav.flatMap((group, gi) => [
                ...(gi > 0
                  ? [<div key={`nav-div-${gi}`} className="my-2 mx-1 border-t border-white/10" />]
                  : []),
                ...(group.label
                  ? [<p key={`nav-lbl-${gi}`} className="px-3 pt-1 pb-1 text-[9px] font-bold uppercase tracking-wider text-white/30 select-none">{group.label}</p>]
                  : []),
                ...group.items.map(renderNavItem),
              ])
            : NAV_ITEMS.filter((item) => navItemAccessible(item.key)).map(renderNavItem)}

          {/* Gated-off groupings — both pushed below the live items but
              above Admin / Settings. Items group by gating reason so
              the copy can be honest:
                "Coming soon"     — env-disabled (the feature isn't built
                                    for anyone yet on this deploy).
                                    Non-interactive, strikethrough.
                "Unlock with Pro" — env-enabled but the agent's tier
                                    doesn't qualify. Clickable — sends
                                    them to the route's UpgradeToProCard. */}
          {(() => {
            const comingSoon = NAV_ITEMS.filter((item) =>
              (item.key === 'leads' && leadsReason === 'env_off') ||
              (item.key === 'activity' && activityReason === 'env_off')
            );
            if (comingSoon.length === 0) return null;
            return (
              <>
                <div className="my-2 mx-1 border-t border-white/10" />
                <p className="px-3 pt-1 pb-0.5 text-[9px] font-bold uppercase tracking-wider text-white/30">Coming soon</p>
                {comingSoon.map((item) => (
                  <div
                    key={item.key}
                    aria-disabled
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] text-white/40 relative cursor-default select-none"
                  >
                    <div className="relative shrink-0 opacity-60">
                      {item.icon}
                    </div>
                    <span className="whitespace-nowrap overflow-hidden text-sm font-semibold line-through">
                      {item.label}
                    </span>
                  </div>
                ))}
              </>
            );
          })()}

          {(() => {
            // Leads, Calendar, and Activity are all Pro surfaces. When the
            // agent's tier locks them, surface them here as upsells — Calendar
            // rides the same Pro gate as Leads. Order mirrors the Pipeline
            // group: Leads → Calendar → Activity.
            const tierLocked: Array<(typeof NAV_ITEMS)[number] | typeof CALENDAR_NAV_ITEM | typeof COACHING_NAV_ITEM> = [];
            if (leadsReason === 'tier_locked') {
              tierLocked.push(NAV_ITEM_BY_KEY['leads'], CALENDAR_NAV_ITEM);
            }
            if (activityReason === 'tier_locked') {
              tierLocked.push(NAV_ITEM_BY_KEY['activity']);
            }
            if (coachingAccessLevel === 'locked') {
              tierLocked.push(COACHING_NAV_ITEM);
            }
            if (tierLocked.length === 0) return null;
            return (
              <>
                <div className="my-2 mx-1 border-t border-white/10" />
                <p className="px-3 pt-1 pb-0.5 text-[9px] font-bold uppercase tracking-wider text-white/30">Upgrade to unlock</p>
                {tierLocked.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => router.push(item.path)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200 group/locked"
                  >
                    <div className="relative shrink-0 opacity-80">
                      {item.icon}
                    </div>
                    <span className="whitespace-nowrap overflow-hidden text-sm font-semibold flex-1 text-left">
                      {item.label}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#44bbaa]/20 text-[#daf3f0] group-hover/locked:bg-[#44bbaa]/30">
                      {item.key === 'coaching' ? 'Growth' : 'Pro'}
                    </span>
                  </button>
                ))}
              </>
            );
          })()}

          {isAdmin && (
            <>
              <div className="my-2 mx-1 border-t border-white/15" />

              <div className="relative group/admin">
                <button
                  onClick={() => setAdminOpen(!adminOpen)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 relative ${
                    isAdminRoute
                      ? 'bg-white/15 text-white'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className="relative shrink-0">
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <span className="whitespace-nowrap overflow-hidden text-sm font-semibold flex-1 text-left opacity-100 w-auto">
                    Admin
                  </span>
                  <AdminGrowthBadge user={user} />
                  <svg className={`w-4 h-4 shrink-0 transition-transform duration-200 ${adminOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-in-out"
                  style={{ gridTemplateRows: adminOpen ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <div className="pl-3 mt-1 space-y-0.5">
                      {ADMIN_NAV_ITEMS.map((item) => (
                        <button
                          key={item.key}
                          onClick={() => router.push(item.path)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[5px] transition-all duration-200 ${
                            activeAdminKey === item.key
                              ? 'bg-[#daf3f0] text-[#005851]'
                              : 'text-white/70 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {item.icon}
                          <span className="text-xs font-semibold whitespace-nowrap">{item.label}</span>
                          {item.key === 'admin-growth' && <AdminGrowthBadge user={user} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          <button
            data-onboarding-target="nav-settings"
            onClick={() => router.push('/dashboard/settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 ${
              activeKey === 'settings'
                ? 'bg-[#daf3f0] text-[#005851]'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="whitespace-nowrap overflow-hidden text-sm font-semibold opacity-100 w-auto">
              Settings
            </span>
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:ml-56 flex flex-col min-h-screen overflow-hidden pt-14 md:pt-0 pb-20 md:pb-0">
        {/* Mandatory-MFA heads-up (pre-go-live); self-renders null otherwise. */}
        <MfaHeadsUpBanner />
        {/* Header */}
        <header className="hidden md:flex h-14 bg-white border-b border-[#d0d0d0] sticky top-0 z-40 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-[#005851] font-extrabold text-lg tracking-wide">AGENTFORLIFE</span>
            <span className="text-[#d0d0d0]">|</span>
            <span className="text-[#707070] font-medium">Agent Portal</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-[5px] hover:bg-[#f1f1f1] transition-colors"
              >
                {agentProfile.photoBase64 ? (
                  <img src={`data:image/jpeg;base64,${agentProfile.photoBase64}`} alt="Profile" className="w-8 h-8 rounded-full object-cover border-2 border-[#45bcaa]" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#44bbaa] flex items-center justify-center text-white font-bold text-sm">
                    {agentProfile.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'A'}
                  </div>
                )}
                <div className="hidden md:block text-left">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-[#000000]">{agentProfile.name || 'Agent'}</p>
                    {agentProfile.isFoundingMember && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-gradient-to-b from-[#f5d976] via-[#e2b93b] to-[#c99a2e] text-[#5c3a0a] text-[10px] font-extrabold uppercase tracking-wider leading-none border border-[#c99a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_1px_2px_rgba(0,0,0,0.15)]">
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                        </svg>
                        Founder
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#707070]">{agentProfile.agencyName || 'Agency'}</p>
                </div>
                <svg className={`w-4 h-4 text-[#707070] transition-transform ${showProfileDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showProfileDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProfileDropdown(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-[5px] shadow-xl border border-[#d0d0d0] py-2 z-50">
                    {agentProfile.isFoundingMember && (
                      <>
                        <div className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded bg-gradient-to-b from-[#faf0d0] via-[#f0d87c] to-[#d4a832] border border-[#c99a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_2px_4px_rgba(0,0,0,0.12)]">
                            <svg className="w-4 h-4 text-[#7a5318] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                            </svg>
                            <span className="text-xs font-extrabold text-[#5c3a0a] uppercase tracking-wider drop-shadow-[0_1px_0_rgba(255,255,255,0.3)]">Founding Member</span>
                          </div>
                        </div>
                        <div className="border-t border-[#d0d0d0] my-1" />
                      </>
                    )}
                    <button
                      onClick={() => { router.push('/dashboard/settings'); setShowProfileDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[#000000] hover:bg-[#f1f1f1] transition-colors"
                    >
                      <svg className="w-5 h-5 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="text-sm font-medium">My Account</span>
                    </button>
                    <button
                      onClick={() => { router.push('/dashboard/pair-phone'); setShowProfileDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[#000000] hover:bg-[#f1f1f1] transition-colors"
                    >
                      <svg className="w-5 h-5 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm font-medium flex-1">Set up my phone</span>
                      {!agentProfile.phonePaired && (
                        <span
                          aria-label="Setup needed"
                          className="w-2 h-2 rounded-full bg-[#f59e0b] flex-shrink-0"
                        />
                      )}
                    </button>
                    {agentProfile.stripeCustomerId && (
                      <button
                        onClick={() => { setShowCancelWarning(true); setShowProfileDropdown(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[#000000] hover:bg-[#f1f1f1] transition-colors"
                      >
                        <svg className="w-5 h-5 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        <span className="text-sm font-medium">Subscription</span>
                      </button>
                    )}
                    <div className="border-t border-[#d0d0d0] my-1" />
                    <button
                      onClick={() => { router.push('/dashboard/resources'); setShowProfileDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[#000000] hover:bg-[#f1f1f1] transition-colors"
                    >
                      <svg className="w-5 h-5 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <span className="text-sm font-medium">Resources</span>
                    </button>
                    <button
                      onClick={() => { router.push('/dashboard/feedback'); setShowProfileDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[#000000] hover:bg-[#f1f1f1] transition-colors"
                    >
                      <svg className="w-5 h-5 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span className="text-sm font-medium">Feedback</span>
                    </button>
                    <div className="border-t border-[#d0d0d0] my-2" />
                    <button
                      onClick={() => { handleLogout(); setShowProfileDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[#000000] hover:bg-[#f1f1f1] transition-colors"
                    >
                      <svg className="w-5 h-5 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      <span className="text-sm font-medium">Logout</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Ticker */}
        <DashboardTicker
          stats={tickerStats}
          clientCount={tickerClientCount}
          atRiskCount={tickerAtRiskCount}
          atRiskApv={tickerAtRiskApv}
          appointmentsToday={tickerApptsToday}
          uncalledLeads={tickerUncalledLeads}
          agentFirstName={(agentProfile.name || '').trim().split(/\s+/)[0] || undefined}
        />

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-[#d0d0d0]">
        <div className={mobileNavItems.length === 6 ? 'grid grid-cols-6' : 'grid grid-cols-5'}>
          {mobileNavItems.map((item) => {
            const active = activeKey === item.key;
            return (
              <button
                key={item.key}
                data-onboarding-target={item.key === 'clients' ? 'nav-clients' : undefined}
                onClick={() => router.push(item.path)}
                className={`py-2 px-1 flex flex-col items-center justify-center gap-1 ${
                  active ? 'text-[#005851]' : 'text-[#707070]'
                }`}
              >
                <div className="w-5 h-5">{item.icon}</div>
                <span className="text-[10px] font-semibold leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {showSubscriptionCelebration && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={dismissSubscriptionCelebration}
          />
          <div className="relative w-full max-w-xl rounded-2xl border-2 border-[#1A1A1A] border-r-[6px] border-b-[6px] bg-white shadow-2xl overflow-hidden">
            <div className="px-6 py-5 bg-gradient-to-r from-[#005851] to-[#0D4D4D]">
              <p className="text-xs font-bold tracking-[0.12em] text-[#3DD6C3] uppercase">{celebrationCopy.eyebrow}</p>
              <h3 className="mt-1 text-2xl font-extrabold text-white">{celebrationCopy.headline}</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-[#1f2937] leading-relaxed">
                {celebrationCopy.body}
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {celebrationCopy.chips.map((chip) => (
                  <div key={chip} className="rounded-lg border border-[#d0d0d0] bg-[#f8f8f8] px-3 py-2 text-xs font-semibold text-[#0D4D4D]">{chip}</div>
                ))}
              </div>
              <button
                onClick={dismissSubscriptionCelebration}
                className="mt-5 w-full rounded-lg bg-[#3DD6C3] hover:bg-[#32c4b2] text-[#0D4D4D] font-bold text-sm px-4 py-2.5 transition-colors"
              >
                {celebrationCopy.cta}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCancelWarning(false)} />
          <div className="relative bg-white rounded-[5px] shadow-2xl max-w-md w-full p-6">
            <div className="w-12 h-12 bg-[#FEF3C7] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#D97706]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#005851] text-center mb-2">Before you go...</h3>
            <p className="text-sm text-[#4B5563] text-center mb-4">
              If you cancel your subscription, you will lose access to:
            </p>
            <ul className="space-y-2 mb-6">
              {[
                'Your AI referral assistant',
                'All client records and policy data',
                'Referral conversations and AI history',
                'Retention alerts and outreach tracking',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-[#374151]">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-[#6B7280] text-center mb-5">
              This cannot be undone. Your data will not be preserved.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelWarning(false)}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#f0faf8] transition-colors"
              >
                Never Mind
              </button>
              <button
                onClick={() => { setShowCancelWarning(false); handleManageSubscription(); }}
                disabled={portalLoading}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-red-600 rounded-[5px] hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {portalLoading ? 'Opening...' : 'Continue to Billing'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DashboardAssistant />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <SubscriptionGate>
        <MfaGate>
          <DashboardShell>{children}</DashboardShell>
        </MfaGate>
      </SubscriptionGate>
    </DashboardProvider>
  );
}
