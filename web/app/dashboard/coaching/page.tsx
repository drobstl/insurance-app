'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';
import { performanceAccess } from '../../../lib/tier-gating';
import UpgradeToProCard from '../../../components/UpgradeToProCard';

interface RealCategory {
  key: string;
  letter: string;
  label: string;
  score: number;
  whatWorked: string;
  whatToImprove: string;
  highlight: string | null;
}
interface Checkpoint {
  name: string;
  status: 'hit' | 'partial' | 'missed';
  note: string;
}
interface CoachingPriority {
  priority: string;
  why: string;
  action: string;
}
interface Report {
  clientName: string | null;
  callType: string;
  productLine: string;
  outcome: string;
  verdict: string;
  overallScore: number;
  real: RealCategory[];
  checkpoints: Checkpoint[];
  checkpointHits: number;
  coachingPriorities: CoachingPriority[];
  usingDefaultPlaybook: boolean;
}
interface Meter {
  level: 'unlimited' | 'metered' | 'locked';
  monthlyLimit?: number;
  used?: number;
  remaining?: number;
}
interface SavedScore {
  id: string;
  createdAtMs: number;
  report: Report;
}

function scoreTone(s: number): string {
  if (s >= 8.5) return 'text-[#005851]';
  if (s >= 6.5) return 'text-[#0D4D4D]';
  if (s >= 5) return 'text-amber-700';
  return 'text-red-600';
}
function barTone(s: number): string {
  if (s >= 8.5) return 'bg-[#005851]';
  if (s >= 6.5) return 'bg-[#44bbaa]';
  if (s >= 5) return 'bg-amber-500';
  return 'bg-red-400';
}

const CHECKPOINT_STYLE: Record<Checkpoint['status'], { icon: string; cls: string; label: string }> = {
  hit: { icon: '✓', cls: 'text-[#005851]', label: 'Hit' },
  partial: { icon: '◐', cls: 'text-amber-600', label: 'Partial' },
  missed: { icon: '✕', cls: 'text-[#9CA3AF]', label: 'Missed' },
};

function formatDate(ms: number): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

// A label for a saved call: the client's name if the model inferred one,
// else the call type, else a neutral fallback.
function callLabel(r: Report): string {
  return r.clientName || r.callType || 'Scored call';
}

