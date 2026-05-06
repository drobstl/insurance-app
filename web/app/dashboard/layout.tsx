'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { doc, collection, onSnapshot, query, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { DashboardProvider, useDashboard } from './DashboardContext';
import OnboardingOverlay from '../../components/OnboardingOverlay';
import OnboardingChecklistRail from '../../components/OnboardingChecklistRail';
import PWAInstaller from '../../components/PWAInstaller';
import MaintenanceBanner from '../../components/MaintenanceBanner';
import LoomVideoModal from '../../components/LoomVideoModal';
import DashboardAssistant from '../../components/DashboardAssistant';
import DashboardTicker from '../../components/DashboardTicker';
import type { AgentAggregates } from '../../lib/stats-aggregation';
import { ANALYTICS_EVENTS } from '../../lib/analytics-events';
import { captureEvent } from '../../lib/posthog';

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
    if (status === 'active') {
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
  }, [user, loading, profileLoading, agentProfile.subscriptionStatus, refreshProfile, activationRetryNonce]);

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
    if (agentProfile.subscriptionStatus === 'active') {
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
    agentProfile.subscriptionStatus,
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

  if (agentProfile.subscriptionStatus !== 'active') {
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

  return <>{children}</>;
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
  // Phase 1 Track B — welcome action item queue. Mobile installed
  // PWA: tap-to-send via sms: URL. Desktop: read-only with
  // "Open AFL on your phone to send" affordance per
  // CONTEXT.md > Channel Rules > Phase 1 implementation constraints.
  { key: 'welcomes', path: '/dashboard/welcomes', label: 'Welcomes', icon: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  ), badge: 'welcomes' as const },
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
  { key: 'feedback', path: '/dashboard/feedback', label: 'Feedback', icon: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )},
];

