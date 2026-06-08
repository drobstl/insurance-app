'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard } from '../DashboardContext';
import { performanceAccess } from '../../../lib/tier-gating';
import UpgradeToProCard from '../../../components/UpgradeToProCard';

interface ScoreResult {
  overallScore: number;
  grade: string;
  summary: string;
  dimensions: Array<{ name: string; score: number }>;
  strengths: string[];
  improvements: Array<{ point: string; why: string }>;
  suggestedLine: string;
}

interface Meter {
  level: 'unlimited' | 'metered' | 'locked';
  monthlyLimit?: number;
  used?: number;
  remaining?: number;
}

function scoreTone(score: number): string {
  if (score >= 85) return 'text-[#005851]';
  if (score >= 65) return 'text-[#0D4D4D]';
  if (score >= 50) return 'text-amber-700';
  return 'text-red-600';
}
function barTone(score: number): string {
  if (score >= 85) return 'bg-[#005851]';
  if (score >= 65) return 'bg-[#44bbaa]';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-400';
}

export default function CoachingPage() {
  const { user, agentProfile, loading } = useDashboard();
  const access = performanceAccess(
    agentProfile.membershipTier,
    user?.email,
    agentProfile.trialEndsAt,
  );

  const [meter, setMeter] = useState<Meter | null>(null);
  const [transcript, setTranscript] = useState('');
  const [scoring, setScoring] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pull the live meter on load (server is the source of truth for usage).
  useEffect(() => {
    if (!user || access.level === 'locked') return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/coaching/score', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMeter(data.meter ?? null);
      } catch {
        /* meter is a nicety; ignore fetch errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, access.level]);

  const exhausted =
    meter?.level === 'metered' && (meter.remaining ?? 0) <= 0;

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

  if (loading) {
    return <div className="px-4 py-10 text-center text-[#707070]">Loading…</div>;
  }

  // Free / unknown tier → locked. Mirror the Leads/Activity guard exactly.
  if (access.level === 'locked') {
    return <UpgradeToProCard surface="coaching" />;
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#005851]">Coaching</h1>
          <p className="mt-1 text-sm text-[#707070]">
            Paste a call transcript — get a score and a couple of things to tweak.
          </p>
        </div>
        {meter?.level === 'metered' && (
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
              exhausted ? 'bg-amber-50 text-amber-800' : 'bg-[#daf3f0] text-[#005851]'
            }`}
          >
            {exhausted
              ? 'No scores left this month'
              : `${meter.remaining} of ${meter.monthlyLimit} left this month`}
          </span>
        )}
      </div>

      {/* Metered, exhausted → upgrade nudge in place of the input */}
      {exhausted ? (
        <div className="mt-6 rounded-[10px] border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-[#0D4D4D] font-semibold">You&apos;ve used all {meter?.monthlyLimit} call scores this month.</p>
          <p className="mt-1 text-sm text-[#707070]">
            Pro includes unlimited call coaching — score every call while it&apos;s fresh.
          </p>
          <Link
            href="/pricing"
            className="mt-4 inline-flex items-center justify-center px-5 py-2.5 rounded-[5px] bg-[#005851] text-white text-sm font-semibold hover:bg-[#0D4D4D] transition-colors"
          >
            Upgrade to Pro
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-[10px] border border-[#d0d0d0] bg-white p-4 sm:p-5">
          <label htmlFor="transcript" className="block text-sm font-semibold text-[#0D4D4D]">
            Call transcript
          </label>
          <textarea
            id="transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste the transcript of a sales call here. Anything works — your notes, a Zoom/phone transcript, or a rough recap from memory."
            rows={9}
            className="mt-2 w-full rounded-[5px] border border-[#d0d0d0] p-3 text-sm text-[#1a1a1a] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#44bbaa] resize-y"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-[#9CA3AF]">
              {transcript.trim().length > 0 ? `${transcript.trim().length.toLocaleString()} characters` : 'Your transcript stays private to you.'}
            </span>
            <button
              onClick={handleScore}
              disabled={scoring || transcript.trim().length < 40}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[5px] bg-[#005851] text-white text-sm font-semibold hover:bg-[#0D4D4D] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {scoring ? 'Scoring…' : 'Score this call'}
            </button>
          </div>
          {error === 'too_short' && (
            <p className="mt-2 text-xs text-amber-700">That&apos;s a bit short to score — paste a little more of the call.</p>
          )}
          {error === 'failed' && (
            <p className="mt-2 text-xs text-red-600">Something went wrong scoring that call. Give it another try.</p>
          )}
          {error === 'limit_reached' && (
            <p className="mt-2 text-xs text-amber-700">
              You&apos;ve hit your monthly limit.{' '}
              <Link href="/pricing" className="underline font-semibold">Upgrade to Pro</Link> for unlimited coaching.
            </p>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-6 rounded-[10px] border border-[#d0d0d0] bg-white overflow-hidden">
          {/* Overall */}
          <div className="flex items-center gap-5 p-5 border-b border-[#eee]">
            <div className="text-center shrink-0">
              <div className={`text-5xl font-bold tabular-nums leading-none ${scoreTone(result.overallScore)}`}>
                {result.overallScore}
              </div>
              <div className="mt-1 text-xs text-[#707070]">out of 100</div>
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center px-2 py-0.5 rounded bg-[#daf3f0] text-[#005851] text-sm font-bold">
                {result.grade}
              </div>
              <p className="mt-1.5 text-sm text-[#374151]">{result.summary}</p>
            </div>
          </div>

          {/* Dimensions */}
          {Array.isArray(result.dimensions) && result.dimensions.length > 0 && (
            <div className="p-5 border-b border-[#eee] space-y-3">
              {result.dimensions.map((d) => (
                <div key={d.name} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-xs font-medium text-[#374151]">{d.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-[#f1f1f1] overflow-hidden">
                    <div
                      className={`h-full ${barTone(d.score)} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.max(0, Math.min(100, d.score))}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-semibold text-[#0D4D4D] tabular-nums">{d.score}</span>
                </div>
              ))}
            </div>
          )}

          {/* Strengths + improvements */}
          <div className="grid sm:grid-cols-2 gap-5 p-5">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#005851]">What worked</h3>
              <ul className="mt-2 space-y-2">
                {(result.strengths ?? []).map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-[#374151]">
                    <span className="text-[#005851] shrink-0">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700">What to tweak</h3>
              <ul className="mt-2 space-y-2.5">
                {(result.improvements ?? []).map((imp, i) => (
                  <li key={i} className="text-sm text-[#374151]">
                    <span className="font-semibold text-[#1a1a1a]">{imp.point}</span>
                    {imp.why && <span className="block text-xs text-[#707070] mt-0.5">{imp.why}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Suggested line */}
          {result.suggestedLine && (
            <div className="mx-5 mb-5 rounded-[8px] bg-[#f0faf8] border border-[#cdeee7] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[#005851]">Try saying</p>
              <p className="mt-1 text-sm text-[#0D4D4D] italic">&ldquo;{result.suggestedLine}&rdquo;</p>
            </div>
          )}

          <div className="px-5 pb-5">
            <button
              onClick={() => {
                setResult(null);
                setTranscript('');
                setError(null);
              }}
              className="text-sm font-semibold text-[#005851] hover:text-[#0D4D4D]"
            >
              ← Score another call
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
