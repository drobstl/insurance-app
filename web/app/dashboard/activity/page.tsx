'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '../DashboardContext';
import { ACTIVITY_ENABLED } from '../../../lib/feature-flags';

type ActivityRange = 'today' | 'week' | 'month' | 'last30' | 'ytd';

type PolicySource = 'bought_lead' | 'referral' | 'rewrite' | 'manual_add';

interface ActivityStats {
  range: { from: string; to: string; label: string; key: ActivityRange };
  dials: { total: number; contacts: number; contactRate: number; deltaPct: number | null };
  appointments: {
    booked: number;
    showed: number;
    noShowed: number;
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
  funnel: Array<{ stage: string; count: number; pctOfPrev: number | null }>;
  recentWins: Array<{
    at: string;
    kind: 'sale' | 'save';
    clientName: string;
    amount: number;
    source: PolicySource | 'save';
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
function fmtSignedPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '↑' : n < 0 ? '↓' : '·';
  return `${sign} ${Math.abs(n).toFixed(0)}%`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  manual_add: 'Manual',
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
          {wins.map((w, idx) => (
            <li key={idx} className="flex items-center gap-3 py-2.5">
              <span className="text-xs text-[#9CA3AF] w-12 shrink-0 tabular-nums">{fmtDate(w.at)}</span>
              <span className="flex-1 text-sm font-medium text-[#000000] truncate">{w.clientName}</span>
              <span className="text-sm font-bold text-[#0D4D4D] tabular-nums shrink-0">
                {fmtUsdLong(w.amount)}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${SOURCE_BADGE_TONES[w.source]}`}>
                {SOURCE_BADGE_LABELS[w.source]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ActivityPage() {
  const router = useRouter();
  const { user } = useDashboard();
  const [range, setRange] = useState<ActivityRange>('month');
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Feature flag redirect — bookmark/typed-URL defense. The sidebar
  // already hides this row behind a strikethrough "Coming soon"
  // placeholder when ACTIVITY_ENABLED is off.
  useEffect(() => {
    if (!ACTIVITY_ENABLED) router.replace('/dashboard');
  }, [router]);

  const fetchStats = useCallback(async () => {
    if (!user || !ACTIVITY_ENABLED) return;
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
  }, [user, range]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const funnelMax = useMemo(() => {
    if (!stats) return 0;
    return Math.max(...stats.funnel.map((s) => s.count), 1);
  }, [stats]);

  // Render-time gate — sits AFTER all hooks so rules-of-hooks is
  // satisfied. The useEffect above already kicked off the redirect;
  // returning null prevents a blink of the activity layout.
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
          {/* Hero tile row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <HeroTile
              label="Dials"
              primary={stats.dials.total.toLocaleString()}
              secondary={`${stats.dials.contacts} contacts · ${fmtPct(stats.dials.contactRate)}`}
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
                  ? `${fmtPct(stats.appointments.bookRate)} book rate · ${stats.appointments.unresolved} pending`
                  : `${fmtPct(stats.appointments.bookRate)} book rate`
              }
              delta={stats.appointments.deltaPct}
            />
            <HeroTile
              label="Sales"
              primary={stats.sales.count.toLocaleString()}
              secondary={`${fmtPct(stats.sales.closeRate)} of shows · ${fmtPct(stats.appointments.showRate)} show rate · ${stats.appointments.noShowed} no-show`}
              delta={stats.sales.deltaPct}
            />
            <HeroTile
              label="New APV"
              primary={fmtUsd(stats.sales.apv)}
              secondary={stats.sales.count > 0 ? `${fmtUsd(stats.sales.apv / stats.sales.count)} avg` : '—'}
              delta={stats.sales.deltaPct}
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

          {/* Source breakdown + Saved APV side by side */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <div className="md:col-span-2">
              <SourceBreakdown bySource={stats.sales.bySource} totalApv={stats.sales.apv} />
            </div>
            <div>
              <SavedApvCard saved={stats.saved} />
            </div>
          </div>

          {/* Recent wins */}
          <RecentWins wins={stats.recentWins} />
        </div>
      )}
    </div>
  );
}
