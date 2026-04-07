'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
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

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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
