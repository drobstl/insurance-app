'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';

import { auth } from '../../../../firebase';
import { isAdminEmail } from '../../../../lib/admin';
import {
  TIER_DISPLAY,
  type LineHealthSnapshot,
  type LineHealthTier,
} from '../../../../lib/line-health-shared';

/**
 * Admin Linq line-health widget.
 *
 * Phase A (May 10, 2026) — visibility only. Reads the 7-day rolling
 * reply-rate metric, classifies the line into a tier, and lets the
 * admin pin a manual override when Linq's PSM emails a downgrade
 * warning we can't auto-detect.
 *
 * No auto-throttle enforcement yet — that's Phase B, ships after
 * we've watched real data for 1-2 weeks to confirm the spec
 * thresholds match AFL traffic patterns.
 */

const TIER_OPTIONS: Array<{ value: LineHealthTier | null; label: string }> = [
  { value: null, label: 'Clear override (auto-classify)' },
  { value: 0, label: 'Tier 0 — Healthy' },
  { value: 1, label: 'Tier 1 — Watch' },
  { value: 2, label: 'Tier 2 — Throttle' },
  { value: 3, label: 'Tier 3 — Pause' },
  { value: 4, label: 'Tier 4 — Lockdown' },
];

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatRatio(outbound: number, inbound: number): string {
  if (outbound <= 0) return '—';
  if (inbound <= 0) return `${outbound}:0`;
  // Render as "1 reply per X sends" (matches Linq's "1:2" framing).
  const sendsPerReply = outbound / inbound;
  if (!Number.isFinite(sendsPerReply)) return '—';
  return `1 : ${sendsPerReply.toFixed(2)}`;
}

