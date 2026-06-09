'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

/**
 * Company-wide production rollup for admins — sits at the top of
 * /dashboard/admin/stats. Answers "how much APV is the whole system
 * saving/earning, and who just did what" (e.g. "Ashley saved Tandeka
 * Jones's policy"). Distinct from the personal "Your Stats" block below
 * it and from the acquisition-focused Growth page.
 *
 * Data: GET /api/admin/performance (admin-gated, Admin SDK).
 */

type ActivityType = 'save' | 'rewrite' | 'referral';

interface ActivityItem {
  id: string;
  type: ActivityType;
  agentUid: string;
  agentName: string;
  clientName: string;
  apv: number;
  timestampMs: number;
  carrier: string | null;
  detail: string | null;
}

interface PerAgentRow {
  uid: string;
  name: string;
  totalApv: number;
  savedCount: number;
  savedApv: number;
  rewriteCount: number;
  rewriteApv: number;
  referralTotal: number;
  referralApv: number;
}

interface PerformanceData {
  totals: {
    totalApv: number;
    savedApv: number;
    savedCount: number;
    rewriteApv: number;
    rewriteCount: number;
    referralApv: number;
    referralTotal: number;
    clientsFromReferrals: number;
    touchpoints: number;
    agentsWithStats: number;
    totalAgents: number;
  };
  statsUpdatedAtMs: number | null;
  perAgent: PerAgentRow[];
  recentActivity: ActivityItem[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function timeAgo(ms: number): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const ACTIVITY_META: Record<ActivityType, { icon: string; label: string; verb: (a: ActivityItem) => string }> = {
  save: {
    icon: '🛟',
    label: 'Saved',
    verb: (a) => `saved ${a.clientName}'s policy`,
  },
  rewrite: {
    icon: '✏️',
    label: 'Rewrite',
    verb: (a) => `booked a rewrite with ${a.clientName}`,
  },
  referral: {
    icon: '🤝',
    label: 'Referral',
    verb: (a) => `booked a referral appointment (${a.clientName})`,
  },
};

export default function AdminSystemPerformance({ user }: { user: User }) {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/performance', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      setData((await res.json()) as PerformanceData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load company performance');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const t = data?.totals;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-[#000000]">Company Performance</h1>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#d0d0d0] text-[#005851] rounded-[5px] text-xs font-semibold hover:bg-[#f3f3f3] transition-colors disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <p className="text-sm text-[#707070] mb-4">
        Across all agents{t ? ` · ${t.agentsWithStats} of ${t.totalAgents} with activity` : ''}.
        {' '}Totals refresh daily (6 AM UTC); the recent-wins feed is live.
        {data?.statsUpdatedAtMs ? ` Last rollup: ${timeAgo(data.statsUpdatedAtMs)}.` : ''}
      </p>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-[5px] p-4 text-sm text-red-700">
          {error}{' '}
          <button onClick={() => void load()} className="underline font-semibold">Retry</button>
        </div>
      ) : loading && !data ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#005851]" />
        </div>
      ) : t ? (
        <div className="space-y-6">
          {/* ── Total APV across everyone ── */}
          <div className="bg-gradient-to-r from-[#005851] to-[#007a6e] rounded-[5px] p-6 text-white">
            <p className="text-sm text-white/70 font-medium mb-1">Total Annual Premium Value — All Agents</p>
            <p className="text-4xl font-bold">{formatCurrency(t.totalApv)}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-sm">
              <div>
                <span className="text-white/60">Saved</span>
                <span className="ml-2 font-semibold">{formatCurrency(t.savedApv)}</span>
                <span className="ml-1 text-white/50">({t.savedCount})</span>
              </div>
              <div>
                <span className="text-white/60">Rewrites</span>
                <span className="ml-2 font-semibold">{formatCurrency(t.rewriteApv)}</span>
                <span className="ml-1 text-white/50">({t.rewriteCount})</span>
              </div>
              <div>
                <span className="text-white/60">Referrals</span>
                <span className="ml-2 font-semibold">{formatCurrency(t.referralApv)}</span>
                <span className="ml-1 text-white/50">({t.referralTotal})</span>
              </div>
            </div>
          </div>

          {/* ── Recent wins (live feed) ── */}
          <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#000000]">Recent Wins</h2>
              <span className="text-xs text-[#707070]">Live · across all agents</span>
            </div>
            {data && data.recentActivity.length === 0 ? (
              <p className="text-sm text-[#707070]">No saves, rewrites, or booked referrals recorded yet.</p>
            ) : (
              <ul className="divide-y divide-[#f0f0f0]">
                {data?.recentActivity.map((a) => {
                  const meta = ACTIVITY_META[a.type];
                  return (
                    <li key={`${a.type}-${a.agentUid}-${a.id}`} className="flex items-center gap-3 py-2.5">
                      <span className="text-xl shrink-0" aria-hidden>{meta.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[#000000] truncate">
                          <span className="font-semibold">{a.agentName}</span>{' '}{meta.verb(a)}
                        </p>
                        <p className="text-xs text-[#707070]">
                          {[a.carrier, a.detail].filter(Boolean).join(' · ') || meta.label}
                          {' · '}{timeAgo(a.timestampMs)}
                        </p>
                      </div>
                      {a.apv > 0 && (
                        <span className="shrink-0 text-sm font-semibold text-[#005851]">{formatCurrency(a.apv)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ── Per-agent leaderboard ── */}
          <div className="bg-white rounded-[5px] border border-[#d0d0d0] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#ececec]">
              <h2 className="text-lg font-bold text-[#000000]">By Agent</h2>
              <p className="text-xs text-[#707070] mt-0.5">Sorted by total APV. Refreshes daily.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F8F9FA] text-[#707070]">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Agent</th>
                    <th className="text-right px-4 py-2 font-semibold">Total APV</th>
                    <th className="text-right px-4 py-2 font-semibold">Saved</th>
                    <th className="text-right px-4 py-2 font-semibold">Rewrites</th>
                    <th className="text-right px-4 py-2 font-semibold">Referrals</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.perAgent.map((row) => (
                    <tr key={row.uid} className="border-t border-[#f0f0f0]">
                      <td className="px-4 py-2 text-[#2D3748]">{row.name}</td>
                      <td className="px-4 py-2 text-right font-semibold text-[#000000]">{formatCurrency(row.totalApv)}</td>
                      <td className="px-4 py-2 text-right text-[#2D3748] whitespace-nowrap">
                        {row.savedCount} <span className="text-[#707070]">· {formatCurrency(row.savedApv)}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-[#2D3748] whitespace-nowrap">
                        {row.rewriteCount} <span className="text-[#707070]">· {formatCurrency(row.rewriteApv)}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-[#2D3748]">{row.referralTotal}</td>
                    </tr>
                  ))}
                  {data && data.perAgent.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-[#707070]">
                        No agent stats computed yet. They populate after the nightly rollup.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <div className="border-t border-[#d0d0d0] mt-8" />
    </section>
  );
}
