'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, query, orderBy, Timestamp, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useDashboard } from './DashboardContext';
import { getAnniversaryDate } from '../../lib/policyUtils';
import type { AgentAggregates } from '../../lib/stats-aggregation';
import { computeBookHealth } from '../../lib/book-health';
import { getMostRecentBadge, type EarnedBadge, type BadgeIcon } from '../../lib/badges';
import SectionTipCard from '../../components/SectionTipCard';

interface Client {
  id: string;
  name: string;
  dateOfBirth?: string;
  phone?: string;
  pushToken?: string;
  birthdayCardSentAt?: unknown;
  createdAt: Timestamp;
}

interface ConservationAlert {
  id: string;
  clientName: string;
  carrier: string;
  reason: string;
  priority: string;
  status: string;
  isChargebackRisk: boolean;
  premiumAmount?: number;
  createdAt: Timestamp;
}

interface Referral {
  id: string;
  referralName: string;
  clientName: string;
  status: string;
  appointmentBooked: boolean;
  createdAt: unknown;
}

interface Policy {
  id: string;
  policyType: string;
  premiumAmount: number;
  effectiveDate?: string;
  status: 'Active' | 'Pending' | 'Lapsed';
  createdAt: Timestamp;
}

function isBirthdayToday(dob: string | undefined): boolean {
  if (!dob) return false;
  const now = new Date();
  const m = now.getMonth();
  const d = now.getDate();
  const iso = dob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return parseInt(iso[2], 10) - 1 === m && parseInt(iso[3], 10) === d;
  const us = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return parseInt(us[1], 10) - 1 === m && parseInt(us[2], 10) === d;
  return false;
}

