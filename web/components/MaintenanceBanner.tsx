'use client';

import { useEffect, useState } from 'react';

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
    </div>
  );
}
