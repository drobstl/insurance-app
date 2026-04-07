'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, query, orderBy, Timestamp, doc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../../firebase';
import { useDashboard } from './DashboardContext';
import { getAnniversaryDate } from '../../lib/policyUtils';
import type { AgentAggregates } from '../../lib/stats-aggregation';
import { computeBookHealth } from '../../lib/book-health';
import { computeBookHealthBreakdown } from '../../lib/book-health';
import { getMostRecentBadge, computeBadges, type EarnedBadge } from '../../lib/badges';
import SectionTipCard from '../../components/SectionTipCard';
import PremiumBadge from '../../components/PremiumBadge';
import BadgeShelf from '../../components/BadgeShelf';
import BookHealthPopover from '../../components/BookHealthPopover';
import BadgeCelebration from '../../components/BadgeCelebration';

interface ActivityItem {
  id: string;
  type: 'birthday' | 'holiday' | 'anniversary' | 'retention' | 'referral' | 'policy-review';
  summary: string;
  timestamp: string;
}

const TYPE_META: Record<ActivityItem['type'], { color: string; href: string }> = {
  referral: { color: 'bg-[#2563eb]', href: '/dashboard/referrals' },
  retention: { color: 'bg-red-500', href: '/dashboard/conservation' },
  birthday: { color: 'bg-pink-400', href: '/dashboard/clients' },
  holiday: { color: 'bg-emerald-500', href: '/dashboard/clients' },
  anniversary: { color: 'bg-amber-500', href: '/dashboard/policy-reviews' },
  'policy-review': { color: 'bg-[#005851]', href: '/dashboard/policy-reviews' },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

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

  const [fanOpen, setFanOpen] = useState(false);
  const [weeklyItems, setWeeklyItems] = useState<ActivityItem[]>([]);
  const [fanLoading, setFanLoading] = useState(false);
  const fanAnchorRef = useRef<HTMLDivElement>(null);
  const weeklyFetched = useRef(false);

  const fetchWeeklyActivity = useCallback(async () => {
    if (!user || weeklyFetched.current) return;
    setFanLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/activity/weekly', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWeeklyItems(data.items ?? []);
        weeklyFetched.current = true;
      }
    } catch { /* ignore */ }
    setFanLoading(false);
  }, [user]);

  const toggleFan = useCallback(() => {
    const next = !fanOpen;
    setFanOpen(next);
    if (next) fetchWeeklyActivity();
  }, [fanOpen, fetchWeeklyActivity]);

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
  const bookHealthBreakdown = stats ? computeBookHealthBreakdown(stats, activeConservation.length) : null;
  const badgeStats = useMemo<AgentAggregates | null>(() => {
    if (!stats) return null;
    return { ...stats, isFoundingMember: !!agentProfile.isFoundingMember };
  }, [stats, agentProfile.isFoundingMember]);

  const badge = badgeStats ? getMostRecentBadge(badgeStats) : null;

  const [shelfOpen, setShelfOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [celebrationBadge, setCelebrationBadge] = useState<EarnedBadge | null>(null);
  const [shareBadge, setShareBadge] = useState<EarnedBadge | null>(null);
  const shelfContainerRef = useRef<HTMLDivElement>(null);
  const healthContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!badgeStats || !user || !agentProfile) return;
    const earned = computeBadges(badgeStats);
    const celebrated = new Set(agentProfile.celebratedBadgeIds ?? []);
    const uncelebrated = earned.find((b) => !celebrated.has(b.id));
    if (uncelebrated) setCelebrationBadge(uncelebrated);
  }, [badgeStats, user, agentProfile]);

  if (loading) return null;

  return (
    <div className="max-w-5xl mx-auto">
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
          <p className="text-8xl font-extrabold text-[#005851] tracking-tight">
            {formatValue(totalValue)}
          </p>
          <p className="text-sm text-[#707070] mt-1">total value created</p>
        </div>

        {badge && (
          <div className="flex items-center gap-4">
            {/* bookHealth display hidden — re-enable by uncommenting below and restoring outer condition to (bookHealth !== null || badge)
            {bookHealth !== null && (
              <div className="relative" ref={healthContainerRef}>
                <button
                  onClick={() => setHealthOpen(!healthOpen)}
                  className="text-right hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#44bbaa]" />
                    <span className="text-3xl font-extrabold text-[#005851]">{bookHealth}</span>
                  </div>
                  <p className="text-xs text-[#707070]">book health</p>
                </button>
                {bookHealthBreakdown && (
                  <BookHealthPopover
                    breakdown={bookHealthBreakdown}
                    open={healthOpen}
                    onClose={() => setHealthOpen(false)}
                    containerRef={healthContainerRef}
                  />
                )}
              </div>
            )}
            {badge && bookHealth !== null && (
              <div className="w-px h-12 bg-[#d0d0d0]" />
            )}
            */}
            {badge && badgeStats && (
              <div className="relative" ref={shelfContainerRef}>
                <button
                  onClick={() => setShelfOpen(!shelfOpen)}
                  className="flex flex-col items-center hover:opacity-80 transition-opacity"
                >
                  <PremiumBadge badgeId={badge.id} size={140} shimmer glow />
                  <p className="text-xs text-[#707070] -mt-0.5">{badge.name}</p>
                </button>
                <BadgeShelf
                  stats={badgeStats}
                  open={shelfOpen}
                  onClose={() => setShelfOpen(false)}
                  onShareBadge={(b) => { setShelfOpen(false); setShareBadge(b); }}
                  containerRef={shelfContainerRef}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Three Metric Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
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

        <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
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

        <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
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
          className="w-full flex items-center gap-3 bg-red-50 rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] px-4 py-2.5 mb-2 hover:bg-red-100 transition-colors text-left"
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
      <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] overflow-hidden mt-8">
        <div className="grid grid-cols-2">
          <div className="border-r border-b border-[#e0e0e0] px-4 py-4">
            <NavLink
              color="bg-red-500"
              label="Retention"
              count={activeConservation.length}
              onClick={() => router.push('/dashboard/conservation')}
            />
          </div>
          <div className="border-b border-[#e0e0e0] px-4 py-4">
            <NavLink
              color="bg-[#2563eb]"
              label="Referrals"
              count={activeReferrals.length}
              onClick={() => router.push('/dashboard/referrals')}
            />
          </div>
          <div className="border-r border-[#e0e0e0] px-4 py-4">
            <NavLink
              color="bg-amber-500"
              label="Anniversaries"
              count={anniversaryCount}
              onClick={() => router.push('/dashboard/policy-reviews')}
            />
          </div>
          <div className="px-4 py-4" ref={fanAnchorRef}>
            <NavLink
              color="bg-[#005851]"
              label="AI Activity"
              count={stats?.touchpoints.total ?? 0}
              onClick={toggleFan}
            />
          </div>
        </div>
      </div>

      <AIActivityFan
        open={fanOpen}
        loading={fanLoading}
        items={weeklyItems}
        anchorRef={fanAnchorRef}
        onClose={() => setFanOpen(false)}
        onNavigate={(href) => { setFanOpen(false); router.push(href); }}
      />

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

      {/* ── Badge Celebration Overlay ──────────────────────────── */}
      {celebrationBadge && user && (
        <BadgeCelebration
          badge={celebrationBadge}
          agentUid={user.uid}
          agentName={agentProfile.name || 'Agent'}
          totalValue={totalValue}
          agentPhotoBase64={agentProfile.photoBase64}
          user={user}
          onDismiss={() => setCelebrationBadge(null)}
        />
      )}

      {/* ── Share-only overlay triggered from badge shelf ───── */}
      {shareBadge && user && (
        <BadgeCelebration
          badge={shareBadge}
          agentUid={user.uid}
          agentName={agentProfile.name || 'Agent'}
          totalValue={totalValue}
          agentPhotoBase64={agentProfile.photoBase64}
          user={user}
          onDismiss={() => setShareBadge(null)}
          shareOnly
        />
      )}
    </div>
  );
}

// ── Fan-out component ────────────────────────────────────────────────────────

function AIActivityFan({
  open,
  loading,
  items,
  anchorRef,
  onClose,
  onNavigate,
}: {
  open: boolean;
  loading: boolean;
  items: ActivityItem[];
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onNavigate: (href: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const anchor = anchorRef.current?.getBoundingClientRect();
  if (!anchor) return null;

  const fetched = !loading || items.length > 0;
  const cardWidth = 420;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const left = Math.min(Math.max(16, anchor.left), viewportWidth - cardWidth - 16);
  const top = anchor.bottom + 10;
  const transformOriginX = Math.max(
    16,
    Math.min(cardWidth - 16, anchor.left - left + anchor.width / 2),
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed z-[71] w-[420px] max-w-[calc(100vw-2rem)] bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] shadow-2xl overflow-hidden"
            style={{
              left,
              top,
              transformOrigin: `${transformOriginX}px top`,
            }}
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          >
            <div className="px-4 py-3 border-b border-[#e0e0e0]">
              <p className="text-[10px] font-semibold text-[#707070] uppercase tracking-wider">This Week</p>
            </div>

            {!fetched ? (
              <div className="flex items-center gap-2 px-4 py-4">
                <svg className="animate-spin w-4 h-4 text-[#005851]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs text-[#707070]">Loading activity...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="flex items-center gap-2.5 px-4 py-4">
                <svg className="w-4 h-4 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm text-[#707070]">No AI activity this week</span>
              </div>
            ) : (
              <div className="p-2 max-h-80 overflow-y-auto space-y-1">
                {items.map((item) => {
                  const meta = TYPE_META[item.type];
                  return (
                    <motion.button
                      key={item.id}
                      className="w-full flex items-center gap-2.5 bg-white rounded-lg border border-[#e4e4e4] px-3 py-2 hover:border-[#005851]/30 hover:shadow-sm transition-all text-left"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                      onClick={() => onNavigate(meta.href)}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.color} shrink-0`} />
                      <span className="text-xs text-[#000000] flex-1 truncate">{item.summary}</span>
                      <span className="text-[10px] text-[#707070] shrink-0">{relativeTime(item.timestamp)}</span>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
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

