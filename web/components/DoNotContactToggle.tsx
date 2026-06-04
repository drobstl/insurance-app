'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

/**
 * Agent-facing "Do not contact" control for a lead / client phone.
 *
 * Reads the global suppression status (the same source as
 * `SuppressionStatusChip`) and lets an agent toggle an agent-set
 * do-not-contact, backed by `/api/compliance/do-not-contact`.
 *
 * Three states:
 *  - Recipient opt-out (STOP / natural-language): read-only. An agent
 *    cannot clear someone else's opt-out — only the recipient can resume
 *    by replying START. This mirrors the API's hard guard.
 *  - Agent-set manual DNC: shows the flag plus a "Remove" action.
 *  - Not suppressed: shows a "Mark do not contact" action.
 *
 * Per `docs/afl-compliance-layer-whatwhy.md`, suppression is global per
 * number across agents and lanes, so a DNC set here blocks every lane.
 */
export interface DoNotContactToggleProps {
  phoneE164: string | null | undefined;
  user: User | null;
  size?: 'sm' | 'md';
}

interface StatusResult {
  suppressed: boolean;
  status: {
    suppressedAt: string | null;
    suppressedVia: string | null;
    sourceLane: string | null;
  } | null;
}

export default function DoNotContactToggle({
  phoneE164,
  user,
  size = 'md',
}: DoNotContactToggleProps) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !phoneE164) {
      setLoading(false);
      return;
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/compliance/suppression-status?phone=${encodeURIComponent(phoneE164)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) setResult((await res.json()) as StatusResult);
    } catch {
      // Best-effort; leave prior state.
    } finally {
      setLoading(false);
    }
  }, [user, phoneE164]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const call = useCallback(
    async (method: 'POST' | 'DELETE') => {
      if (!user || !phoneE164) return;
      setBusy(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const url =
          method === 'POST'
            ? '/api/compliance/do-not-contact'
            : `/api/compliance/do-not-contact?phone=${encodeURIComponent(phoneE164)}`;
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          },
          body: method === 'POST' ? JSON.stringify({ phoneE164 }) : undefined,
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(j?.error ?? 'Something went wrong');
        } else {
          await refresh();
        }
      } catch {
        setError('Network error — please try again');
      } finally {
        setBusy(false);
      }
    },
    [user, phoneE164, refresh],
  );

  if (!phoneE164 || loading) return null;

  const suppressed = result?.suppressed ?? false;
  const via = result?.status?.suppressedVia ?? null;
  const isAgentManual = suppressed && via === 'manual';

  const btn =
    size === 'md'
      ? 'px-3 py-1.5 text-sm rounded-lg'
      : 'px-2 py-1 text-xs rounded-md';

  // Recipient opted out themselves — read-only, not clearable by an agent.
  if (suppressed && !isAgentManual) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#b42318]"
        title={via ? `Opted out via ${via}` : 'Opted out'}
      >
        <span aria-hidden="true">⛔</span>
        Opted out — recipient must reply START to resume
      </span>
    );
  }

  if (isAgentManual) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#b42318]">
          <span aria-hidden="true">⛔</span> Do not contact
        </span>
        <button
          type="button"
          onClick={() => call('DELETE')}
          disabled={busy}
          className={`${btn} border border-[#d0d0d0] text-[#005851] hover:bg-[#f3f3f3] disabled:opacity-50`}
        >
          {busy ? '…' : 'Remove'}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => call('POST')}
        disabled={busy}
        className={`${btn} border border-[#d0d0d0] text-[#b42318] hover:bg-[#fde6e6] disabled:opacity-50`}
        title="Add this number to the global do-not-contact list (blocks all automated and manual outreach)"
      >
        {busy ? '…' : '⛔ Mark do not contact'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
