'use client';

import { useCallback, useEffect, useState } from 'react';
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

export default function CoachingPage() {
  const { user, agentProfile, loading } = useDashboard();
  const access = performanceAccess(agentProfile.membershipTier, user?.email, agentProfile.trialEndsAt);

  const [meter, setMeter] = useState<Meter | null>(null);
  const [transcript, setTranscript] = useState('');
  const [scoring, setScoring] = useState(false);
  const [result, setResult] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          if (!cancelled) setMeter(data.meter ?? null);
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
        if (data.meter) setMeter(data.meter);
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

  if (loading) return <div className="px-4 py-10 text-center text-[#707070]">Loading…</div>;
  if (access.level === 'locked') return <UpgradeToProCard surface="coaching" />;

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
          {error === 'too_short' && <p className="mt-2 text-xs text-amber-700">That&apos;s a bit short to score — paste a little more of the call.</p>}
          {error === 'failed' && <p className="mt-2 text-xs text-red-600">Something went wrong scoring that call. Give it another try.</p>}
          {error === 'limit_reached' && (
            <p className="mt-2 text-xs text-amber-700">
              You&apos;ve hit your monthly limit. <Link href="/pricing" className="underline font-semibold">Upgrade to Pro</Link> for unlimited coaching.
            </p>
          )}
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
            onClick={() => { setResult(null); setTranscript(''); setError(null); }}
            className="text-sm font-semibold text-[#005851] hover:text-[#0D4D4D]"
          >
            ← Score another call
          </button>
        </div>
      )}
    </div>
  );
}
