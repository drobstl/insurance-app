'use client';

import { useEffect, useState } from 'react';

import { auth } from '../firebase';
import { isAdminEmail } from '../lib/admin';

/**
 * Phase 1 read-only maintenance window banner.
 *
 * SOURCE OF TRUTH: Daniel's May 6, 2026 evening decision —
 * "we'll be right back" maintenance window through Tuesday May 12.
 * See web/lib/maintenance-mode.ts for the full rationale.
 *
 * Polls /api/system/maintenance-status once on mount; if readOnly,
 * renders a fixed-position banner across the top of the dashboard.
 * No link out per Daniel's choice — banner reads as a clear
 * "rebuilding, see you Tuesday" without sending the agent down a
 * documentation rabbit hole.
 *
 * Renders nothing while loading or when not in maintenance, so the
 * banner has zero footprint in normal operation.
 */
interface MaintenanceStatus {
  readOnly: boolean;
  message: string;
  relaunchLabel: string;
}

export default function MaintenanceBanner(): React.ReactElement | null {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [resetState, setResetState] = useState<'idle' | 'pending' | 'error'>('idle');
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/system/maintenance-status', {
          method: 'GET',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as MaintenanceStatus;
        if (!cancelled) setStatus(data);
      } catch {
        // Silent. Banner not rendering on error is the right
        // behavior — better than a misleading "we're back" state if
        // the API fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Admin email gate for the testing-mode reset button. Only renders
  // the button for admins AND only while maintenance mode is on
  // (the whole banner disappears at relaunch). Self-cleaning.
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setIsAdmin(isAdminEmail(u?.email ?? null));
    });
    return () => unsub();
  }, []);

  const handleResetOnboarding = async () => {
    if (resetState === 'pending') return;
    const user = auth.currentUser;
    const email = user?.email ?? '';
    if (!user || !email) {
      setResetState('error');
      setResetError('Not signed in.');
      return;
    }
    if (!confirm(
      'Reset your onboarding? Resets all six milestones and clears your push subscription so you can walk through the entire flow from the Welcome step. Profile data (name, agency, photo) is preserved.',
    )) {
      return;
    }
    setResetState('pending');
    setResetError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/reset-onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // 'milestones-only' = full milestone reset (all 6 back to false)
        // + clear push state, but keep profile fields intact. Lands the
        // agent on step 0 (Welcome) so they can review the entire
        // re-tested flow including the latest copy. For testing only
        // the new gates, change to scope: 'new-gates-only'.
        body: JSON.stringify({ email, scope: 'milestones-only' }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        setResetState('error');
        setResetError(`Reset failed (${res.status}): ${text || 'unknown'}`);
        return;
      }
      // Hard reload so PWAInstaller's auto-detect effects re-run
      // against the freshly-cleared state and the onboarding overlay
      // re-evaluates immediately.
      window.location.reload();
    } catch (err) {
      setResetState('error');
      setResetError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!status?.readOnly) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 inset-x-0 z-[100] bg-[#FBBF24] text-[#0D4D4D] border-b-[5px] border-[#0D4D4D] shadow-[0_4px_12px_rgba(0,0,0,0.25)]"
      style={{
        backgroundImage:
          'repeating-linear-gradient(135deg, rgba(13,77,77,0.06) 0px, rgba(13,77,77,0.06) 12px, transparent 12px, transparent 24px)',
      }}
    >
      <div className="flex items-center justify-center gap-3 px-4 py-3 sm:py-3.5">
        {/* Warning triangle (no emoji per project rules) */}
        <svg
          className="hidden sm:block w-6 h-6 shrink-0"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M12 2L1 21h22L12 2zm0 4.6L19.5 19h-15L12 6.6zm-1 5.4v4h2v-4h-2zm0 5v2h2v-2h-2z" />
        </svg>
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-x-3 gap-y-0.5 text-center sm:text-left">
          <span className="font-extrabold uppercase tracking-wide text-[15px] sm:text-base">
            {status.message}
          </span>
          <span className="text-[12px] sm:text-sm font-semibold opacity-90">
            Read-only mode — automated outreach paused.
          </span>
        </div>
        {/* Pulsing live indicator */}
        <span
          className="hidden sm:inline-flex items-center gap-1.5 ml-1 text-[11px] font-bold uppercase tracking-wider"
          aria-hidden="true"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#dc2626] opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#dc2626]" />
          </span>
          LIVE
        </span>
      </div>
      {/* Admin-only testing-mode controls. Visible only to admin
          emails AND only while maintenance is on (the entire banner
          disappears at relaunch). Self-cleaning. */}
      {isAdmin ? (
        <div className="flex items-center justify-center gap-2 px-4 pb-2 -mt-1 text-[11px]">
          <button
            type="button"
            onClick={handleResetOnboarding}
            disabled={resetState === 'pending'}
            className="rounded border border-[#0D4D4D] bg-white/40 hover:bg-white/70 px-2.5 py-1 font-bold text-[#0D4D4D] transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {resetState === 'pending' ? 'Resetting…' : 'Reset my onboarding (admin)'}
          </button>
          {resetError ? (
            <span className="font-semibold text-[#7f1d1d]" role="alert">{resetError}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