// Lightweight inline sparkline of overall score (0–10) over time. Scales
// uniformly to its container width; renders nothing with fewer than 2 points.
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 240;
  const h = 40;
  const pad = 4;
  const stepX = (w - pad * 2) / (values.length - 1);
  const yOf = (v: number) => pad + (1 - Math.max(0, Math.min(10, v)) / 10) * (h - pad * 2);
  const points = values.map((v, i) => `${(pad + i * stepX).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const lastX = pad + (values.length - 1) * stepX;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full" role="img" aria-label="Overall score over time">
      <polyline points={points} fill="none" stroke="#005851" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX.toFixed(1)} cy={yOf(values[values.length - 1]).toFixed(1)} r="3.5" fill="#005851" />
    </svg>
  );
}

// Outcome buckets for the win/stall correlation. "Moved forward" = the call
// produced a commitment (in this business, starting the application IS the
// close); "stalled" = the prospect didn't commit. Callback Scheduled and
// Unknown are deliberately excluded — neither a clear win nor a clear loss.
const WON_OUTCOMES = ['Sale Closed', 'Application Started'];
const STALLED_OUTCOMES = ['Think About It', 'Spouse Objection', 'Hard No', 'No-Show'];

export default function CoachingPage() {
  const { user, agentProfile, loading } = useDashboard();
  const access = performanceAccess(agentProfile.membershipTier, user?.email, agentProfile.trialEndsAt);

  const [meter, setMeter] = useState<Meter | null>(null);
  const [transcript, setTranscript] = useState('');
  const [scoring, setScoring] = useState(false);
  const [result, setResult] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Scored-call history + trend (loaded from the API, prepended on each score).
  // `viewingSaved` distinguishes a re-opened past call from a fresh score so the
  // back button reads correctly and we don't clear the transcript box.
  const [history, setHistory] = useState<SavedScore[]>([]);
  const [viewingSaved, setViewingSaved] = useState(false);

  // Per-agent playbook editor
  const [playbook, setPlaybook] = useState('');
  const [scriptOpen, setScriptOpen] = useState(false);
  const [savingScript, setSavingScript] = useState(false);

  useEffect(() => {
    if (!user || access.level === 'locked') return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/coaching/score', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setMeter(data.meter ?? null);
            if (Array.isArray(data.scores)) setHistory(data.scores as SavedScore[]);
          }
        }
      } catch {
        /* meter is a nicety */
      }
      try {
        const snap = await getDoc(doc(db, 'agents', user.uid));
        const pb = snap.exists() ? snap.data()?.coachingPlaybook : '';
        if (!cancelled && typeof pb === 'string') setPlaybook(pb);
      } catch {
        /* editor falls back to empty → default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, access.level]);

  const usingDefaultScript = playbook.trim().length === 0;
  const exhausted = meter?.level === 'metered' && (meter.remaining ?? 0) <= 0;

  const saveScript = useCallback(async () => {
    if (!user) return;
    setSavingScript(true);
    try {
      await setDoc(doc(db, 'agents', user.uid), { coachingPlaybook: playbook.trim() }, { merge: true });
      setScriptOpen(false);
    } catch {
      /* leave panel open on failure */
    } finally {
      setSavingScript(false);
    }
  }, [user, playbook]);

  const handleScore = useCallback(async () => {
    if (!user || scoring) return;
    setScoring(true);
    setError(null);
    setResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/coaching/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult(data.result);
        setViewingSaved(false);
        if (data.meter) setMeter(data.meter);
        if (data.saved?.id) {
          setHistory((h) => [
            { id: data.saved.id, createdAtMs: data.saved.createdAtMs ?? Date.now(), report: data.result },
            ...h,
          ]);
        }
      } else if (res.status === 402) {
        setMeter(data.meter ?? meter);
        setError('limit_reached');
      } else if (data.error === 'transcript_too_short') {
        setError('too_short');
      } else {
        setError('failed');
      }
    } catch {
      setError('failed');
    } finally {
      setScoring(false);
    }
  }, [user, scoring, transcript, meter]);

  // Re-open a past scored call. Reads from local state — no re-score, no
  // network call, no metered credit spent.
  const openSaved = useCallback((s: SavedScore) => {
    setResult(s.report);
    setViewingSaved(true);
    setError(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (loading) return <div className="px-4 py-10 text-center text-[#707070]">Loading…</div>;
  if (access.level === 'locked') return <UpgradeToProCard surface="coaching" />;

  // Derived trend (history is newest-first from the API).
  const chrono = [...history].reverse(); // oldest → newest for the trend line
  const overallSeries = chrono.map((s) => s.report.overallScore);
  const overallAvg = history.length
    ? Math.round((history.reduce((a, s) => a + s.report.overallScore, 0) / history.length) * 10) / 10
    : 0;
  const dimAverages = (history[0]?.report.real ?? []).map((cat, idx) => {
    const vals = history
      .map((s) => s.report.real[idx]?.score)
      .filter((v): v is number => typeof v === 'number');
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { key: cat.key, letter: cat.letter, label: cat.label, avg: Math.round(avg * 10) / 10 };
  });

  // Win/stall correlation: split the agent's own calls by outcome and compare
  // R.E.A.L. averages, so they see which dimension actually separates wins from
  // stalls. Computed from stored outcomes — no new data, no client/APV link.
  const wonCalls = history.filter((s) => WON_OUTCOMES.includes(s.report.outcome));
  const stalledCalls = history.filter((s) => STALLED_OUTCOMES.includes(s.report.outcome));
  const showOutcomeSplit = wonCalls.length >= 1 && stalledCalls.length >= 1 && history.length >= 3;
  const avgLetter = (list: SavedScore[], idx: number) => {
    const vals = list.map((s) => s.report.real[idx]?.score).filter((v): v is number => typeof v === 'number');
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
  };
  const outcomeRows = (history[0]?.report.real ?? []).map((cat, idx) => {
    const won = avgLetter(wonCalls, idx);
    const stalled = avgLetter(stalledCalls, idx);
    return { key: cat.key, letter: cat.letter, label: cat.label, won, stalled, gap: Math.round((won - stalled) * 10) / 10 };
  });
  const leverageRow = outcomeRows.reduce<(typeof outcomeRows)[number] | null>(
    (best, r) => (r.gap > (best?.gap ?? -Infinity) ? r : best),
    null,
  );
  const hasLeverage = !!leverageRow && leverageRow.gap >= 0.3;
  const smallSample = wonCalls.length < 3 || stalledCalls.length < 3;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#005851]">Coaching</h1>
          <p className="mt-1 text-sm text-[#707070]">
            Paste a call — get scored on the R.E.A.L. framework against your own script.
          </p>
        </div>
        {meter?.level === 'metered' && (
          <span
            className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${
              exhausted ? 'bg-amber-50 text-amber-800' : 'bg-[#daf3f0] text-[#005851]'
            }`}
          >
            {exhausted ? 'No scores left this month' : `${meter.remaining} of ${meter.monthlyLimit} left this month`}
          </span>
        )}
      </div>

      {/* Script panel */}
      <div className="mt-4 rounded-[10px] border border-[#d0d0d0] bg-white">
        <button
          onClick={() => setScriptOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="text-sm text-[#374151]">
            Scoring against:{' '}
            <span className="font-semibold text-[#0D4D4D]">
              {usingDefaultScript ? 'AFL default R.E.A.L. script' : 'your script'}
            </span>
          </span>
          <span className="text-xs font-semibold text-[#005851]">{scriptOpen ? 'Close' : 'Edit'}</span>
        </button>
        {scriptOpen && (
          <div className="px-4 pb-4 border-t border-[#eee] pt-3">
            <p className="text-xs text-[#707070]">
              Paste your own sales script / playbook. Coaching grounds the checkpoint scoring in this. Leave it blank to
              use the AFL default R.E.A.L. mortgage-protection script.
            </p>
            <textarea
              value={playbook}
              onChange={(e) => setPlaybook(e.target.value)}
              rows={8}
              placeholder="Paste your sales script here…"
              className="mt-2 w-full rounded-[5px] border border-[#d0d0d0] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#44bbaa] resize-y"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={saveScript}
                disabled={savingScript}
                className="px-4 py-2 rounded-[5px] bg-[#005851] text-white text-sm font-semibold hover:bg-[#0D4D4D] disabled:opacity-40 transition-colors"
              >
                {savingScript ? 'Saving…' : 'Save script'}
              </button>
              {!usingDefaultScript && (
                <button
                  onClick={() => setPlaybook('')}
                  className="text-xs font-semibold text-[#707070] hover:text-[#0D4D4D]"
                >
                  Clear (use AFL default)
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input or exhausted nudge */}
      {exhausted ? (
        <div className="mt-4 rounded-[10px] border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-[#0D4D4D] font-semibold">You&apos;ve used all {meter?.monthlyLimit} call scores this month.</p>
          <p className="mt-1 text-sm text-[#707070]">Pro includes unlimited call coaching — score every call while it&apos;s fresh.</p>
          <Link
            href="/pricing"
            className="mt-4 inline-flex items-center px-5 py-2.5 rounded-[5px] bg-[#005851] text-white text-sm font-semibold hover:bg-[#0D4D4D] transition-colors"
          >
            Upgrade to Pro
          </Link>
        </div>
      ) : (
        <div className="mt-4 rounded-[10px] border border-[#d0d0d0] bg-white p-4 sm:p-5">
          <label htmlFor="transcript" className="block text-sm font-semibold text-[#0D4D4D]">Call transcript</label>
          <textarea
            id="transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste the transcript of a sales call. Prefix lines with 'Agent:' / 'Client:' if you have them — otherwise paste it as-is."
            rows={9}
            className="mt-2 w-full rounded-[5px] border border-[#d0d0d0] p-3 text-sm placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#44bbaa] resize-y"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-[#9CA3AF]">
              {transcript.trim().length > 0 ? `${transcript.trim().length.toLocaleString()} characters` : 'Your transcript stays private to you.'}
            </span>
            <button
              onClick={handleScore}
              disabled={scoring || transcript.trim().length < 40}
              className="inline-flex items-center px-5 py-2.5 rounded-[5px] bg-[#005851] text-white text-sm font-semibold hover:bg-[#0D4D4D] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {scoring ? 'Scoring…' : 'Score this call'}
            </button>
          </div>
          {scoring && <p className="mt-2 text-xs text-[#9CA3AF]">Reading the whole call and scoring it against your script — this usually takes 30–60 seconds.</p>}
          {error === 'too_short' && <p className="mt-2 text-xs text-amber-700">That&apos;s a bit short to score — paste a little more of the call.</p>}
          {error === 'failed' && <p className="mt-2 text-xs text-red-600">Something went wrong scoring that call. Give it another try.</p>}
          {error === 'limit_reached' && (
            <p className="mt-2 text-xs text-amber-700">
              You&apos;ve hit your monthly limit. <Link href="/pricing" className="underline font-semibold">Upgrade to Pro</Link> for unlimited coaching.
            </p>
          )}
        </div>
      )}

      {/* Progress + history — your scored calls over time */}
      {!result && history.length > 0 && (
        <div className="mt-6 space-y-4">
          {/* Trend */}
          <div className="rounded-[10px] border border-[#d0d0d0] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#005851]">Your progress</h2>
              <span className="text-xs text-[#707070]">{history.length} {history.length === 1 ? 'call' : 'calls'} scored</span>
            </div>
            <div className="mt-3 flex items-end gap-4">
              <div className="shrink-0">
                <div className={`text-3xl font-bold tabular-nums leading-none ${scoreTone(overallAvg)}`}>{overallAvg}</div>
                <div className="mt-0.5 text-[11px] text-[#707070]">avg overall</div>
              </div>
              {overallSeries.length >= 2 && (
                <div className="flex-1 min-w-0">
                  <Sparkline values={overallSeries} />
                  <div className="mt-1 flex justify-between text-[10px] text-[#9CA3AF]">
                    <span>oldest</span>
                    <span>latest</span>
                  </div>
                </div>
              )}
            </div>
            {dimAverages.length > 0 && (
              <div className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {dimAverages.map((d) => (
                  <div key={d.key} className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#daf3f0] text-[#005851] text-[11px] font-bold flex items-center justify-center shrink-0">{d.letter}</span>
                    <span className="text-xs text-[#374151] w-24 shrink-0">{d.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-[#f1f1f1] overflow-hidden">
                      <div className={`h-full ${barTone(d.avg)} rounded-full`} style={{ width: `${d.avg * 10}%` }} />
                    </div>
                    <span className={`text-xs font-bold tabular-nums w-7 text-right ${scoreTone(d.avg)}`}>{d.avg}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-[#9CA3AF]">Averages across your scored calls. Your weakest letter is where coaching pays off fastest.</p>
          </div>

          {/* What separates your wins — outcome correlation */}
          {showOutcomeSplit && (
            <div className="rounded-[10px] border border-[#cdeee7] bg-[#f0faf8] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#005851]">What separates your wins</h2>
                <span className="text-xs text-[#707070]">{wonCalls.length} moved forward · {stalledCalls.length} stalled</span>
              </div>
              {hasLeverage && leverageRow ? (
                <p className="mt-2 text-sm text-[#0D4D4D]">
                  Your biggest edge on calls that moved forward is <span className="font-semibold">{leverageRow.label}</span> —{' '}
                  <span className="font-semibold tabular-nums">{leverageRow.won}</span> on wins vs{' '}
                  <span className="font-semibold tabular-nums">{leverageRow.stalled}</span> on stalls. That gap is your highest-leverage fix.
                </p>
              ) : (
                <p className="mt-2 text-sm text-[#707070]">Your scores look similar across outcomes so far — score a few more calls and the pattern that separates your wins will surface here.</p>
              )}
              <div className="mt-3 grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1.5 items-center text-xs">
                <span aria-hidden />
                <span className="text-[10px] uppercase tracking-wide text-[#9CA3AF] text-right">Won</span>
                <span className="text-[10px] uppercase tracking-wide text-[#9CA3AF] text-right">Stalled</span>
                <span className="text-[10px] uppercase tracking-wide text-[#9CA3AF] text-right">Gap</span>
                {outcomeRows.map((r) => {
                  const isLeverage = hasLeverage && leverageRow?.key === r.key;
                  return (
                    <Fragment key={r.key}>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-[#daf3f0] text-[#005851] text-[11px] font-bold flex items-center justify-center shrink-0">{r.letter}</span>
                        <span className={`truncate ${isLeverage ? 'font-semibold text-[#005851]' : 'text-[#374151]'}`}>{r.label}</span>
                      </span>
                      <span className={`tabular-nums font-semibold text-right ${scoreTone(r.won)}`}>{r.won}</span>
                      <span className="tabular-nums font-semibold text-right text-amber-700">{r.stalled}</span>
                      <span className={`tabular-nums font-bold text-right ${r.gap > 0 ? 'text-[#005851]' : 'text-[#9CA3AF]'}`}>{r.gap > 0 ? '+' : ''}{r.gap}</span>
                    </Fragment>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-[#9CA3AF]">
                {smallSample ? 'Based on a small sample — this sharpens as you score more calls. ' : ''}Win = the call moved forward (sale or application started). Calls awaiting a callback aren&apos;t counted either way.
              </p>
            </div>
          )}

          {/* History list */}
          <div className="rounded-[10px] border border-[#d0d0d0] bg-white p-4 sm:p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#005851]">Your calls</h2>
            <ul className="mt-2 divide-y divide-[#f1f1f1]">
              {history.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => openSaved(s)}
                    className="w-full flex items-center gap-3 py-2.5 -mx-2 px-2 rounded text-left hover:bg-[#f7fbfa] transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#1a1a1a] truncate">{callLabel(s.report)}</p>
                      <p className="text-xs text-[#707070] truncate">
                        {formatDate(s.createdAtMs)}
                        {s.report.productLine ? ` · ${s.report.productLine}` : ''}
                        {s.report.outcome ? ` · ${s.report.outcome}` : ''}
                      </p>
                    </div>
                    <span className={`text-base font-bold tabular-nums shrink-0 ${scoreTone(s.report.overallScore)}`}>{s.report.overallScore}</span>
                    <span className="text-[#cbd5e1] shrink-0" aria-hidden>›</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Report */}
      {result && (
        <div className="mt-6 space-y-4">
          {/* Verdict + summary */}
          <div className="rounded-[10px] border border-[#cdeee7] bg-[#f0faf8] p-5 flex items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5">
                {[result.callType, result.productLine, result.outcome].filter(Boolean).map((chip, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-0.5 rounded bg-white/70 text-[#0D4D4D] text-[11px] font-semibold border border-[#cdeee7]">
                    {chip}
                  </span>
                ))}
              </div>
              {result.verdict && <p className="mt-2 text-sm text-[#0D4D4D] font-medium">{result.verdict}</p>}
            </div>
            <div className="text-center shrink-0">
              <div className={`text-4xl font-bold tabular-nums leading-none ${scoreTone(result.overallScore)}`}>{result.overallScore}</div>
              <div className="mt-0.5 text-[11px] text-[#707070]">/ 10</div>
            </div>
          </div>

          {/* R.E.A.L. cards */}
          <div className="grid sm:grid-cols-2 gap-3">
            {result.real.map((c) => (
              <div key={c.key} className="rounded-[10px] border border-[#d0d0d0] bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#daf3f0] text-[#005851] text-xs font-bold flex items-center justify-center shrink-0">{c.letter}</span>
                  <span className="text-sm font-semibold text-[#0D4D4D] flex-1">{c.label}</span>
                  <span className={`text-sm font-bold tabular-nums ${scoreTone(c.score)}`}>{c.score}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-[#f1f1f1] overflow-hidden">
                  <div className={`h-full ${barTone(c.score)} rounded-full transition-all duration-500`} style={{ width: `${c.score * 10}%` }} />
                </div>
                {c.whatWorked && (
                  <p className="mt-3 text-xs text-[#374151]"><span className="text-[#005851] font-semibold">✓ </span>{c.whatWorked}</p>
                )}
                {c.whatToImprove && (
                  <p className="mt-1.5 text-xs text-[#374151]"><span className="text-amber-700 font-semibold">→ </span>{c.whatToImprove}</p>
                )}
                {c.highlight && <p className="mt-2 text-[11px] italic text-[#9CA3AF] border-l-2 border-[#e5e7eb] pl-2">&ldquo;{c.highlight}&rdquo;</p>}
              </div>
            ))}
          </div>

          {/* Checkpoints */}
          {result.checkpoints.length > 0 && (
            <div className="rounded-[10px] border border-[#d0d0d0] bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#005851]">Your script checkpoints</h3>
                <span className="text-xs text-[#707070]">{result.checkpointHits} of {result.checkpoints.length} hit</span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {result.checkpoints.map((cp, i) => {
                  const s = CHECKPOINT_STYLE[cp.status];
                  return (
                    <li key={i} className="flex gap-2 text-sm text-[#374151]">
                      <span className={`shrink-0 font-bold ${s.cls}`} aria-label={s.label}>{s.icon}</span>
                      <span className="flex-1"><span className="font-medium">{cp.name}</span>{cp.note && <span className="block text-xs text-[#707070]">{cp.note}</span>}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Coaching priorities */}
          {result.coachingPriorities.length > 0 && (
            <div className="rounded-[10px] border border-[#d0d0d0] bg-white p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#005851]">Top 3 to work on next</h3>
              <ol className="mt-2 space-y-3">
                {result.coachingPriorities.map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#005851] text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-[#1a1a1a]">{p.priority}</p>
                      {p.why && <p className="text-xs text-[#707070] mt-0.5">{p.why}</p>}
                      {p.action && <p className="text-xs text-[#0D4D4D] mt-1"><span className="font-semibold">Try: </span>{p.action}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <button
            onClick={() => {
              setResult(null);
              if (!viewingSaved) setTranscript('');
              setViewingSaved(false);
              setError(null);
            }}
            className="text-sm font-semibold text-[#005851] hover:text-[#0D4D4D]"
          >
            ← {viewingSaved ? 'Back to your calls' : 'Score another call'}
          </button>
        </div>
      )}
    </div>
  );
}
