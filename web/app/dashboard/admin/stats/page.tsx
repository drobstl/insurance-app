'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { auth, db } from '../../../../firebase';
import { isAdminEmail } from '../../../../lib/admin';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentAggregates {
  referrals: { total: number; appointmentsBooked: number };
  clientsFromReferrals: number;
  savedPolicies: { count: number; apv: number };
  successfulRewrites: { count: number; apv: number };
  referralApv: number;
  totalApv: number;
  touchpoints: {
    holidayCardsSent: number;
    birthdayMessagesSent: number;
    anniversarySent: number;
    total: number;
  };
  rates: {
    referralAppointmentRate: number;
    conservationSaveRate: number;
  };
  updatedAt: string;
}

interface BatchFileEntry {
  status?: 'queued' | 'processing' | 'succeeded' | 'failed';
  error?: string | null;
}

interface BatchJobRecord {
  id: string;
  status: 'processing' | 'completing' | 'completed' | 'partial' | 'failed' | 'cancelled';
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  totalRows: number;
  createdAt?: unknown;
  completedAt?: unknown;
  files?: Record<string, BatchFileEntry>;
}

interface ImportHealthSnapshot {
  totalFiles: number;
  succeededFiles: number;
  skippedFiles: number;
  failedFiles: number;
  successRate: number;
  skipRate: number;
  failureRate: number;
  avgMinutesPerBatch: number;
  p95MinutesPerBatch: number;
  topFailureReasons: Array<{ reason: string; count: number }>;
  recentBatches: BatchJobRecord[];
}

interface ImportHealthStatus {
  level: 'healthy' | 'warning';
  title: string;
  reasons: string[];
  actions: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof candidate.toDate === 'function') {
      const date = candidate.toDate();
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    }
    const seconds = typeof candidate.seconds === 'number' ? candidate.seconds : candidate._seconds;
    if (typeof seconds === 'number') return seconds * 1000;
  }
  return null;
}

function isSkipError(error: string | null | undefined): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return (
    lower.includes('not recognized as an insurance application') ||
    lower.includes('unsupported file type') ||
    lower.includes('no supported files found') ||
    lower.includes('cancelled')
  );
}

function summarizeImportHealth(records: BatchJobRecord[]): ImportHealthSnapshot {
  let totalFiles = 0;
  let succeededFiles = 0;
  let skippedFiles = 0;
  let failedFiles = 0;
  const durations: number[] = [];
  const failureReasons = new Map<string, number>();

  for (const batch of records) {
    totalFiles += Math.max(0, batch.totalFiles || 0);
    succeededFiles += Math.max(0, batch.completedFiles || 0);

    const files = batch.files || {};
    for (const file of Object.values(files)) {
      if (file.status === 'failed') {
        if (isSkipError(file.error)) {
          skippedFiles += 1;
          continue;
        }
        failedFiles += 1;
        const key = (file.error || 'Unknown failure').trim();
        failureReasons.set(key, (failureReasons.get(key) || 0) + 1);
      }
    }

    const createdAtMs = toMillis(batch.createdAt);
    const completedAtMs = toMillis(batch.completedAt);
    if (createdAtMs && completedAtMs && completedAtMs >= createdAtMs) {
      durations.push((completedAtMs - createdAtMs) / 60_000);
    }
  }

  const unresolvedFailures = Math.max(0, totalFiles - succeededFiles - skippedFiles - failedFiles);
  failedFiles += unresolvedFailures;

  const safeTotal = totalFiles > 0 ? totalFiles : 1;
  const sortedDurations = durations.slice().sort((a, b) => a - b);
  const p95Index = sortedDurations.length > 0 ? Math.max(0, Math.ceil(sortedDurations.length * 0.95) - 1) : 0;

  return {
    totalFiles,
    succeededFiles,
    skippedFiles,
    failedFiles,
    successRate: succeededFiles / safeTotal,
    skipRate: skippedFiles / safeTotal,
    failureRate: failedFiles / safeTotal,
    avgMinutesPerBatch: durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0,
    p95MinutesPerBatch: sortedDurations.length > 0 ? sortedDurations[p95Index] : 0,
    topFailureReasons: Array.from(failureReasons.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count })),
    recentBatches: records.slice(0, 10),
  };
}

