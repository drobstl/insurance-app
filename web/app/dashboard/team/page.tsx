'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '../DashboardContext';

/**
 * /dashboard/team — the agency owner's "My Team" dashboard.
 *
 * Read-only view of the owner's downline (agents linked via their invite
 * code): each member's headline metrics + an AI coaching radar, the owner's
 * own pen, and an agency-wide rollup. Gated to `isAgencyOwner` agents
 * client-side here AND server-side in /api/agency/team. Performance metrics
 * only — no downline client PII.
 */

type ActivityRange = 'today' | 'week' | 'month' | 'last30' | 'ytd';

interface CoachingRadar {
  scoredCalls: number;
  overallAvg: number | null;
  dimensions: Array<{ key: string; label: string; avgScore: number; calls: number }>;
  focus: { key: string; label: string; avgScore: number } | null;
  topPriorities: Array<{ text: string; count: number }>;
}
interface MemberRow {
  uid: string;
  name: string;
  sales: { count: number; apv: number };
  netPlacedApv: number;
  chargebacks: number;
  chargebackRate: number;
  showRate: number;
  referralsReceived: number;
  rewrites: number;
  coaching: CoachingRadar;
}
interface TeamOverview {
  range: ActivityRange;
  coachingWindowDays: number;
  owner: MemberRow;
  memberCount: number;
  truncated: boolean;
  members: MemberRow[];
  agency: {
    totalSales: number;
    totalSalesApv: number;
    totalNetPlacedApv: number;
    totalChargebacks: number;
    avgShowRate: number;
  };
}

const RANGES: ActivityRange[] = ['today', 'week', 'month', 'last30', 'ytd'];
const RANGE_LABELS: Record<ActivityRange, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  last30: 'Last 30 days',
  ytd: 'Year to date',
};

function money(n: number): string {
  return `$${Math.round(n || 0).toLocaleString()}`;
}
// Rates come through as either a 0–1 fraction or an already-0–100 percent
// depending on the metric; normalize both to a clean integer percent.
function pct(n: number): string {
  const v = n <= 1 ? n * 100 : n;
  return `${Math.round(v)}%`;
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-[8px] border border-[#e2e2e2] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${tone === 'bad' ? 'text-[#B91C1C]' : tone === 'good' ? 'text-[#005851]' : 'text-[#0D4D4D]'}`}>
        {value}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">{label}</p>
      <p className="text-sm font-bold text-[#111827]">{value}</p>
    </div>
  );
}

