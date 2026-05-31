'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '../DashboardContext';
import { ACTIVITY_ENABLED } from '../../../lib/feature-flags';
import { activityAccessReason } from '../../../lib/tier-gating';
import UpgradeToProCard from '../../../components/UpgradeToProCard';

type ActivityRange = 'today' | 'week' | 'month' | 'last30' | 'ytd';

type PolicySource = 'bought_lead' | 'referral' | 'rewrite' | 'manual_add';

interface ActivityStats {
  range: { from: string; to: string; label: string; key: ActivityRange };
  dials: { total: number; contacts: number; contactRate: number; deltaPct: number | null };
  appointments: {
    booked: number;
    showed: number;
    noShowed: number;
    cancelled: number;
    unresolved: number;
    showRate: number;
    bookRate: number;
    deltaPct: number | null;
  };
  sales: {
    count: number;
    apv: number;
    closeRate: number;
    deltaPct: number | null;
    bySource: Array<{
      source: PolicySource;
      label: string;
      color: string;
      count: number;
      apv: number;
      pct: number;
    }>;
  };
  saved: { apv: number; count: number; deltaPct: number | null };
  apvLifecycle: {
    submitted: number;
    grossIssued: number;
    chargebacks: number;
    netPlaced: number;
    netPlacedPct: number;
  };
  chargebacks: { count: number; rate: number };
  referralsActivity: { received: number; perClose: number };
  rewrites: { count: number; rate: number };
  funnel: Array<{ stage: string; count: number; pctOfPrev: number | null }>;
  recentWins: Array<{
    at: string;
    kind: 'sale' | 'save';
    clientName: string;
    amount: number;
    source: PolicySource | 'save';
    carrier: string | null;
    product: string | null;
  }>;
  ledger: Array<{
    clientId: string;
    policyId: string;
    clientName: string;
    carrier: string | null;
    product: string | null;
    policyNumber: string | null;
    submittedAt: string | null;
    premium: number | null;
    premiumFrequency: string | null;
    faceAmount: number | null;
    apv: number;
    issuePaidDate: string | null;
    chargebackDate: string | null;
    source: PolicySource;
  }>;
}

const RANGE_OPTIONS: Array<{ key: ActivityRange; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'last30', label: '30 days' },
  { key: 'ytd', label: 'YTD' },
];

function fmtUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtUsdLong(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}
// Referrals-per-close is a ratio, not a percentage — render as "1.6"
// (not "160%"). One decimal place is the right read for an agent
// tracking generation against the 2-3-per-close benchmark.
function fmtRatio(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(1);
}
function fmtSignedPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '↑' : n < 0 ? '↓' : '·';
  return `${sign} ${Math.abs(n).toFixed(0)}%`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  // Date-only values (sale / issue dates) are stored as UTC midnight.
  // Format in UTC so a "2026-05-01" date doesn't render as Apr 30 for
  // agents west of UTC (Pacific et al.).
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function DeltaChip({ pct }: { pct: number | null }) {
  if (pct === null || !Number.isFinite(pct)) {
    return <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded bg-gray-100 text-gray-500">— no prior</span>;
  }
  const tone = pct > 0
    ? 'bg-[#daf3f0] text-[#005851]'
    : pct < 0
    ? 'bg-amber-50 text-amber-800'
    : 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded ${tone}`}>
      {fmtSignedPct(pct)} vs prior
    </span>
  );
}

function HeroTile({
  label,
  primary,
  secondary,
  delta,
}: {
  label: string;
  primary: string;
  secondary?: string;
  delta?: number | null;
}) {
  return (
    <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 flex flex-col gap-2">
      <p className="text-[10px] uppercase tracking-wider text-[#707070] font-bold">{label}</p>
      <p className="text-4xl font-bold text-[#005851] tabular-nums leading-none">{primary}</p>
      {secondary && (
        <p className="text-xs text-[#707070] tabular-nums">{secondary}</p>
      )}
      {delta !== undefined && <DeltaChip pct={delta ?? null} />}
    </div>
  );
}

function FunnelRow({ stage, count, pctOfPrev, maxCount, tone }: {
  stage: string;
  count: number;
  pctOfPrev: number | null;
  maxCount: number;
  tone: string;
}) {
  const width = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-20 text-xs font-semibold text-[#374151] shrink-0">{stage}</span>
      <div className="flex-1 h-7 bg-[#f1f1f1] rounded overflow-hidden">
        <div
          className={`h-full ${tone} flex items-center justify-end pr-2 text-xs font-bold text-white tabular-nums transition-all duration-500`}
          style={{ width: `${Math.max(width, 4)}%` }}
        >
          {count > 0 ? count : ''}
        </div>
      </div>
      <span className="w-16 text-right text-xs text-[#707070] tabular-nums shrink-0">
        {pctOfPrev !== null && Number.isFinite(pctOfPrev) ? `${(pctOfPrev * 100).toFixed(0)}%` : '—'}
      </span>
    </div>
  );
}

const FUNNEL_TONES = [
  'bg-[#005851]',
  'bg-[#005851]/85',
  'bg-[#44bbaa]',
  'bg-[#44bbaa]/80',
  'bg-[#7fd1c4]',
];

function SourceBreakdown({ bySource, totalApv }: { bySource: ActivityStats['sales']['bySource']; totalApv: number }) {
  return (
    <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider">New APV by source</h3>
        <span className="text-2xl font-bold text-[#005851] tabular-nums">{fmtUsdLong(totalApv)}</span>
      </div>
      {totalApv === 0 ? (
        <p className="text-sm text-[#707070] italic py-4 text-center">
          No new sales in this period yet. Get on a call.
        </p>
      ) : (
        <>
          {/* Stacked bar */}
          <div className="flex h-3 rounded-full overflow-hidden mb-4 bg-[#f1f1f1]">
            {bySource.filter((s) => s.apv > 0).map((s) => (
              <div
                key={s.source}
                style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                title={`${s.label}: ${fmtUsdLong(s.apv)} (${s.pct.toFixed(1)}%)`}
              />
            ))}
          </div>
          {/* Legend rows */}
          <ul className="space-y-2">
            {bySource.map((s) => (
              <li key={s.source} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-[#374151] font-medium">{s.label}</span>
                  <span className="text-xs text-[#9CA3AF]">· {s.count}</span>
                </div>
                <div className="flex items-center gap-3 text-right shrink-0">
                  <span className="text-sm font-semibold text-[#0D4D4D] tabular-nums">{fmtUsdLong(s.apv)}</span>
                  <span className="w-10 text-xs text-[#707070] tabular-nums">{s.pct.toFixed(0)}%</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function SavedApvCard({ saved }: { saved: ActivityStats['saved'] }) {
  return (
    <div className="bg-[#FEFCE8] rounded-xl border-2 border-[#FCD34D] border-r-[5px] border-b-[5px] p-5 flex flex-col gap-2">
      <p className="text-[10px] uppercase tracking-wider text-[#92400E] font-bold">Saved APV</p>
      <p className="text-4xl font-bold text-[#92400E] tabular-nums leading-none">{fmtUsdLong(saved.apv)}</p>
      <p className="text-xs text-[#92400E]/80 tabular-nums">
        {saved.count} {saved.count === 1 ? 'save' : 'saves'} this period
      </p>
      <DeltaChip pct={saved.deltaPct} />
      <p className="text-[11px] text-[#92400E]/70 mt-1 leading-relaxed">
        Premiums preserved on at-risk policies. Counted separately from new APV.
      </p>
    </div>
  );
}

const SOURCE_BADGE_TONES: Record<PolicySource | 'save', string> = {
  bought_lead: 'bg-[#005851] text-white',
  referral: 'bg-[#44bbaa] text-white',
  rewrite: 'bg-[#7fd1c4] text-[#0D4D4D]',
  manual_add: 'bg-gray-200 text-gray-700',
  save: 'bg-[#FCD34D] text-[#92400E]',
};
const SOURCE_BADGE_LABELS: Record<PolicySource | 'save', string> = {
  bought_lead: 'Bought lead',
  referral: 'Referral',
  rewrite: 'Rewrite',
  manual_add: 'Earned lead',
  save: 'Retention save',
};

function RecentWins({ wins }: { wins: ActivityStats['recentWins'] }) {
  return (
    <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
      <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider mb-3">Recent wins</h3>
      {wins.length === 0 ? (
        <p className="text-sm text-[#707070] italic py-4 text-center">
          No wins recorded in this period yet.
        </p>
      ) : (
        <ul className="divide-y divide-[#f1f1f1]">
          {wins.map((w, idx) => {
            const policyLine = [w.carrier, w.product].filter(Boolean).join(' · ');
            return (
              <li key={idx} className="flex items-center gap-3 py-2.5">
                <span className="text-xs text-[#9CA3AF] w-12 shrink-0 tabular-nums">{fmtDate(w.at)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-[#000000] truncate">{w.clientName}</span>
                  {policyLine && (
                    <span className="block text-xs text-[#707070] truncate">{policyLine}</span>
                  )}
                </span>
                <span className="text-sm font-bold text-[#0D4D4D] tabular-nums shrink-0">
                  {fmtUsdLong(w.amount)}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${SOURCE_BADGE_TONES[w.source]}`}>
                  {SOURCE_BADGE_LABELS[w.source]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ApvLifecycle({ lifecycle }: { lifecycle: ActivityStats['apvLifecycle'] }) {
  const steps = [
    { label: 'Submitted', value: lifecycle.submitted, hint: 'APV sold this period' },
    { label: 'Gross Issued', value: lifecycle.grossIssued, hint: 'carrier issued & paid' },
    { label: 'Chargebacks', value: -lifecycle.chargebacks, hint: 'clawed back', negative: true },
    { label: 'Net Placed', value: lifecycle.netPlaced, hint: 'issued − chargebacks', strong: true },
  ];
  return (
    <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider">APV lifecycle</h3>
        <span className="text-xs text-[#707070] tabular-nums">
          Net placed {fmtPct(lifecycle.netPlacedPct)} of submitted
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {steps.map((s) => (
          <div
            key={s.label}
            className={`rounded-lg border p-3 ${
              s.strong
                ? 'border-[#005851] bg-[#daf3f0]'
                : s.negative
                ? 'border-amber-200 bg-amber-50'
                : 'border-[#e5e5e5] bg-[#fafafa]'
            }`}
          >
            <p className={`text-[10px] uppercase tracking-wider font-bold ${s.negative ? 'text-amber-800' : 'text-[#707070]'}`}>
              {s.label}
            </p>
            <p className={`text-2xl font-bold tabular-nums leading-tight ${s.negative ? 'text-amber-800' : 'text-[#005851]'}`}>
              {s.negative && s.value !== 0 ? `−${fmtUsdLong(Math.abs(s.value))}` : fmtUsdLong(s.value)}
            </p>
            <p className="text-[11px] text-[#9CA3AF]">{s.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LedgerDateInput({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (next: string) => void;
}) {
  return (
    <input
      type="date"
      defaultValue={value || ''}
      onChange={(e) => onCommit(e.target.value)}
      className="w-[130px] px-2 py-1 bg-white border border-[#d0d0d0] rounded text-xs text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30"
    />
  );
}

type LedgerStatus = 'submitted' | 'issued' | 'charged_back';

function ledgerRowStatus(row: ActivityStats['ledger'][number]): LedgerStatus {
  if (row.chargebackDate) return 'charged_back';
  if (row.issuePaidDate) return 'issued';
  return 'submitted';
}

const LEDGER_STATUS_META: Record<LedgerStatus, { label: string; tone: string }> = {
  submitted: { label: 'Submitted', tone: 'bg-gray-100 text-gray-600' },
  issued: { label: 'Issued', tone: 'bg-[#daf3f0] text-[#005851]' },
  charged_back: { label: 'Charged back', tone: 'bg-amber-50 text-amber-800' },
};

function PolicyLedger({
  rows,
  lifecycle,
  onUpdateDate,
}: {
  rows: ActivityStats['ledger'];
  lifecycle: ActivityStats['apvLifecycle'];
  onUpdateDate: (clientId: string, policyId: string, field: 'issuePaidDate' | 'chargebackDate', value: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider">Policy ledger</h3>
        <span className="text-xs text-[#707070]">Issue-paid &amp; chargeback dates are editable</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[#707070] italic py-4 text-center">
          No policies in this period yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#707070] border-b border-[#e5e5e5]">
                <th className="py-2 pr-3 font-bold">Submitted</th>
                <th className="py-2 pr-3 font-bold">Insured</th>
                <th className="py-2 pr-3 font-bold">Carrier</th>
                <th className="py-2 pr-3 font-bold">Product</th>
                <th className="py-2 pr-3 font-bold text-right">Premium</th>
                <th className="py-2 pr-3 font-bold text-right">Face</th>
                <th className="py-2 pr-3 font-bold text-right">APV</th>
                <th className="py-2 pr-3 font-bold">Issue Paid</th>
                <th className="py-2 pr-3 font-bold">Chargeback</th>
                <th className="py-2 pr-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status = ledgerRowStatus(r);
                const meta = LEDGER_STATUS_META[status];
                return (
                <tr key={r.policyId} className="border-b border-[#f1f1f1] align-middle">
                  <td className="py-2 pr-3 text-xs text-[#707070] tabular-nums whitespace-nowrap">
                    {r.submittedAt ? fmtDate(r.submittedAt) : '—'}
                  </td>
                  <td className="py-2 pr-3 font-medium text-[#000000] whitespace-nowrap">{r.clientName}</td>
                  <td className="py-2 pr-3 text-[#374151] whitespace-nowrap">{r.carrier || '—'}</td>
                  <td className="py-2 pr-3 text-[#374151] whitespace-nowrap">{r.product || '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                    {r.premium != null ? fmtUsdLong(r.premium) : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                    {r.faceAmount != null ? fmtUsdLong(r.faceAmount) : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold text-[#0D4D4D] tabular-nums whitespace-nowrap">
                    {fmtUsdLong(r.apv)}
                  </td>
                  <td className="py-2 pr-3">
                    <LedgerDateInput
                      value={r.issuePaidDate}
                      onCommit={(v) => onUpdateDate(r.clientId, r.policyId, 'issuePaidDate', v)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <LedgerDateInput
                      value={r.chargebackDate}
                      onCommit={(v) => onUpdateDate(r.clientId, r.policyId, 'chargebackDate', v)}
                    />
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${meta.tone}`}>
                      {meta.label}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#1A1A1A]">
                <td colSpan={10} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-semibold">
                    <span className="text-[#707070] uppercase tracking-wider">Totals</span>
                    <span className="text-[#374151]">Submitted <span className="text-[#0D4D4D] tabular-nums">{fmtUsdLong(lifecycle.submitted)}</span></span>
                    <span className="text-[#374151]">Gross Issued <span className="text-[#0D4D4D] tabular-nums">{fmtUsdLong(lifecycle.grossIssued)}</span></span>
                    <span className="text-amber-800">Chargebacks <span className="tabular-nums">{lifecycle.chargebacks > 0 ? `−${fmtUsdLong(lifecycle.chargebacks)}` : fmtUsdLong(0)}</span></span>
                    <span className="text-[#005851]">Net Placed <span className="tabular-nums font-bold">{fmtUsdLong(lifecycle.netPlaced)}</span></span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ActivityPage() {
  const router = useRouter();
  const { user, agentProfile, profileLoading } = useDashboard();
  const [range, setRange] = useState<ActivityRange>('month');
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Three-axis gate: ACTIVITY_ENABLED env var + tier (Pro+) + admin
  // override. Three outcomes:
  //   accessible  → render activity dashboard
  //   env_off     → redirect to /dashboard (legacy)
  //   tier_locked → render UpgradeToProCard
  // Bookmark / typed-URL defense — sidebar already hides this row for
  // tier-locked users via the same helper in dashboard/layout.tsx.
  const reason = activityAccessReason(agentProfile.membershipTier, user?.email);
  useEffect(() => {
    if (!user) return;
    if (profileLoading) return;
    if (reason === 'env_off') router.replace('/dashboard');
  }, [user, profileLoading, reason, router]);

  const fetchStats = useCallback(async () => {
    if (!user || reason !== 'accessible') return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/agent/activity?range=${range}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || `Failed to load (${res.status})`);
        return;
      }
      const data = (await res.json()) as ActivityStats;
      setStats(data);
    } catch (err) {
      console.error('activity fetch failed:', err);
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }, [user, range, reason]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const updateLedgerDate = useCallback(
    async (
      clientId: string,
      policyId: string,
      field: 'issuePaidDate' | 'chargebackDate',
      value: string,
    ) => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/policies', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ clientId, policyId, [field]: value || null }),
        });
        if (!res.ok) {
          setError('Could not save that date — please try again.');
          return;
        }
        // Refetch so the lifecycle totals reflect the new date.
        await fetchStats();
      } catch (err) {
        console.error('ledger date update failed:', err);
        setError('Network error saving date — please try again.');
      }
    },
    [user, fetchStats],
  );

  const funnelMax = useMemo(() => {
    if (!stats) return 0;
    return Math.max(...stats.funnel.map((s) => s.count), 1);
  }, [stats]);

  // Render-time gate — sits AFTER all hooks so rules-of-hooks is
  // satisfied. The useEffect above already kicked off the redirect for
  // env_off; here we return null while the profile loads and render
  // the upgrade card for tier_locked agents.
  if (!user || profileLoading) return null;
  if (reason === 'env_off') return null;
  if (reason === 'tier_locked') {
    return <UpgradeToProCard surface="activity" />;
  }
  // Defense-in-depth — kept for the legacy ACTIVITY_ENABLED off case,
  // already handled by reason === 'env_off' above but harmless to retain.
  if (!ACTIVITY_ENABLED) return null;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-[#000000]">Activity</h1>
          <p className="text-sm text-[#707070] mt-1">
            {stats ? `${fmtDate(stats.range.from)} — ${fmtDate(stats.range.to)} · ${stats.range.label}` : 'Loading…'}
          </p>
        </div>
        {/* Time range chips */}
        <div className="inline-flex rounded-[5px] border border-[#d0d0d0] overflow-hidden bg-white">
          {RANGE_OPTIONS.map((opt, idx) => {
            const active = range === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setRange(opt.key)}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${idx > 0 ? 'border-l border-[#d0d0d0]' : ''} ${
                  active ? 'bg-[#005851] text-white' : 'text-[#0D4D4D] hover:bg-[#f8f8f8]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading && !stats && (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin w-8 h-8 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {error && (
        <div className="rounded-[5px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">
          {error}
          <button
            onClick={() => void fetchStats()}
            className="ml-3 font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {stats && (
        <div className={loading ? 'opacity-60 pointer-events-none transition-opacity' : 'transition-opacity'}>
          {/* Hero tile row — raw counts. Rates pulled out into their
              own row below (per Daniel's May 24 ask) so agents see
              book/show/close rate as first-class KPIs instead of
              having them buried in secondary text. */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
            <HeroTile
              label="Dials"
              primary={stats.dials.total.toLocaleString()}
              secondary={`${stats.dials.contacts} contacts`}
              delta={stats.dials.deltaPct}
            />
            <HeroTile
              label="Contacts"
              primary={stats.dials.contacts.toLocaleString()}
              secondary={`${fmtPct(stats.dials.contactRate)} of dials`}
            />
            <HeroTile
              label="Booked"
              primary={stats.appointments.booked.toLocaleString()}
              secondary={
                stats.appointments.unresolved > 0
                  ? `${stats.appointments.unresolved} pending`
                  : undefined
              }
              delta={stats.appointments.deltaPct}
            />
            <HeroTile
              label="Sales"
              primary={stats.sales.count.toLocaleString()}
              secondary={
                stats.appointments.noShowed > 0
                  ? `${stats.appointments.noShowed} no-show`
                  : undefined
              }
              delta={stats.sales.deltaPct}
            />
            <HeroTile
              label="New APV"
              primary={fmtUsd(stats.sales.apv)}
              secondary={stats.sales.count > 0 ? `${fmtUsd(stats.sales.apv / stats.sales.count)} avg` : '—'}
              delta={stats.sales.deltaPct}
            />
          </div>

          {/* Conversion-rate row. Funnel order left-to-right: book →
              show → close. Each tile shows the rate prominently and
              names the formula in plain English in the secondary line
              so agents trust the number (and remember which is which
              when coaching their downline). Deltas intentionally
              omitted on rate tiles — rate trends are slower-moving
              than counts, and a noisy ±% chip on a 50%-ish rate
              creates more confusion than insight. Use the count
              deltas above + the rate values here to read the period. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <HeroTile
              label="Book rate"
              primary={fmtPct(stats.appointments.bookRate)}
              secondary={`booked / contacts · ${stats.appointments.booked} of ${stats.dials.contacts}`}
            />
            <HeroTile
              label="Show rate"
              primary={fmtPct(stats.appointments.showRate)}
              secondary={`showed / (showed + no-show) · ${stats.appointments.showed} of ${stats.appointments.showed + stats.appointments.noShowed}`}
            />
            <HeroTile
              label="Close rate"
              primary={fmtPct(stats.sales.closeRate)}
              secondary={`sales / showed · ${stats.sales.count} of ${stats.appointments.showed}`}
            />
          </div>

          {/* Funnel */}
          <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider">Funnel</h3>
              <span className="text-xs text-[#707070]">% = conversion from previous step</span>
            </div>
            <div className="space-y-0.5">
              {stats.funnel.map((step, idx) => (
                <FunnelRow
                  key={step.stage}
                  stage={step.stage}
                  count={step.count}
                  pctOfPrev={step.pctOfPrev}
                  maxCount={funnelMax}
                  tone={FUNNEL_TONES[idx] || FUNNEL_TONES[FUNNEL_TONES.length - 1]}
                />
              ))}
            </div>
          </div>

          {/* Business Health row. Distinct from the funnel rates above:
              those answer "is the lead→sale machine working this
              period?"; these answer "is the business actually
              compounding?" Maps to AFL's leaky-bucket pitch — plug
              losses (chargeback), grow via existing clients
              (referrals), deepen each one (rewrite). */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <HeroTile
              label="Chargeback rate"
              primary={fmtPct(stats.chargebacks.rate)}
              secondary={`chargebacks / sales · ${stats.chargebacks.count} of ${stats.sales.count}`}
            />
            <HeroTile
              label="Referrals per close"
              primary={fmtRatio(stats.referralsActivity.perClose)}
              secondary={`referrals / sales · ${stats.referralsActivity.received} of ${stats.sales.count}`}
            />
            <HeroTile
              label="Rewrite rate"
              primary={fmtPct(stats.rewrites.rate)}
              secondary={`rewrites / sales · ${stats.rewrites.count} of ${stats.sales.count}`}
            />
          </div>

          {/* Source breakdown + Saved APV side by side */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <div className="md:col-span-2">
              <SourceBreakdown bySource={stats.sales.bySource} totalApv={stats.sales.apv} />
            </div>
            <div>
              <SavedApvCard saved={stats.saved} />
            </div>
          </div>

          {/* APV lifecycle: submitted → issued → minus chargebacks = net */}
          <div className="mb-6">
            <ApvLifecycle lifecycle={stats.apvLifecycle} />
          </div>

          {/* Recent wins */}
          <div className="mb-6">
            <RecentWins wins={stats.recentWins} />
          </div>

          {/* Policy ledger — spreadsheet-style, with editable dates */}
          <PolicyLedger rows={stats.ledger} lifecycle={stats.apvLifecycle} onUpdateDate={updateLedgerDate} />
        </div>
      )}
    </div>
  );
}