function evaluateImportHealth(snapshot: ImportHealthSnapshot): ImportHealthStatus {
  const reasons: string[] = [];
  const actions: string[] = [];

  if (snapshot.successRate < 0.9) {
    reasons.push(`Success rate is ${formatPercent(snapshot.successRate)} (target: at least 90%).`);
    actions.push('Inspect top failure reasons and spot-check the most recent failed files.');
  }

  if (snapshot.failureRate > 0.05) {
    reasons.push(`Failure rate is ${formatPercent(snapshot.failureRate)} (target: at most 5%).`);
    actions.push('Lower PDF concurrency temporarily and retry failed files once.');
  }

  if (snapshot.p95MinutesPerBatch > 15) {
    reasons.push(`P95 batch time is ${snapshot.p95MinutesPerBatch.toFixed(1)} minutes (target: at most 15).`);
    actions.push('Use smaller batches while performance is degraded and review processing bottlenecks.');
  }

  if (reasons.length === 0) {
    return {
      level: 'healthy',
      title: 'Healthy',
      reasons: ['All rollout thresholds are currently within target ranges.'],
      actions: ['Continue normal rollout and monitor this panel daily.'],
    };
  }

  return {
    level: 'warning',
    title: 'Warning',
    reasons,
    actions: actions.length > 0 ? actions : ['Keep monitoring and review failed files.'],
  };
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AdminStatsPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AgentAggregates | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [importHealth, setImportHealth] = useState<ImportHealthSnapshot | null>(null);
  const [importHealthLoading, setImportHealthLoading] = useState(false);

  /* ---- Auth + admin check ---- */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        if (!isAdminEmail(currentUser.email)) {
          router.push('/dashboard');
          return;
        }
        setUser(currentUser);
        setLoading(false);
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  /* ---- Fetch aggregates ---- */
  const fetchStats = useCallback(async () => {
    if (!user) return;
    setStatsLoading(true);
    try {
      const snap = await getDoc(doc(db, 'agents', user.uid, 'stats', 'aggregates'));
      if (snap.exists()) {
        setStats(snap.data() as AgentAggregates);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, [user]);

  const fetchImportHealth = useCallback(async () => {
    if (!user) return;
    setImportHealthLoading(true);
    try {
      const batchesQuery = query(
        collection(db, 'agents', user.uid, 'batchJobs'),
        orderBy('createdAt', 'desc'),
        limit(60),
      );
      const snap = await getDocs(batchesQuery);
      const records: BatchJobRecord[] = snap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<BatchJobRecord, 'id'>),
      }));
      setImportHealth(summarizeImportHealth(records));
    } catch (err) {
      console.error('Error fetching import health:', err);
    } finally {
      setImportHealthLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStats();
    fetchImportHealth();
  }, [fetchImportHealth, fetchStats]);

  /* ---- Manual refresh (authenticated endpoint) ---- */
  const handleRefresh = async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/stats/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Refresh failed');
      }
      const data = await res.json();
      if (data.aggregates) {
        setStats(data.aggregates as AgentAggregates);
      } else {
        await fetchStats();
      }
      await fetchImportHealth();
    } catch (err) {
      console.error('Error refreshing stats:', err);
    } finally {
      setRefreshing(false);
    }
  };

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#e4e4e4] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#005851]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#e4e4e4] flex">
      <main className="ml-0 flex-1 p-6 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#000000]">Performance Stats</h1>
            <p className="text-sm text-[#707070] mt-1">
              {stats?.updatedAt
                ? `Last updated: ${formatDate(stats.updatedAt)}`
                : 'Stats have not been computed yet'}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-[#005851] text-white rounded-[5px] text-sm font-semibold hover:bg-[#004a44] transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'Refreshing...' : 'Refresh Now'}
          </button>
        </div>

        {statsLoading && !stats ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#005851]" />
          </div>
        ) : !stats ? (
          <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-8 text-center">
            <p className="text-[#707070]">No stats available yet. Click &quot;Refresh Now&quot; to compute them, or they will be computed automatically each day at 6 AM UTC.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* ── Total APV ─────────────────────────────────── */}
            <div className="bg-gradient-to-r from-[#005851] to-[#007a6e] rounded-[5px] p-6 text-white">
              <p className="text-sm text-white/70 font-medium mb-1">Total Annual Premium Value</p>
              <p className="text-4xl font-bold">{formatCurrency(stats.totalApv)}</p>
              <div className="flex gap-6 mt-4 text-sm">
                <div>
                  <span className="text-white/60">Saved</span>
                  <span className="ml-2 font-semibold">{formatCurrency(stats.savedPolicies.apv)}</span>
                </div>
                <div>
                  <span className="text-white/60">Rewrites</span>
                  <span className="ml-2 font-semibold">{formatCurrency(stats.successfulRewrites.apv)}</span>
                </div>
                <div>
                  <span className="text-white/60">Referrals</span>
                  <span className="ml-2 font-semibold">{formatCurrency(stats.referralApv)}</span>
                </div>
              </div>
            </div>

            {/* ── Stat Cards Grid ───────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Referrals" value={stats.referrals.total} />
              <StatCard label="Appointments Booked" value={stats.referrals.appointmentsBooked} sublabel="from referrals" />
              <StatCard label="Clients from Referrals" value={stats.clientsFromReferrals} />
              <StatCard label="Referral Appointment Rate" value={formatPercent(stats.rates.referralAppointmentRate)} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Saved Policies" value={stats.savedPolicies.count} />
              <StatCard label="Saved APV" value={formatCurrency(stats.savedPolicies.apv)} />
              <StatCard label="Conservation Save Rate" value={formatPercent(stats.rates.conservationSaveRate)} />
              <StatCard label="Referral APV" value={formatCurrency(stats.referralApv)} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Successful Rewrites" value={stats.successfulRewrites.count} />
              <StatCard label="Rewrite APV" value={formatCurrency(stats.successfulRewrites.apv)} />
            </div>

            {/* ── Relationship Touchpoints ───────────────────── */}
            <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-6">
              <h2 className="text-lg font-bold text-[#000000] mb-4">Relationship Touchpoints</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <TouchpointCard label="Holiday Cards" value={stats.touchpoints.holidayCardsSent} icon="🎄" />
                <TouchpointCard label="Birthday Messages" value={stats.touchpoints.birthdayMessagesSent} icon="🎂" />
                <TouchpointCard label="Anniversary Alerts" value={stats.touchpoints.anniversarySent} icon="📋" />
                <TouchpointCard label="Total Touchpoints" value={stats.touchpoints.total} icon="📊" />
              </div>
            </div>

            <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#000000]">Bulk Import Reliability</h2>
                  <p className="text-xs text-[#707070] mt-0.5">Derived from Firestore batch job records.</p>
                </div>
                {importHealthLoading && <span className="text-xs text-[#707070]">Refreshing…</span>}
              </div>

              {!importHealth ? (
                <p className="text-sm text-[#707070]">No import health data yet.</p>
              ) : (
                <>
                  {(() => {
                    const health = evaluateImportHealth(importHealth);
                    return (
                      <div
                        className={`rounded-[5px] border p-4 ${
                          health.level === 'healthy'
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-amber-50 border-amber-200'
                        }`}
                      >
                        <p className={`text-sm font-semibold ${health.level === 'healthy' ? 'text-emerald-800' : 'text-amber-800'}`}>
                          Rollout Status: {health.title}
                        </p>
                        <ul className="mt-2 space-y-1">
                          {health.reasons.map((reason) => (
                            <li key={reason} className={`text-xs ${health.level === 'healthy' ? 'text-emerald-700' : 'text-amber-700'}`}>
                              • {reason}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3">
                          <p className={`text-[11px] font-semibold uppercase tracking-wide ${health.level === 'healthy' ? 'text-emerald-700' : 'text-amber-700'}`}>
                            Recommended action
                          </p>
                          <ul className="mt-1 space-y-1">
                            {health.actions.map((action) => (
                              <li key={action} className={`text-xs ${health.level === 'healthy' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                • {action}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label="Success Rate" value={formatPercent(importHealth.successRate)} sublabel={`${importHealth.succeededFiles} files`} />
                    <StatCard label="Skip Rate" value={formatPercent(importHealth.skipRate)} sublabel={`${importHealth.skippedFiles} files`} />
                    <StatCard label="Failure Rate" value={formatPercent(importHealth.failureRate)} sublabel={`${importHealth.failedFiles} files`} />
                    <StatCard label="Tracked Files" value={importHealth.totalFiles} sublabel="last 60 batches" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label="Avg Minutes / Batch" value={importHealth.avgMinutesPerBatch.toFixed(1)} />
                    <StatCard label="P95 Minutes / Batch" value={importHealth.p95MinutesPerBatch.toFixed(1)} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-[#e0e0e0] rounded-[5px] p-4">
                      <p className="text-xs font-semibold text-[#707070] uppercase tracking-wide mb-2">Top Failure Reasons</p>
                      {importHealth.topFailureReasons.length === 0 ? (
                        <p className="text-sm text-[#707070]">No failure reasons recorded.</p>
                      ) : (
                        <ul className="space-y-2">
                          {importHealth.topFailureReasons.map((item) => (
                            <li key={item.reason} className="flex items-start justify-between gap-3 text-sm">
                              <span className="text-[#000000]">{item.reason}</span>
                              <span className="text-[#707070] font-semibold">{item.count}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="border border-[#e0e0e0] rounded-[5px] p-4">
                      <p className="text-xs font-semibold text-[#707070] uppercase tracking-wide mb-2">Recent Batches</p>
                      {importHealth.recentBatches.length === 0 ? (
                        <p className="text-sm text-[#707070]">No batches found.</p>
                      ) : (
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {importHealth.recentBatches.map((batch) => (
                            <div key={batch.id} className="rounded-[5px] border border-[#ececec] px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-semibold text-[#000000]">{batch.status}</span>
                                <span className="text-[11px] text-[#707070]">
                                  {batch.completedFiles}/{batch.totalFiles} succeeded
                                </span>
                              </div>
                              <p className="text-[11px] text-[#707070] mt-1">
                                {batch.failedFiles} failed • {batch.totalRows} rows
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatCard({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) {
  return (
    <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-4">
      <p className="text-xs text-[#707070] font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#000000]">{value}</p>
      {sublabel && <p className="text-xs text-[#707070] mt-0.5">{sublabel}</p>}
    </div>
  );
}

function TouchpointCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="flex items-center gap-3 bg-[#f8f8f8] rounded-[5px] p-4 border border-[#e0e0e0]">
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-xl font-bold text-[#000000]">{value}</p>
        <p className="text-xs text-[#707070]">{label}</p>
      </div>
    </div>
  );
}
