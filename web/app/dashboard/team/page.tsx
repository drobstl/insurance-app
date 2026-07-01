'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '../DashboardContext';
import ScoringInfinity from '../../../components/ScoringInfinity';

/**
 * /dashboard/team — the agency owner's "My Team" dashboard.
 *
 * Scaled for 30+ downline: an agency rollup, a "Coaching Intelligence"
 * triage (who to coach this week, in two tiers off each agent's recent
 * movement), a standout recognition banner, and a ranked, searchable,
 * sortable table where tapping an agent expands their detail inline
 * (activity funnel + coaching radar + recurring fixes).
 *
 * Gated to `isAgencyOwner` client-side here AND server-side in
 * /api/agency/team. Performance metrics only — no downline client PII.
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
  dials: number;
  contactRate: number;
  booked: number;
  bookRate: number;
  closeRate: number;
  sales: { count: number; apv: number };
  netPlacedApv: number;
  chargebacks: number;
  chargebackRate: number;
  showRate: number;
  referralsReceived: number;
  rewrites: number;
  deltaPct: number | null;
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
    totalBooked: number;
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

// ── Formatting ───────────────────────────────────────────────────────
function money(n: number): string {
  return `$${Math.round(n || 0).toLocaleString()}`;
}
// Rates arrive as a 0–1 fraction; render as a clean integer percent.
function pctInt(n: number): number {
  const v = n <= 1 ? n * 100 : n;
  return Math.round(v);
}

// ── Coaching-focus severity ──────────────────────────────────────────
// A named coaching item only makes sense when the weakest R.E.A.L.
// dimension is actually a gap. Once even the weakest area is strong, we
// stop inventing homework and show "Dialed in".
const DIALED_IN_MIN = 7; // weakest dimension ≥ this ⇒ nothing to coach
type FocusState =
  | { kind: 'none' }
  | { kind: 'dialed' }
  | { kind: 'gap'; label: string; score: number; tone: 'red' | 'amber' };

function focusState(c: CoachingRadar): FocusState {
  if (c.scoredCalls === 0 || !c.focus) return { kind: 'none' };
  if (c.focus.avgScore >= DIALED_IN_MIN) return { kind: 'dialed' };
  return {
    kind: 'gap',
    label: c.focus.label,
    score: c.focus.avgScore,
    tone: c.focus.avgScore < 5 ? 'red' : 'amber',
  };
}
// The leading status dot in the roster mirrors the focus severity.
function dotColor(c: CoachingRadar): string {
  const f = focusState(c);
  if (f.kind === 'gap') return f.tone === 'red' ? '#E24B4A' : '#EF9F27';
  if (f.kind === 'dialed') return '#1D9E75';
  return '#C7C7C1';
}

// ── Triage thresholds (v1: period-over-period movement) ──────────────
const URGENT_MAX = -12; // deltaPct ≤ this ⇒ urgent
const WATCH_MAX = -4; //   URGENT_MAX < deltaPct ≤ this ⇒ watch

const PILL_TONE: Record<'red' | 'amber' | 'teal', string> = {
  red: 'bg-[#FCEBEB] text-[#A32D2D]',
  amber: 'bg-[#FAEEDA] text-[#854F0B]',
  teal: 'bg-[#E1F5EE] text-[#085041]',
};

const CARD = 'rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] bg-white';
const TILE = 'rounded-[10px] border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] bg-white p-3';

// ── Small presentational pieces ──────────────────────────────────────
function DeltaArrow({ delta, color }: { delta: number | null; color?: string }) {
  if (delta === null) return <span className="text-[#9aa0a6]">—</span>;
  const up = delta > 2;
  const down = delta < -2;
  const c = color ?? (up ? '#0F7A5A' : down ? '#C0392B' : '#9aa0a6');
  const glyph = up ? '▲' : down ? '▼' : '±';
  return (
    <span style={{ color: c }}>
      {glyph} {Math.abs(Math.round(delta))}%
    </span>
  );
}

function FocusPill({ c }: { c: CoachingRadar }) {
  const f = focusState(c);
  if (f.kind === 'none')
    return <span className="text-xs text-[#9aa0a6]">No calls scored</span>;
  if (f.kind === 'dialed')
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${PILL_TONE.teal}`}>
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Dialed in
      </span>
    );
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${PILL_TONE[f.tone]}`}>
      {f.label} {f.score.toFixed(1)}
    </span>
  );
}

function TriageCard({ m, tone }: { m: MemberRow; tone: 'red' | 'amber' }) {
  const dot = tone === 'red' ? '#E24B4A' : '#EF9F27';
  const txt = tone === 'red' ? '#C0392B' : '#946207';
  const f = focusState(m.coaching);
  return (
    <div className={`${TILE} !p-[9px_11px]`}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#1A1A1A]">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
          {m.name}
        </span>
        <span className="text-xs" style={{ color: txt }}>
          <DeltaArrow delta={m.deltaPct} color={txt} />
        </span>
      </div>
      {f.kind === 'gap' ? (
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${PILL_TONE[f.tone]}`}>
          {f.label} {f.score.toFixed(1)}/10
        </span>
      ) : (
        <span className="text-[11px] text-[#9aa0a6]">Coaching radar building</span>
      )}
      <p className="mt-1.5 text-[11px] text-[#5f6b6a]">
        Sales {Math.abs(Math.round(m.deltaPct ?? 0))}% below the prior period
      </p>
    </div>
  );
}

function RadarBar({ label, score }: { label: string; score: number }) {
  const color = score < 6 ? '#EF9F27' : '#1D9E75';
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="w-24 shrink-0 text-[11px] text-[#5f6b6a]">{label}</span>
      <span className="relative block h-2 flex-1 overflow-hidden rounded-full border border-[#1A1A1A] bg-[#EEEFEA]">
        <span className="absolute inset-y-0 left-0 block" style={{ width: `${Math.min(100, score * 10)}%`, background: color }} />
      </span>
      <span className="w-10 shrink-0 text-right text-[11px] font-medium text-[#1A1A1A]">{score.toFixed(1)}</span>
    </div>
  );
}

function MemberDetail({ m }: { m: MemberRow }) {
  const contacts = Math.round(m.dials * (m.contactRate <= 1 ? m.contactRate : m.contactRate / 100));
  const sat = Math.round(m.booked * (m.showRate <= 1 ? m.showRate : m.showRate / 100));
  const funnel: Array<[string, number]> = [
    ['Dials', m.dials],
    ['Contacts', contacts],
    ['Booked', m.booked],
    ['Sat', sat],
    ['Sold', m.sales.count],
  ];
  const max = Math.max(1, m.dials);
  return (
    <div className="grid grid-cols-1 gap-5 p-3 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#5f6b6a]">Activity funnel</p>
        {funnel.map(([label, val]) => (
          <div key={label} className="mb-1.5 flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] text-[#5f6b6a]">{label}</span>
            <span className="relative block h-4 flex-1 overflow-hidden rounded border border-[#1A1A1A] bg-[#EEEFEA]">
              <span className="absolute inset-y-0 left-0 block bg-[#9FE1CB]" style={{ width: `${Math.max(6, Math.round((val / max) * 100))}%` }} />
            </span>
            <span className="w-9 shrink-0 text-right text-[11px] font-medium">{val}</span>
          </div>
        ))}
        <div className="mt-2 flex gap-3.5 text-xs text-[#5f6b6a]">
          <span>Sold APV <b className="font-medium text-[#005851]">{money(m.sales.apv)}</b></span>
          <span>Net placed <b className="font-medium text-[#005851]">{money(m.netPlacedApv)}</b></span>
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#5f6b6a]">Coaching radar</p>
        {m.coaching.scoredCalls === 0 ? (
          <p className="text-xs italic text-[#9aa0a6]">No scored calls in this coaching window.</p>
        ) : (
          <>
            {m.coaching.dimensions.map((d) => (
              <RadarBar key={d.key} label={d.label} score={d.avgScore} />
            ))}
            {m.coaching.topPriorities.length > 0 && (
              <>
                <p className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wide text-[#5f6b6a]">Recurring fixes</p>
                <ul className="list-disc pl-4 text-xs leading-relaxed text-[#1A1A1A]">
                  {m.coaching.topPriorities.map((p) => (
                    <li key={p.text}>
                      {p.text}
                      {p.count > 1 && <span className="text-[#9aa0a6]"> ×{p.count}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Table sorting ────────────────────────────────────────────────────
type SortKey = 'name' | 'dials' | 'contactRate' | 'bookRate' | 'showRate' | 'sales' | 'apv' | 'focus';
const COLUMNS: Array<{ key: SortKey; label: string; align: 'left' | 'right' }> = [
  { key: 'name', label: 'Agent', align: 'left' },
  { key: 'dials', label: 'Dials', align: 'right' },
  { key: 'contactRate', label: 'Contact', align: 'right' },
  { key: 'bookRate', label: 'Book', align: 'right' },
  { key: 'showRate', label: 'Show', align: 'right' },
  { key: 'sales', label: 'Sales', align: 'right' },
  { key: 'apv', label: 'Sold APV', align: 'right' },
  { key: 'focus', label: 'Coaching focus', align: 'right' },
];
function sortVal(m: MemberRow, k: SortKey): number | string {
  switch (k) {
    case 'name': return m.name.toLowerCase();
    case 'dials': return m.dials;
    case 'contactRate': return m.contactRate;
    case 'bookRate': return m.bookRate;
    case 'showRate': return m.showRate;
    case 'sales': return m.sales.count;
    case 'apv': return m.sales.apv;
    // Weakest-first when ascending; "dialed in"/no-focus sort to the bottom.
    case 'focus': return m.coaching.focus ? m.coaching.focus.avgScore : 99;
  }
}

function Tile({ label, value, sub, subTone }: { label: string; value: string; sub?: string; subTone?: 'up' | 'down' | 'muted' }) {
  const subColor = subTone === 'up' ? 'text-[#0F7A5A]' : subTone === 'down' ? 'text-[#C0392B]' : 'text-[#9aa0a6]';
  return (
    <div className={TILE}>
      <div className="text-xs text-[#6b7280]">{label}</div>
      <div className="text-[22px] font-semibold text-[#1A1A1A]">{value}</div>
      {sub && <div className={`text-[11px] ${subColor}`}>{sub}</div>}
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
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('sales');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [openUid, setOpenUid] = useState<string | null>(null);

  const profileLoaded = !!user && Object.keys(agentProfile).length > 0;
  const isOwner = agentProfile.isAgencyOwner === true;
  const inviteCode = agentProfile.inviteCode ?? generatedCode;

  // Fetch the team overview when owner / range / coaching window changes.
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
        if (res.status === 403) { setStatus('forbidden'); return; }
        if (!res.ok) { setStatus('error'); return; }
        const json = (await res.json()) as TeamOverview;
        if (cancelled) return;
        setData(json);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [profileLoaded, isOwner, user, range, coachingDays, reloadNonce]);

  // Ensure an invite code exists so the link box always renders.
  useEffect(() => {
    if (!profileLoaded || !isOwner || !user) return;
    if (agentProfile.inviteCode || generatedCode) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/agent-invite', { headers: { Authorization: `Bearer ${token}` } });
        if (cancelled || !res.ok) return;
        const json = (await res.json()) as { inviteCode?: string };
        if (cancelled || typeof json.inviteCode !== 'string') return;
        setGeneratedCode(json.inviteCode);
        void refreshProfile();
      } catch { /* non-fatal — link box stays hidden */ }
    })();
    return () => { cancelled = true; };
  }, [profileLoaded, isOwner, user, agentProfile.inviteCode, generatedCode, refreshProfile]);

  const inviteLink =
    typeof window !== 'undefined' && inviteCode ? `${window.location.origin}/signup?ref=${inviteCode}` : null;

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable — no-op */ }
  };

  const members = useMemo(() => data?.members ?? [], [data]);

  const { urgent, watch } = useMemo(() => {
    const withDelta = members.filter((m) => m.deltaPct !== null);
    const asc = [...withDelta].sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0));
    return {
      urgent: asc.filter((m) => (m.deltaPct ?? 0) <= URGENT_MAX).slice(0, 3),
      watch: asc.filter((m) => (m.deltaPct ?? 0) > URGENT_MAX && (m.deltaPct ?? 0) <= WATCH_MAX).slice(0, 3),
    };
  }, [members]);

  const standout = useMemo(() => {
    const sellers = members.filter((m) => m.sales.count > 0);
    if (sellers.length === 0) return null;
    const riser = [...sellers].sort((a, b) => (b.deltaPct ?? -Infinity) - (a.deltaPct ?? -Infinity))[0];
    if (riser.deltaPct !== null && riser.deltaPct > 2) return { m: riser, kind: 'riser' as const };
    const topSeller = [...sellers].sort((a, b) => b.sales.apv - a.sales.apv)[0];
    return { m: topSeller, kind: 'top' as const };
  }, [members]);

  const sortedMembers = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = members.filter((m) => m.name.toLowerCase().includes(query));
    return list.sort((a, b) => {
      const x = sortVal(a, sortKey);
      const y = sortVal(b, sortKey);
      if (x < y) return -1 * sortDir;
      if (x > y) return 1 * sortDir;
      return 0;
    });
  }, [members, q, sortKey, sortDir]);

  const clickSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(k === 'name' ? 1 : -1); }
  };

  // Hold a spinner until the profile resolves so the gate doesn't flash.
  if (!profileLoaded) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <ScoringInfinity className="w-24 h-12" />
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
          <h1 className="text-2xl font-bold text-[#005851]">My team</h1>
          <p className="text-sm text-[#5f6b6a]">
            {data ? `${data.memberCount} ${data.memberCount === 1 ? 'agent' : 'agents'} · ` : ''}
            who&apos;s winning, and who to coach this week
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as ActivityRange)}
            className="rounded-[8px] border-2 border-[#1A1A1A] bg-white px-3 py-1.5 text-sm font-semibold text-[#1A1A1A]"
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>{RANGE_LABELS[r]}</option>
            ))}
          </select>
          <div className="inline-flex rounded-full border-2 border-[#1A1A1A] bg-white p-0.5">
            {([14, 28] as const).map((d) => (
              <button
                key={d}
                onClick={() => setCoachingDays(d)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  coachingDays === d ? 'bg-[#005851] text-white' : 'text-[#5f6b6a]'
                }`}
              >
                {d === 14 ? '2 wks' : '4 wks'} coaching
              </button>
            ))}
          </div>
        </div>
      </div>

      {inviteLink && (
        <div className={`mb-5 flex flex-col gap-2 ${CARD} p-4 sm:flex-row sm:items-center sm:justify-between`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#005851]">Your agency invite link</p>
            <p className="mt-0.5 break-all text-sm text-[#374151]">{inviteLink}</p>
          </div>
          <button
            onClick={copyInvite}
            className="shrink-0 rounded-[8px] border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] bg-[#44bbaa] px-4 py-2 text-sm font-semibold text-white"
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex min-h-[30vh] items-center justify-center">
          <ScoringInfinity className="w-24 h-12" />
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-[8px] border-2 border-[#C0392B] bg-[#FEF2F2] p-4">
          <p className="text-sm text-[#B91C1C]">Couldn&apos;t load your team right now.</p>
          <button onClick={() => setReloadNonce((n) => n + 1)} className="mt-2 text-sm font-semibold text-[#B91C1C] underline">
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <Tile label="Agents" value={String(data.memberCount)} />
            <Tile label="Team sales" value={String(data.agency.totalSales)} />
            <Tile label="Sold APV" value={money(data.agency.totalSalesApv)} />
            <Tile label="Pipeline" value={String(data.agency.totalBooked)} sub="appts booked" subTone="muted" />
            <Tile label="Avg show" value={`${pctInt(data.agency.avgShowRate)}%`} />
          </div>

          <div className={`mb-4 ${CARD} p-4`}>
            <div className="mb-0.5 flex items-center gap-1.5">
              <svg className="h-4 w-4 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 21h6M10 21v-3m4 3v-3M12 3a6 6 0 00-3.6 10.8c.6.45.9.9.9 1.7v.5h5.4v-.5c0-.8.3-1.25.9-1.7A6 6 0 0012 3z" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wide text-[#5f6b6a]">Coaching intelligence</span>
            </div>
            <p className="mb-3 text-[11px] text-[#9aa0a6]">
              Agents whose sales dropped most vs. the prior period — call these first.
            </p>

            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[#E24B4A]" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#C0392B]">Urgent</span>
            </div>
            {urgent.length === 0 ? (
              <p className="mb-3.5 text-xs text-[#9aa0a6]">No agents in a sharp decline this period. 🎉</p>
            ) : (
              <div className="mb-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {urgent.map((m) => <TriageCard key={m.uid} m={m} tone="red" />)}
              </div>
            )}

            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[#EF9F27]" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#946207]">Watch</span>
            </div>
            {watch.length === 0 ? (
              <p className="text-xs text-[#9aa0a6]">Nobody slipping quietly right now.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {watch.map((m) => <TriageCard key={m.uid} m={m} tone="amber" />)}
              </div>
            )}
          </div>

          {standout && (
            <div className={`mb-3 flex items-center gap-3 ${CARD} bg-[#EAF6F1] p-3`}>
              <svg className="h-5 w-5 shrink-0 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9a3 3 0 106 0M7 21h10M12 17v4M5 4h14v3a7 7 0 01-14 0V4z" />
              </svg>
              <p className="text-[12.5px] text-[#0e4f45]">
                <b className="font-semibold text-[#005851]">{standout.m.name}</b>{' '}
                {standout.kind === 'riser' ? (
                  <>is on a tear — {standout.m.sales.count} sales, {money(standout.m.sales.apv)} APV,{' '}
                    <span className="text-[#0F7A5A]">▲{Math.round(standout.m.deltaPct ?? 0)}%</span> vs the prior period. Give them a shout-out.</>
                ) : (
                  <>leads the team — {standout.m.sales.count} sales, {money(standout.m.sales.apv)} APV this period. Give them a shout-out.</>
                )}
              </p>
            </div>
          )}

          <div className="mb-2.5 flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search agents"
              className="w-full max-w-[240px] rounded-[8px] border-2 border-[#1A1A1A] bg-white px-3 py-1.5 text-sm text-[#1A1A1A] placeholder-[#9aa0a6] focus:outline-none"
            />
            <span className="ml-auto text-[11px] text-[#9aa0a6]">Tap a column to rank · tap a row to expand</span>
          </div>

          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="border-b-2 border-[#1A1A1A]">
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => clickSort(col.key)}
                        className={`cursor-pointer select-none whitespace-nowrap px-2.5 py-2.5 font-medium ${
                          col.align === 'right' ? 'text-right' : 'text-left'
                        } ${sortKey === col.key ? 'text-[#005851]' : 'text-[#6b7280]'}`}
                      >
                        {col.label}
                        {sortKey === col.key && <span> {sortDir === -1 ? '▾' : '▴'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((m, idx) => {
                    const isOpen = openUid === m.uid;
                    return (
                      <Fragment key={m.uid}>
                        <tr
                          onClick={() => setOpenUid(isOpen ? null : m.uid)}
                          className={`cursor-pointer border-b border-[#E7E7E1] ${isOpen ? 'bg-[#EAF6F1]' : 'hover:bg-[#F7F8F3]'}`}
                        >
                          <td className="px-2.5 py-2.5">
                            <span className="mr-1 inline-block min-w-[15px] text-[11px] text-[#9aa0a6]">{idx + 1}</span>
                            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: dotColor(m.coaching) }} />
                            {m.name}
                            {idx === 0 && (
                              <svg className="ml-1 inline-block h-3.5 w-3.5 align-middle text-[#BA7517]" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm0 2h14v2H5v-2z" />
                              </svg>
                            )}
                          </td>
                          <td className="px-2.5 py-2.5 text-right">{m.dials}</td>
                          <td className="px-2.5 py-2.5 text-right">{pctInt(m.contactRate)}%</td>
                          <td className="px-2.5 py-2.5 text-right">{pctInt(m.bookRate)}%</td>
                          <td className="px-2.5 py-2.5 text-right">{pctInt(m.showRate)}%</td>
                          <td className="px-2.5 py-2.5 text-right">
                            {m.sales.count}
                            {m.deltaPct !== null && m.deltaPct > 2 && <span className="ml-1 text-[10px] text-[#0F7A5A]">▲</span>}
                            {m.deltaPct !== null && m.deltaPct < -2 && <span className="ml-1 text-[10px] text-[#C0392B]">▼</span>}
                          </td>
                          <td className="px-2.5 py-2.5 text-right">{money(m.sales.apv)}</td>
                          <td className="px-2.5 py-2.5 text-right"><FocusPill c={m.coaching} /></td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={COLUMNS.length} className="border-y-2 border-[#1A1A1A] bg-[#F7F8F3]">
                              <MemberDetail m={m} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sortedMembers.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-[#5f6b6a]">
                {members.length === 0
                  ? 'No agents on your team yet. Share your invite link above, or ask support to attach an existing agent to your team.'
                  : 'No agents match your search.'}
              </div>
            )}
          </div>

          {data.truncated && (
            <p className="mt-2 text-xs text-[#9aa0a6]">Showing the first {data.members.length} agents.</p>
          )}
        </>
      )}
    </div>
  );
}