function CoachingRadarView({ coaching, windowDays }: { coaching: CoachingRadar; windowDays: number }) {
  if (coaching.scoredCalls === 0) {
    return (
      <p className="text-xs text-[#9CA3AF] italic">No scored calls in the last {windowDays} days.</p>
    );
  }
  return (
    <div className="space-y-3">
      {coaching.focus && (
        <div className="inline-flex items-center gap-2 rounded-full bg-[#FEF3C7] px-3 py-1">
          <span className="text-xs font-bold uppercase tracking-wide text-[#92400E]">Coach on</span>
          <span className="text-sm font-bold text-[#92400E]">{coaching.focus.label}</span>
          <span className="text-xs text-[#B45309]">({coaching.focus.avgScore.toFixed(1)}/10)</span>
        </div>
      )}
      <div className="space-y-1.5">
        {coaching.dimensions.map((d) => (
          <div key={d.key} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs text-[#374151]">{d.label}</span>
            <div className="h-2 flex-1 rounded-full bg-[#F1F1F1]">
              <div
                className={`h-2 rounded-full ${d.avgScore < 6 ? 'bg-[#F59E0B]' : 'bg-[#44bbaa]'}`}
                style={{ width: `${Math.max(4, Math.min(100, d.avgScore * 10))}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-xs font-semibold text-[#374151]">{d.avgScore.toFixed(1)}</span>
          </div>
        ))}
      </div>
      {coaching.topPriorities.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Recurring fixes</p>
          <ul className="mt-1 space-y-0.5">
            {coaching.topPriorities.map((p) => (
              <li key={p.text} className="text-xs text-[#374151]">
                • {p.text}
                {p.count > 1 && <span className="text-[#9CA3AF]"> ×{p.count}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-[#9CA3AF]">
        {coaching.scoredCalls} scored {coaching.scoredCalls === 1 ? 'call' : 'calls'}
        {coaching.overallAvg !== null && ` · avg ${coaching.overallAvg.toFixed(1)}/10`}
      </p>
    </div>
  );
}

function MemberCard({ row, windowDays, isOwner }: { row: MemberRow; windowDays: number; isOwner?: boolean }) {
  return (
    <div className={`rounded-[10px] border bg-white p-5 ${isOwner ? 'border-[#44bbaa]' : 'border-[#e2e2e2]'}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-bold text-[#005851]">{row.name}</h3>
        {isOwner && (
          <span className="rounded-full bg-[#005851] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Your pen
          </span>
        )}
      </div>
      <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Metric label="Sales" value={String(row.sales.count)} />
        <Metric label="Sold APV" value={money(row.sales.apv)} />
        <Metric label="Net placed" value={money(row.netPlacedApv)} />
        <Metric label="Chargebacks" value={`${row.chargebacks} (${pct(row.chargebackRate)})`} />
        <Metric label="Show rate" value={pct(row.showRate)} />
        <Metric label="Ref + rewrites" value={String(row.referralsReceived + row.rewrites)} />
      </div>
      <CoachingRadarView coaching={row.coaching} windowDays={windowDays} />
    </div>
  );
}

export default function TeamPage() {
  const { user, agentProfile, refreshProfile } = useDashboard();
  const router = useRouter();
  const [range, setRange] = useState<ActivityRange>('month');
  const [coachingDays, setCoachingDays] = useState<14 | 28>(28);
  const [data, setData] = useState<TeamOverview | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'forbidden'>('loading');
  const [copied, setCopied] = useState(false);
  // Invite code is lazy-generated: agents/{uid}.inviteCode may not exist yet.
  // If the profile has none, hit GET /api/agent-invite, which generates +
  // persists one, so the "Your agency invite link" box always renders.
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const profileLoaded = !!user && Object.keys(agentProfile).length > 0;
  const isOwner = agentProfile.isAgencyOwner === true;
  const inviteCode = agentProfile.inviteCode ?? generatedCode;

  const [reloadNonce, setReloadNonce] = useState(0);

  // Fetch the team overview when the owner / range / coaching window changes
  // (or on a manual retry via reloadNonce). All work lives inside the effect
  // with a `cancelled` guard so setState never fires synchronously in the
  // effect body or after unmount (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!profileLoaded || !isOwner || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        if (cancelled) return;
        setStatus('loading');
        const res = await fetch(`/api/agency/team?range=${range}&coachingDays=${coachingDays}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.status === 403) {
          setStatus('forbidden');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }
        const json = (await res.json()) as TeamOverview;
        if (cancelled) return;
        setData(json);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileLoaded, isOwner, user, range, coachingDays, reloadNonce]);

  // Ensure an invite code exists. GET /api/agent-invite lazily generates and
  // stores one (agents/{uid}.inviteCode + agentInviteCodes/{code}); we mirror
  // it locally for an instant render and refresh the profile so the rest of
  // the app sees it too. Non-fatal — the link box just stays hidden on failure.
  useEffect(() => {
    if (!profileLoaded || !isOwner || !user) return;
    if (agentProfile.inviteCode || generatedCode) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/agent-invite', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled || !res.ok) return;
        const json = (await res.json()) as { inviteCode?: string };
        if (cancelled || typeof json.inviteCode !== 'string') return;
        setGeneratedCode(json.inviteCode);
        void refreshProfile();
      } catch {
        /* non-fatal — link box stays hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileLoaded, isOwner, user, agentProfile.inviteCode, generatedCode, refreshProfile]);

  const inviteLink =
    typeof window !== 'undefined' && inviteCode
      ? `${window.location.origin}/signup?ref=${inviteCode}`
      : null;

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  // Hold a spinner until the profile resolves so the gate doesn't flash.
  if (!profileLoaded) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <svg className="h-7 w-7 animate-spin text-[#44bbaa]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!isOwner || status === 'forbidden') {
    return (
      <div className="max-w-2xl p-6">
        <h1 className="text-2xl font-bold text-[#005851]">My Team</h1>
        <p className="mt-3 text-[#6B7280]">
          This area is for agency owners. If you run an agency and want team visibility + coaching insights for your
          downline, reach out to support to get set up.
        </p>
        <button onClick={() => router.push('/dashboard')} className="mt-4 font-semibold text-[#44bbaa]">
          ← Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#005851]">My Team</h1>
          <p className="text-sm text-[#6B7280]">Your downline&apos;s performance and what to coach them on.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as ActivityRange)}
            className="rounded-[6px] border border-[#d0d0d0] bg-white px-3 py-1.5 text-sm font-semibold text-[#374151]"
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {RANGE_LABELS[r]}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-full border border-[#d0d0d0] bg-[#f3f3f3] p-0.5">
            {([14, 28] as const).map((d) => (
              <button
                key={d}
                onClick={() => setCoachingDays(d)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  coachingDays === d ? 'bg-white text-[#005851] shadow-sm' : 'text-[#6B7280]'
                }`}
              >
                {d === 14 ? '2 wks' : '4 wks'} coaching
              </button>
            ))}
          </div>
        </div>
      </div>

      {inviteLink && (
        <div className="mb-5 flex flex-col gap-2 rounded-[8px] border border-[#44bbaa]/40 bg-[#f0faf8] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#005851]">Your agency invite link</p>
            <p className="mt-0.5 break-all text-sm text-[#374151]">{inviteLink}</p>
          </div>
          <button
            onClick={copyInvite}
            className="shrink-0 rounded-[6px] bg-[#44bbaa] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005751]"
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex min-h-[30vh] items-center justify-center">
          <svg className="h-7 w-7 animate-spin text-[#44bbaa]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-[8px] border border-[#FCA5A5] bg-[#FEF2F2] p-4">
          <p className="text-sm text-[#B91C1C]">Couldn&apos;t load your team right now.</p>
          <button onClick={() => setReloadNonce((n) => n + 1)} className="mt-2 text-sm font-semibold text-[#B91C1C] underline">
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryCard label="Agents" value={String(data.memberCount)} />
            <SummaryCard label="Team sales" value={String(data.agency.totalSales)} />
            <SummaryCard label="Sold APV" value={money(data.agency.totalSalesApv)} tone="good" />
            <SummaryCard label="Net placed" value={money(data.agency.totalNetPlacedApv)} tone="good" />
            <SummaryCard label="Chargebacks" value={String(data.agency.totalChargebacks)} tone="bad" />
            <SummaryCard label="Avg show rate" value={pct(data.agency.avgShowRate)} />
          </div>

          <div className="mb-6">
            <MemberCard row={data.owner} windowDays={data.coachingWindowDays} isOwner />
          </div>

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#005851]">Downline</h2>
            {data.truncated && (
              <span className="text-xs text-[#9CA3AF]">Showing first {data.members.length} agents</span>
            )}
          </div>
          {data.members.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-[#d0d0d0] bg-white p-6 text-center">
              <p className="text-sm text-[#6B7280]">
                No agents on your team yet. Share your invite link above, or ask support to attach
                an existing agent to your team.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.members.map((m) => (
                <MemberCard key={m.uid} row={m} windowDays={data.coachingWindowDays} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