function formatValue(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function DashboardHomePage() {
  const router = useRouter();
  const { user, loading, agentProfile, dismissTip } = useDashboard();

  const [clients, setClients] = useState<Client[]>([]);
  const [conservationAlerts, setConservationAlerts] = useState<ConservationAlert[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [anniversaryCount, setAnniversaryCount] = useState(0);
  const [stats, setStats] = useState<AgentAggregates | null>(null);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, 'agents', user.uid, 'stats', 'aggregates'),
      (snap) => {
        if (snap.exists()) setStats(snap.data() as AgentAggregates);
      },
      () => {},
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'agents', user.uid, 'clients'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Client)));
    }, () => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'agents', user.uid, 'conservationAlerts'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setConservationAlerts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConservationAlert)));
    }, () => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'agents', user.uid, 'referrals'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setReferrals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Referral)));
    }, () => {});
  }, [user]);

  useEffect(() => {
    if (!user || clients.length === 0) {
      setAnniversaryCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        let count = 0;
        await Promise.all(
          clients.map(async (client) => {
            try {
              const res = await fetch(`/api/policies?clientId=${client.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) return;
              const { policies: data } = await res.json();
              (data as Policy[]).forEach((p) => {
                if (getAnniversaryDate(p.createdAt, p.effectiveDate)) count++;
              });
            } catch { /* skip */ }
          }),
        );
        if (!cancelled) setAnniversaryCount(count);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [user, clients]);

  const activeConservation = conservationAlerts.filter(
    (a) => a.status !== 'saved' && a.status !== 'lost',
  );
  const urgentRevenue = activeConservation.reduce(
    (sum, a) => sum + (a.premiumAmount || 0), 0,
  );
  const activeReferrals = referrals.filter(
    (r) => r.status === 'active' || r.status === 'outreach-sent' || r.status === 'drip-1' || r.status === 'drip-2',
  );

  const birthdayToday = useMemo(() => {
    const currentYear = new Date().getFullYear().toString();
    return clients.find(
      (c) => isBirthdayToday(c.dateOfBirth) && c.birthdayCardSentAt !== currentYear,
    ) || null;
  }, [clients]);

  const totalValue = stats ? stats.totalApv : 0;
  const bookHealth = stats ? computeBookHealth(stats, activeConservation.length) : null;
  const badge = stats ? getMostRecentBadge(stats) : null;

  if (loading) return null;

  return (
    <div className="max-w-2xl mx-auto">
      {!agentProfile.tipsSeen?.home && (
        <SectionTipCard onDismiss={() => dismissTip('home')}>
          This is your command center. Stats, action items, and summaries update in
          real time. Start by adding clients on the Clients page. Questions? Ask Patch
          in the bottom-right corner.
        </SectionTipCard>
      )}

      {/* ── Value Hero ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between mt-2 mb-10">
        <div>
          <p className="text-6xl font-extrabold text-[#005851] tracking-tight">
            {formatValue(totalValue)}
          </p>
          <p className="text-sm text-[#707070] mt-1">total value created</p>
        </div>

        {(bookHealth !== null || badge) && (
          <div className="flex items-center gap-3">
            {bookHealth !== null && (
              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#44bbaa]" />
                  <span className="text-lg font-bold text-[#005851]">{bookHealth}</span>
                </div>
                <p className="text-[10px] text-[#707070]">book health</p>
              </div>
            )}
            {badge && bookHealth !== null && (
              <div className="w-px h-8 bg-[#e0e0e0]" />
            )}
            {badge && (
              <div className="text-center">
                <BadgeIconSvg icon={badge.icon} color={badge.color} />
                <p className="text-[10px] text-[#707070] mt-0.5">{badge.name}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Three Metric Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-[5px] shadow-sm p-5">
          <div className="flex items-start justify-between mb-1">
            <span className="text-4xl font-extrabold text-[#16a34a]">
              {stats?.savedPolicies.count ?? 0}
            </span>
            <svg className="w-5 h-5 text-[#16a34a] mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-xs font-medium text-[#000000]">Policies Saved</p>
          <p className="text-[11px] text-[#707070]">{formatValue(stats?.savedPolicies.apv ?? 0)} APV</p>
        </div>

        <div className="bg-white rounded-[5px] shadow-sm p-5">
          <div className="flex items-start justify-between mb-1">
            <span className="text-4xl font-extrabold text-[#2563eb]">
              {stats?.clientsFromReferrals ?? 0}
            </span>
            <svg className="w-5 h-5 text-[#2563eb] mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17l9.2-9.2M17 17V7H7" />
            </svg>
          </div>
          <p className="text-xs font-medium text-[#000000]">Referrals Won</p>
          <p className="text-[11px] text-[#707070]">{formatValue(stats?.referralApv ?? 0)} APV</p>
        </div>

        <div className="bg-white rounded-[5px] shadow-sm p-5">
          <div className="flex items-start justify-between mb-1">
            <span className="text-4xl font-extrabold text-[#005851]">
              {stats?.touchpoints.total ?? 0}
            </span>
            <svg className="w-5 h-5 text-[#005851] mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <p className="text-xs font-medium text-[#000000]">Touchpoints Sent</p>
          <p className="text-[11px] text-[#707070]">auto + manual</p>
        </div>
      </div>

      {/* ── Urgent Alerts ──────────────────────────────────────── */}
      {activeConservation.length > 0 && (
        <button
          onClick={() => router.push('/dashboard/conservation')}
          className="w-full flex items-center gap-3 bg-red-50 rounded-[5px] px-4 py-2.5 mb-2 hover:bg-red-100 transition-colors text-left"
        >
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <span className="text-sm text-[#000000] flex-1">
            {activeConservation.length} {activeConservation.length === 1 ? 'policy needs' : 'policies need'} you
            {urgentRevenue > 0 && <span className="text-[#707070]"> — {formatValue(urgentRevenue)}/yr at stake</span>}
          </span>
          <span className="text-sm font-medium text-[#005851] shrink-0">View →</span>
        </button>
      )}

      {birthdayToday && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-2">
          <span className="w-2 h-2 rounded-full bg-pink-400 shrink-0" />
          <span className="text-sm text-[#000000] flex-1">
            {birthdayToday.name} — birthday today
          </span>
          {birthdayToday.phone ? (
            <a
              href={`sms:${birthdayToday.phone}?body=${encodeURIComponent(`Happy Birthday, ${birthdayToday.name.split(' ')[0]}! Hope you have an amazing day. — ${agentProfile.name || 'Your Agent'}`)}`}
              className="text-sm font-medium text-[#005851] shrink-0 hover:underline"
            >
              Send Text →
            </a>
          ) : (
            <button
              onClick={() => router.push('/dashboard/clients')}
              className="text-sm font-medium text-[#005851] shrink-0 hover:underline"
            >
              View →
            </button>
          )}
        </div>
      )}

      {/* ── Nav Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 mt-8">
        <div className="border-r border-b border-[#c0c0c0] px-4 py-4">
          <NavLink
            color="bg-red-500"
            label="Retention"
            count={activeConservation.length}
            onClick={() => router.push('/dashboard/conservation')}
          />
        </div>
        <div className="border-b border-[#c0c0c0] px-4 py-4">
          <NavLink
            color="bg-[#2563eb]"
            label="Referrals"
            count={activeReferrals.length}
            onClick={() => router.push('/dashboard/referrals')}
          />
        </div>
        <div className="border-r border-[#c0c0c0] px-4 py-4">
          <NavLink
            color="bg-amber-500"
            label="Anniversaries"
            count={anniversaryCount}
            onClick={() => router.push('/dashboard/policy-reviews')}
          />
        </div>
        <div className="px-4 py-4">
          <NavLink
            color="bg-[#005851]"
            label="AI Activity"
            count={stats?.touchpoints.total ?? 0}
            onClick={() => router.push('/dashboard/clients')}
          />
        </div>
      </div>

      {/* ── Empty State ────────────────────────────────────────── */}
      {clients.length === 0 && referrals.length === 0 && conservationAlerts.length === 0 && (
        <div className="mt-12 text-center">
          <div className="w-16 h-16 bg-[#daf3f0] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-[#000000] mb-2">Welcome to AgentForLife</h3>
          <p className="text-[#707070] text-sm mb-6 max-w-md mx-auto">
            Start by adding your clients. Each one gets a unique code to download your
            branded app. From there, referrals and policy tracking happen automatically.
          </p>
          <button
            onClick={() => router.push('/dashboard/clients')}
            className="px-6 py-3 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors"
          >
            Add Your First Client
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function NavLink({ color, label, count, onClick }: {
  color: string;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2 text-left group"
    >
      <span className={`w-2 h-2 rounded-full ${color} shrink-0`} />
      <span className="text-sm font-bold text-[#000000] group-hover:text-[#005851] transition-colors">
        {label}
      </span>
      <span className="text-sm text-[#707070] ml-auto">{count}</span>
      <span className="text-sm text-[#005851]">→</span>
    </button>
  );
}

function BadgeIconSvg({ icon, color }: { icon: BadgeIcon; color: string }) {
  const cls = 'w-6 h-6';
  switch (icon) {
    case 'shield':
      return (
        <svg className={cls} fill={color} viewBox="0 0 24 24">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'chat':
      return (
        <svg className={cls} fill={color} viewBox="0 0 24 24">
          <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
        </svg>
      );
    case 'star':
      return (
        <svg className={cls} fill={color} viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    case 'heart':
      return (
        <svg className={cls} fill={color} viewBox="0 0 24 24">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
        </svg>
      );
    case 'trophy':
      return (
        <svg className={cls} fill={color} viewBox="0 0 24 24">
          <path d="M6 9H3a1 1 0 01-1-1V4a1 1 0 011-1h3m12 6h3a1 1 0 001-1V4a1 1 0 00-1-1h-3M6 3h12v7a6 6 0 01-12 0V3zm3 17h6m-3-3v3" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'diamond':
      return (
        <svg className={cls} fill={color} viewBox="0 0 24 24">
          <path d="M12 2L2 12l10 10 10-10L12 2z" />
        </svg>
      );
    case 'flame':
      return (
        <svg className={cls} fill={color} viewBox="0 0 24 24">
          <path d="M12 23c-3.6 0-8-2.4-8-7.5C4 12 6.5 9.5 8 8c.5 2.5 2 4 3 5 .5-3 2-7 5-9 0 4 4 7 4 11.5 0 5.1-4.4 7.5-8 7.5z" />
        </svg>
      );
    case 'target':
      return (
        <svg className={cls} fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" fill={color} />
        </svg>
      );
  }
}
