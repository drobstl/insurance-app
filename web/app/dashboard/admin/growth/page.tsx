'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../../../../firebase';
import { isAdminEmail } from '../../../../lib/admin';

interface RecentSignup {
  uid: string;
  name: string | null;
  email: string | null;
  membershipTier: string | null;
  referredByAgent: string | null;
  source: string | null;
  createdAtMs: number;
}

interface AgentRow {
  uid: string;
  name: string | null;
  email: string | null;
  membershipTier: string;
  subscriptionStatus: string | null;
  createdAtMs: number;
  lastActiveMs: number;
}

interface GrowthData {
  totals: {
    total: number;
    paying: number;
    trial: number;
    founding: number;
    onboarded: number;
    new7: number;
    new30: number;
    active7: number;
    active30: number;
    byTier: Record<string, number>;
  };
  recentSignups: RecentSignup[];
  agents: AgentRow[];
}

function timeAgo(ms: number): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export default function AdminGrowthPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GrowthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        if (!isAdminEmail(u.email)) {
          router.push('/dashboard');
          return;
        }
        setUser(u);
      } else {
        router.push('/login');
      }
    });
    return () => unsub();
  }, [router]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/growth', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError('Failed to load growth data.');
        return;
      }
      setData((await res.json()) as GrowthData);
      // Mark viewed — clears the nav badge. Fire-and-forget.
      void fetch('/api/admin/growth', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="p-8 text-[#707070]">Loading…</div>;
  }
  if (error) {
    return <div className="p-8 text-red-600">{error}</div>;
  }

  const t = data?.totals;
  const cards = t
    ? [
        { label: 'Total agents', value: t.total },
        { label: 'New (7 days)', value: t.new7 },
        { label: 'New (30 days)', value: t.new30 },
        { label: 'Active (7 days)', value: t.active7 },
        { label: 'Active (30 days)', value: t.active30 },
        { label: 'Paying', value: t.paying },
        { label: 'Trial', value: t.trial },
        { label: 'Founding', value: t.founding },
        { label: 'Onboarded', value: t.onboarded },
      ]
    : [];

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-[#0D4D4D] mb-1">Growth</h1>
      <p className="text-sm text-[#707070] mb-6">
        New signups and account composition. Opening this page clears the new-signup badge.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-[#e5e7eb] p-4">
            <div className="text-2xl font-bold text-[#0D4D4D]">{c.value}</div>
            <div className="text-xs text-[#707070] mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold text-[#0D4D4D] mb-3">Recent signups</h2>
      <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#F8F9FA] text-[#707070]">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Name</th>
              <th className="text-left px-4 py-2 font-semibold">Email</th>
              <th className="text-left px-4 py-2 font-semibold">Tier</th>
              <th className="text-left px-4 py-2 font-semibold">Source</th>
              <th className="text-left px-4 py-2 font-semibold">When</th>
            </tr>
          </thead>
          <tbody>
            {(data?.recentSignups ?? []).map((s) => (
              <tr key={s.uid} className="border-t border-[#f0f0f0]">
                <td className="px-4 py-2 text-[#2D3748]">
                  {s.name || '—'}
                  {s.referredByAgent ? (
                    <span className="ml-1.5 text-[10px] text-[#005851] bg-[#daf3f0] px-1.5 py-0.5 rounded">referred</span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-[#2D3748]">{s.email || '—'}</td>
                <td className="px-4 py-2 text-[#2D3748]">{s.membershipTier || '—'}</td>
                <td className="px-4 py-2 text-[#2D3748]">{s.source || '—'}</td>
                <td className="px-4 py-2 text-[#707070] whitespace-nowrap">{timeAgo(s.createdAtMs)}</td>
              </tr>
            ))}
            {(data?.recentSignups ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[#707070]">
                  No signups recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-semibold text-[#0D4D4D] mt-8 mb-3">Agents &amp; activity</h2>
      <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#F8F9FA] text-[#707070]">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Name</th>
              <th className="text-left px-4 py-2 font-semibold">Tier</th>
              <th className="text-left px-4 py-2 font-semibold">Signed up</th>
              <th className="text-left px-4 py-2 font-semibold">Last active</th>
            </tr>
          </thead>
          <tbody>
            {(data?.agents ?? []).map((a) => {
              const dormant = !a.lastActiveMs || Date.now() - a.lastActiveMs > 30 * 24 * 60 * 60 * 1000;
              return (
                <tr key={a.uid} className="border-t border-[#f0f0f0]">
                  <td className="px-4 py-2 text-[#2D3748]">{a.name || a.email || '—'}</td>
                  <td className="px-4 py-2 text-[#2D3748]">{a.membershipTier}</td>
                  <td className="px-4 py-2 text-[#707070] whitespace-nowrap">{timeAgo(a.createdAtMs)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={dormant ? 'text-[#b42318]' : 'text-[#2D3748]'}>{timeAgo(a.lastActiveMs)}</span>
                    {dormant ? (
                      <span className="ml-1.5 text-[10px] text-[#b42318] bg-[#fde6e6] px-1.5 py-0.5 rounded">dormant</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {(data?.agents ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[#707070]">
                  No agents yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