const ADMIN_NAV_ITEMS = [
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
    completeOnboarding,
  } = useDashboard();

  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showCancelWarning, setShowCancelWarning] = useState(false);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingUiSuppressed, setOnboardingUiSuppressed] = useState(false);
  const [showSubscriptionCelebration, setShowSubscriptionCelebration] = useState(false);
  const [showWorkflowVideo, setShowWorkflowVideo] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [adminOpen, setAdminOpen] = useState(() => pathname.startsWith('/dashboard/admin'));

  const [tickerStats, setTickerStats] = useState<AgentAggregates | null>(null);
  const [tickerClientCount, setTickerClientCount] = useState(0);


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

    return () => { unsubStats(); unsubClients(); };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setShowOnboarding(false);
      setOnboardingUiSuppressed(false);
      setShowSubscriptionCelebration(false);
      return;
    }
    // Phase 1 Track B + May 12 relaunch — extend onboarding
    // enforcement to existing agents who completed the OLD
    // onboarding before pwaInstalled / webPushGranted existed as
    // milestones (Daniel's locked May 6 evening decision: every
    // existing agent must redo onboarding at relaunch and install
    // the PWA + grant push permission). The OLD onboardingComplete
    // flag is true for these agents but the new HARD gates aren't
    // satisfied; force-show the overlay until they are.
    const required = agentProfile.onboarding?.requiredMilestones;
    const missingNewHardGate = !!required
      && (required.pwaInstalled !== true || required.webPushGranted !== true);
    const shouldShow = agentProfile.onboardingComplete !== true || missingNewHardGate;
    if (!shouldShow) {
      setShowOnboarding(false);
      setOnboardingUiSuppressed(false);
      return;
    }
    if (onboardingUiSuppressed) return;
    setShowOnboarding(shouldShow);
  }, [
    agentProfile.onboardingComplete,
    agentProfile.onboarding?.requiredMilestones,
    onboardingUiSuppressed,
    user,
  ]);

  useEffect(() => {
    if (!user) return;
    if (searchParams.get('subscription') !== 'success') return;
    setShowSubscriptionCelebration(true);
    setShowOnboarding(false);
    router.replace('/dashboard');
  }, [searchParams, router, user]);

  useEffect(() => {
    if (!user) return;
    if (agentProfile.pendingSubscriptionCelebration !== true) return;
    setShowSubscriptionCelebration(true);
    setShowOnboarding(false);
  }, [agentProfile.pendingSubscriptionCelebration, user]);

  useEffect(() => {
    if (!showOnboarding) return;
    const resumedStep = agentProfile.onboarding?.currentStep ?? 0;
    captureEvent(ANALYTICS_EVENTS.ONBOARDING_RESUMED, {
      step_name: `step_${resumedStep + 1}`,
    });
  }, [showOnboarding, agentProfile.onboarding?.currentStep]);

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
    if (pathname.startsWith('/dashboard/referrals')) return 'referrals';
    if (pathname.startsWith('/dashboard/conservation')) return 'conservation';
    if (pathname.startsWith('/dashboard/policy-reviews')) return 'policy-reviews';
    if (pathname.startsWith('/dashboard/resources')) return 'resources';
    if (pathname.startsWith('/dashboard/feedback')) return 'feedback';
    if (pathname.startsWith('/dashboard/settings')) return 'settings';
    if (pathname.startsWith('/dashboard/admin')) return 'admin';
    return 'home';
  })();

  const isAdminRoute = pathname.startsWith('/dashboard/admin');
  const activeAdminKey = ADMIN_NAV_ITEMS.find(item => pathname.startsWith(item.path))?.key ?? null;
  const mobileNavItems = NAV_ITEMS.filter((item) =>
    ['home', 'clients', 'referrals', 'conservation'].includes(item.key),
  );
  const onboardingMilestones = agentProfile.onboarding?.requiredMilestones ?? {
    profileCompleted: false,
    firstClientCreated: false,
    firstWelcomeSent: false,
    firstPatchPromptSent: false,
    pwaInstalled: false,
    webPushGranted: false,
  };
  // Phase 1 Track B — PWA install + Web Push are HARD onboarding gates
  // (docs/AFL_Phase_1_Planning_Notes_2026-05-04.md §2 + CONTEXT.md >
  // Channel Rules > Phase 1 implementation constraints). Skip Tutorial
  // can NOT bypass them — the welcome flow does not work without both.
  // The two soft milestones (`firstClientCreated`, `firstWelcomeSent`,
  // `firstPatchPromptSent`, `profileCompleted`) remain skippable; an
  // agent who genuinely doesn't want the guided coachmark walkthrough
  // can dismiss it but they must still install the PWA + grant push to
  // be considered fully onboarded.
  const handleSkipTutorial = async () => {
    if (!onboardingMilestones.pwaInstalled || !onboardingMilestones.webPushGranted) {
      setShowOnboarding(true);
      setOnboardingUiSuppressed(false);
      // Surface a banner via the existing onboarding overlay rather
      // than a separate alert — overlay step hard-blocks at the
      // pwaInstall / webPushPermission steps with a clear message.
      return;
    }
    setShowOnboarding(false);
    setOnboardingUiSuppressed(true);
    try {
      await completeOnboarding();
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
      setOnboardingUiSuppressed(false);
      setShowOnboarding(true);
    }
  };
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
    if (agentProfile.onboardingComplete !== true && !onboardingUiSuppressed) {
      setShowOnboarding(true);
    }
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
        className="hidden md:block fixed left-0 top-0 h-full bg-[#005851] z-50 w-56"
      >
        <div className="h-14 flex items-center px-4 border-b border-white/10">
          <img src="/logo.png" alt="AgentForLife™" className="w-11 h-7 object-contain" />
          <span className="ml-3 text-white text-lg whitespace-nowrap overflow-hidden brand-title opacity-100 w-auto">
            AgentForLife™
          </span>
        </div>

        <nav className="mt-4 px-2 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              data-onboarding-target={item.key === 'clients' ? 'nav-clients' : undefined}
              onClick={() => router.push(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 group relative ${
                activeKey === item.key
                  ? 'bg-[#daf3f0] text-[#005851]'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="relative shrink-0">
                {item.icon}
              </div>
              <span className="whitespace-nowrap overflow-hidden text-sm font-semibold opacity-100 w-auto">
                {item.label}
              </span>
            </button>
          ))}

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
        <DashboardTicker stats={tickerStats} clientCount={tickerClientCount} />

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-[#d0d0d0]">
        <div className="grid grid-cols-5">
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
          <button
            data-onboarding-target="nav-settings"
            onClick={() => router.push('/dashboard/settings')}
            className={`py-2 px-1 flex flex-col items-center justify-center gap-1 ${
              activeKey === 'settings' ? 'text-[#005851]' : 'text-[#707070]'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] font-semibold leading-none">Settings</span>
          </button>
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
              <p className="text-xs font-bold tracking-[0.12em] text-[#3DD6C3] uppercase">Subscription Confirmed</p>
              <h3 className="mt-1 text-2xl font-extrabold text-white">You&apos;re officially in.</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-[#1f2937] leading-relaxed">
                Purchase successful. Your AgentForLife subscription is active and your automated growth engine is now locked in for your business.
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-lg border border-[#d0d0d0] bg-[#f8f8f8] px-3 py-2 text-xs font-semibold text-[#0D4D4D]">Client follow-up automation</div>
                <div className="rounded-lg border border-[#d0d0d0] bg-[#f8f8f8] px-3 py-2 text-xs font-semibold text-[#0D4D4D]">Referral momentum tracking</div>
                <div className="rounded-lg border border-[#d0d0d0] bg-[#f8f8f8] px-3 py-2 text-xs font-semibold text-[#0D4D4D]">Retention alerts + rewrites</div>
              </div>
              <button
                onClick={dismissSubscriptionCelebration}
                className="mt-5 w-full rounded-lg bg-[#3DD6C3] hover:bg-[#32c4b2] text-[#0D4D4D] font-bold text-sm px-4 py-2.5 transition-colors"
              >
                Let&apos;s grow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding */}
      {showOnboarding && user && !showSubscriptionCelebration && (
        <OnboardingOverlay
          agentName={agentProfile.name || user.displayName || ''}
          onComplete={() => setShowOnboarding(false)}
          onPause={() => setShowOnboarding(false)}
          onSkip={() => { void handleSkipTutorial(); }}
        />
      )}
      {user && !showSubscriptionCelebration && !onboardingUiSuppressed && agentProfile.onboardingComplete !== true && !showOnboarding && (
        <OnboardingChecklistRail
          milestones={onboardingMilestones}
          onboardingVisible={showOnboarding}
          collapseOptionalByDefault={showOnboarding}
          onPause={() => setShowOnboarding(false)}
          onResume={() => setShowOnboarding(true)}
          onSkip={() => { void handleSkipTutorial(); }}
          profilePhotoAdded={Boolean(agentProfile.photoBase64)}
          agencyLogoAdded={Boolean(agentProfile.agencyLogoBase64)}
        />
      )}
      {!showOnboarding && user && !showSubscriptionCelebration && !onboardingUiSuppressed && agentProfile.onboardingComplete !== true && (
        <button
          onClick={() => setShowOnboarding(true)}
          className="fixed bottom-24 left-4 z-[70] md:hidden px-3 py-2 rounded-[5px] bg-white border border-[#d0d0d0] text-xs font-semibold text-[#0D4D4D] shadow-[0_8px_20px_rgba(0,0,0,0.15)] hover:bg-[#f8f8f8] transition-colors"
        >
          Resume onboarding
        </button>
      )}
      <LoomVideoModal isOpen={showWorkflowVideo} onClose={() => setShowWorkflowVideo(false)} videoUrl="https://www.loom.com/embed/88422effb7ca4cdc8ae88646490fed00" />

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
        <DashboardShell>{children}</DashboardShell>
      </SubscriptionGate>
    </DashboardProvider>
  );
}