export default function LineHealthAdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const [snapshot, setSnapshot] = useState<LineHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overrideTier, setOverrideTier] = useState<LineHealthTier | null | undefined>(undefined);
  const [overrideReason, setOverrideReason] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      const email = u?.email ?? null;
      const ok = !!u && isAdminEmail(email);
      setAllowed(ok);
      setAuthChecked(true);
      if (!u) {
        router.replace('/login');
      } else if (!ok) {
        router.replace('/dashboard');
      }
    });
    return () => unsub();
  }, [router]);

  const fetchSnapshot = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/line-health', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `Failed (${res.status})`);
      }
      const data = (await res.json()) as LineHealthSnapshot;
      setSnapshot(data);
      setOverrideTier(data.manualTier);
      setOverrideReason(data.manualOverrideReason ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load line health.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (allowed) void fetchSnapshot();
  }, [allowed, fetchSnapshot]);

  const handleSaveOverride = async () => {
    if (!user || overrideTier === undefined) return;
    setSavingOverride(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/line-health', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tier: overrideTier,
          reason: overrideReason.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `Failed (${res.status})`);
      }
      const data = (await res.json()) as LineHealthSnapshot;
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save override.');
    } finally {
      setSavingOverride(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[#5f5f5f]">
        Checking access…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[#5f5f5f]">
        Redirecting…
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-16 pb-24 md:pt-6 md:pb-10 md:ml-56 md:mr-[300px] px-4 md:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[#0D4D4D]">Linq Line Health</h1>
        <p className="text-sm text-[#4f4f4f] mt-1">
          7-day rolling reply rate on the Linq pooled SMS line. Classification follows the
          KPI tier spec. Phase A: visibility only — no auto-throttle enforcement yet.
        </p>
      </header>

      {error ? (
        <p className="mb-4 rounded-lg border border-[#f3a8a8] bg-[#fff5f5] px-3 py-2 text-xs font-semibold text-[#b42318]">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#5f5f5f]">Loading…</p>
      ) : !snapshot ? (
        <p className="text-sm text-[#5f5f5f]">No data yet.</p>
      ) : (
        <>
          <section className="mb-6 rounded-2xl border-2 border-[#E5E7EB] bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[#6B7280]">
                  Effective tier
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-bold ${TIER_DISPLAY[snapshot.effectiveTier].badgeClassName}`}
                  >
                    Tier {snapshot.effectiveTier} · {TIER_DISPLAY[snapshot.effectiveTier].label}
                  </span>
                  {snapshot.manualTier !== null && snapshot.manualTier > snapshot.autoTier ? (
                    <span className="text-xs text-[#6B7280]">
                      (manual override; auto-tier is {snapshot.autoTier})
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-[#4B5563] max-w-xl">
                  {TIER_DISPLAY[snapshot.effectiveTier].description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchSnapshot()}
                className="rounded-lg border border-[#d0d0d0] bg-white px-3 py-1.5 text-xs font-bold text-[#0D4D4D] hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>
          </section>

          <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#6B7280]">
                7-day reply rate
              </p>
              <p className="mt-2 text-3xl font-extrabold text-[#0D4D4D]">
                {formatPercent(snapshot.metrics.replyRate)}
              </p>
              <p className="mt-1 text-xs text-[#4B5563]">
                {snapshot.metrics.inboundCount} replies on{' '}
                {snapshot.metrics.outboundCount} outbound
              </p>
              <p className="mt-1 text-xs text-[#6B7280]">
                Linq target: 30–40% · floor: 15%
              </p>
            </article>

            <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#6B7280]">
                Send : reply ratio
              </p>
              <p className="mt-2 text-3xl font-extrabold text-[#0D4D4D]">
                {formatRatio(snapshot.metrics.outboundCount, snapshot.metrics.inboundCount)}
              </p>
              <p className="mt-1 text-xs text-[#4B5563]">
                Linq target: 1 : 2 (one reply per two sends)
              </p>
            </article>

            <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#6B7280]">
                Today (so far)
              </p>
              <p className="mt-2 text-3xl font-extrabold text-[#0D4D4D]">
                {snapshot.metrics.outboundToday} <span className="text-sm font-medium text-[#6B7280]">out</span>
              </p>
              <p className="mt-1 text-xs text-[#4B5563]">
                {snapshot.metrics.inboundToday} replies in
              </p>
              <p className="mt-1 text-xs text-[#6B7280]">
                Linq cap: 50/day new conversations
              </p>
            </article>
          </section>

          {Object.keys(snapshot.metrics.outboundByLane).length > 0 ? (
            <section className="mb-6 rounded-2xl border border-[#E5E7EB] bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#6B7280] mb-3">
                7-day outbound by lane
              </p>
              <ul className="space-y-1.5 text-sm text-[#2D3748]">
                {Object.entries(snapshot.metrics.outboundByLane)
                  .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                  .map(([lane, count]) => (
                    <li key={lane} className="flex items-center justify-between">
                      <span className="font-medium capitalize">
                        {lane.replace(/_/g, ' ')}
                      </span>
                      <span className="font-bold text-[#0D4D4D]">{count}</span>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          <section className="mb-6 rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-[#6B7280] mb-2">
              Manual override
            </p>
            <p className="text-xs text-[#4B5563] mb-3 max-w-xl">
              Pin a tier when Linq sends a downgrade warning email that we can&apos;t
              auto-detect. Manual override only escalates — if you set Tier 1 but
              auto-classification is Tier 2, the higher Tier 2 still applies.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#6B7280] mb-1">
                  Tier
                </span>
                <select
                  value={overrideTier === null ? 'null' : overrideTier === undefined ? '' : String(overrideTier)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'null') setOverrideTier(null);
                    else setOverrideTier(Number(v) as LineHealthTier);
                  }}
                  className="w-full rounded-lg border border-[#d0d0d0] bg-white px-3 py-2 text-sm text-[#0D4D4D] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3]/40"
                >
                  {TIER_OPTIONS.map((opt) => (
                    <option key={String(opt.value)} value={opt.value === null ? 'null' : String(opt.value)}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-[2]">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#6B7280] mb-1">
                  Reason (optional)
                </span>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Linq PSM emailed downgrade warning 2026-05-10"
                  className="w-full rounded-lg border border-[#d0d0d0] bg-white px-3 py-2 text-sm text-[#0D4D4D] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3]/40"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleSaveOverride()}
                disabled={savingOverride}
                className="rounded-lg bg-[#0D4D4D] px-4 py-2 text-xs font-bold text-white hover:bg-[#0B3E3E] disabled:opacity-60"
              >
                {savingOverride ? 'Saving…' : 'Save override'}
              </button>
            </div>
            {snapshot.manualOverrideSetAt ? (
              <p className="mt-3 text-[11px] text-[#6B7280]">
                Last updated by {snapshot.manualOverrideSetBy ?? 'unknown'} at{' '}
                {new Date(snapshot.manualOverrideSetAt).toLocaleString()}
                {snapshot.manualOverrideReason ? ` · ${snapshot.manualOverrideReason}` : ''}
              </p>
            ) : null}
          </section>

          <p className="text-[11px] text-[#6B7280]">
            Computed at {new Date(snapshot.metrics.computedAt).toLocaleString()}.
          </p>
        </>
      )}
    </div>
  );
}
