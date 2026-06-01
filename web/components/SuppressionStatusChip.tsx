'use client';

import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

/**
 * Reusable "Opted out" chip for client / lead / action-item rows.
 *
 * Looks up the phone against the global suppression list and renders a
 * compact red chip when the number is currently suppressed. Renders
 * nothing for unknown numbers or numbers that have resubscribed.
 *
 * Per `docs/afl-compliance-layer-whatwhy.md` the suppression list is
 * global per number across agents and lanes, so the chip is the same
 * whether viewed by the owning agent or anyone else with dashboard
 * access. The detail (date, source lane) is shown in the title tooltip.
 *
 * Implementation: one GET per mount per phone. Component callers that
 * already know a phone is suppressed (e.g. action items written by the
 * Phase 4 "client opted out" lane) can pass `initialSuppressed` to
 * avoid the round-trip.
 */
export interface SuppressionStatusChipProps {
  phoneE164: string | null | undefined;
  user: User | null;
  initialSuppressed?: boolean;
  /** Compact variant for tight list rows. */
  size?: 'sm' | 'md';
}

interface FetchResult {
  suppressed: boolean;
  status: {
    suppressedAt: string | null;
    suppressedVia: string | null;
    sourceLane: string | null;
  } | null;
}

export default function SuppressionStatusChip({
  phoneE164,
  user,
  initialSuppressed,
  size = 'sm',
}: SuppressionStatusChipProps) {
  const [data, setData] = useState<FetchResult | null>(
    initialSuppressed ? { suppressed: true, status: null } : null,
  );

  useEffect(() => {
    let cancelled = false;
    if (!user || !phoneE164) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `/api/compliance/suppression-status?phone=${encodeURIComponent(phoneE164)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return;
        const json = (await res.json()) as FetchResult;
        if (!cancelled) setData(json);
      } catch {
        // Best-effort. A failed lookup leaves the chip hidden — better
        // than rendering a false negative as a false positive.
      }
    })();
    return () => { cancelled = true; };
  }, [user, phoneE164]);

  if (!data?.suppressed) return null;

  const title = data.status?.suppressedAt
    ? `Opted out ${formatDate(data.status.suppressedAt)} (${data.status.suppressedVia ?? 'unknown'})`
    : 'Opted out';

  const sizeClasses =
    size === 'md'
      ? 'px-2.5 py-1 text-[12px]'
      : 'px-2 py-0.5 text-[11px]';

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full bg-[#fde6e6] font-semibold text-[#b42318] ${sizeClasses}`}
    >
      <span aria-hidden="true">⛔</span>
      Opted out
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
