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
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[100] bg-[#0D4D4D] text-white px-4 py-2 text-center text-sm font-semibold shadow-md"
    >
      {status.message}
      <span className="ml-2 opacity-80 font-normal">
        Read-only access — automated outreach paused.
      </span>
    </div>
  );
}
