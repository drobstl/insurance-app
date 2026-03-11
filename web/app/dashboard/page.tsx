'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, query, orderBy, Timestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useDashboard } from './DashboardContext';
import { getAnniversaryDate, daysUntilAnniversary, formatCurrency } from '../../lib/policyUtils';
import { buildActionFeed, type ActionItem, type ActionClient, type ActionPolicy, type ActionConservationAlert, type ActionReferral, type ActionAnniversaryAlert } from '../../lib/action-feed';
import type { AgentAggregates } from '../../lib/stats-aggregation';
import SectionTipCard from '../../components/SectionTipCard';

interface Client extends ActionClient {
  createdAt: Timestamp;
}

interface Policy extends ActionPolicy {}

interface ConservationAlert extends ActionConservationAlert {}

interface Referral extends ActionReferral {}

interface AnniversaryAlert extends ActionAnniversaryAlert {}

// ── Dismiss helpers (localStorage, keyed by action ID + date) ────────────────

function getDismissKey(actionId: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `dismiss:${actionId}:${today}`;
}

function isDismissed(actionId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(getDismissKey(actionId)) === '1';
}

function dismissAction(actionId: string): void {
  localStorage.setItem(getDismissKey(actionId), '1');
}

// ── Action type config ──────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  conservation: {
    color: 'text-red-600',
    bg: 'bg-red-100',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  'birthday-followup': {
    color: 'text-pink-600',
    bg: 'bg-pink-100',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0A1.75 1.75 0 003 15.546M12 3v4m-4 4h8m-8 0a4 4 0 004 4m0-4a4 4 0 014 4m-4-4v4" />
      </svg>
    ),
  },
  'holiday-followup': {
    color: 'text-green-600',
    bg: 'bg-green-100',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
  referral: {
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  'anniversary-rewrite': {
    color: 'text-amber-600',
    bg: 'bg-amber-100',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  'warm-list': {
    color: 'text-[#005851]',
    bg: 'bg-[#daf3f0]',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
  },
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  conservation: 'Retention',
  'birthday-followup': 'Birthday',
  'holiday-followup': 'Holiday',
  referral: 'Referral',
  'anniversary-rewrite': 'Anniversary',
  'warm-list': 'Warm List',
};

export default function DashboardHomePage() {
  const router = useRouter();
  const { user, loading, agentProfile, dismissTip } = useDashboard();

  const [clients, setClients] = useState<Client[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [conservationAlerts, setConservationAlerts] = useState<ConservationAlert[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [anniversaryAlerts, setAnniversaryAlerts] = useState<AnniversaryAlert[]>([]);
  const [allPolicies, setAllPolicies] = useState<Policy[]>([]);
  const [stats, setStats] = useState<AgentAggregates | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [sendingPush, setSendingPush] = useState<string | null>(null);

  // Fetch stats aggregates
  useEffect(() => {
    if (!user) return;
    const statsRef = doc(db, 'agents', user.uid, 'stats', 'aggregates');
    getDoc(statsRef)
      .then((snap) => {
        if (snap.exists()) setStats(snap.data() as AgentAggregates);
      })
      .catch(() => {});
  }, [user]);

  // Fetch clients (with extended fields)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'agents', user.uid, 'clients'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setClients(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as Client)),
        );
      },
      (error) => {
        console.error('Error fetching clients:', error);
      },
    );
  }, [user]);

  // Fetch policies across all clients for stats + anniversary detection
  useEffect(() => {
    if (!user || clients.length === 0) {
      setTotalActive(0);
      setTotalPending(0);
      setAnniversaryAlerts([]);
      setAllPolicies([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const token = await user.getIdToken();
        let active = 0;
        let pending = 0;
        const allAlerts: AnniversaryAlert[] = [];
        const policies: Policy[] = [];

        await Promise.all(
          clients.map(async (client) => {
            try {
              const res = await fetch(`/api/policies?clientId=${client.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) return;
              const { policies: data } = await res.json();
              (data as Policy[]).forEach((p) => {
                policies.push(p);
                if (p.status === 'Active') active++;
                if (p.status === 'Pending') pending++;
                const annivDate = getAnniversaryDate(p.createdAt, p.effectiveDate);
                if (annivDate) {
                  allAlerts.push({
                    clientName: client.name,
                    clientId: client.id,
                    policy: p,
                    anniversaryDate: annivDate,
                  });
                }
              });
            } catch {
              // skip this client on error
            }
          }),
        );

        if (!cancelled) {
          setTotalActive(active);
          setTotalPending(pending);
          setAllPolicies(policies);
          setAnniversaryAlerts(
            allAlerts.sort(
              (a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime(),
            ),
          );
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, clients]);

  // Fetch conservation alerts
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'agents', user.uid, 'conservationAlerts'),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => {
        setConservationAlerts(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConservationAlert)),
        );
      },
      (error) => {
        console.error('Error fetching conservation alerts:', error);
      },
    );
  }, [user]);

  // Fetch referrals
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'agents', user.uid, 'referrals'),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => {
        setReferrals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Referral)));
      },
      (error) => {
        console.error('Error fetching referrals:', error);
      },
    );
  }, [user]);

  // Build action feed
  const actionFeed = useMemo(() => {
    const agentName = agentProfile.name || 'Your Agent';
    return buildActionFeed(
      clients,
      allPolicies,
      conservationAlerts,
      referrals,
      anniversaryAlerts,
      agentName,
    ).filter((item) => !dismissedIds.has(item.id) && !isDismissed(item.id));
  }, [clients, allPolicies, conservationAlerts, referrals, anniversaryAlerts, agentProfile.name, dismissedIds]);

  // Derived counts
  const activeConservation = conservationAlerts.filter(
    (a) => a.status !== 'saved' && a.status !== 'lost',
  );
  const chargebackCount = activeConservation.filter((a) => a.isChargebackRisk).length;
  const activeReferrals = referrals.filter(
    (r) =>
      r.status === 'active' ||
      r.status === 'outreach-sent' ||
      r.status === 'drip-1' ||
      r.status === 'drip-2',
  );
  const bookedReferrals = referrals.filter(
    (r) => r.status === 'booked' || r.appointmentBooked,
  );

  // Quick actions
  const handleDismiss = useCallback((actionId: string) => {
    dismissAction(actionId);
    setDismissedIds((prev) => new Set([...prev, actionId]));
  }, []);

  const handleSendPush = useCallback(
    async (item: ActionItem) => {
      if (!user || !item.pushData) return;
      setSendingPush(item.id);
      try {
        const token = await user.getIdToken();
        await fetch('/api/notifications/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            clientId: item.pushData.clientId,
            title: item.pushData.title,
            body: item.pushData.body,
            type: item.type === 'birthday-followup' ? 'birthday' : 'message',
          }),
        });
        handleDismiss(item.id);
      } catch (err) {
        console.error('Failed to send push:', err);
      } finally {
        setSendingPush(null);
      }
    },
    [user, handleDismiss],
  );

  if (loading) return null;

  const urgentCount = actionFeed.filter((a) => a.urgent).length;

  return (
    <div>
      {/* Welcome / Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#000000]">Dashboard</h1>
        <p className="text-[#707070] text-sm mt-1">
          Here&rsquo;s what needs your attention today.
        </p>
      </div>

      {!agentProfile.tipsSeen?.home && (
        <SectionTipCard onDismiss={() => dismissTip('home')}>
          This is your command center. Stats, action items, and summaries update in
          real time. Start by adding clients on the Clients page. Questions? Ask Patch
          in the bottom-right corner.
        </SectionTipCard>
      )}

      {/* ── Action Feed ─────────────────────────────────────────────── */}
      {actionFeed.length > 0 && (
        <div className="bg-white rounded-[5px] border border-[#d0d0d0] mb-6">
          <div className="px-5 py-4 border-b border-[#d0d0d0] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#000000]">Action Feed</h2>
              <p className="text-xs text-[#707070] mt-0.5">
                {actionFeed.length} item{actionFeed.length !== 1 ? 's' : ''} need
                {actionFeed.length === 1 ? 's' : ''} your attention
                {urgentCount > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-semibold">
                    {urgentCount} urgent
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="divide-y divide-[#f0f0f0]">
            {actionFeed.map((item) => {
              const cfg = ACTION_CONFIG[item.type] || ACTION_CONFIG['warm-list'];
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#f8f8f8] transition-colors"
                >
                  {/* Type badge */}
                  <div className={`w-10 h-10 rounded-[5px] flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.color}`}>
                    {cfg.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#000000] truncate">
                        {item.headline}
                      </p>
                      {item.urgent && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-full font-semibold shrink-0">
                          Urgent
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#707070] truncate">{item.reason}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] font-medium text-[#707070] uppercase tracking-wider">
                        {ACTION_TYPE_LABELS[item.type]}
                      </span>
                      {item.revenue != null && item.revenue > 0 && (
                        <span className="text-[10px] font-semibold text-[#005851]">
                          {formatCurrency(item.revenue)} APV at stake
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <ActionButtons
                      item={item}
                      router={router}
                      onDismiss={handleDismiss}
                      onSendPush={handleSendPush}
                      sendingPush={sendingPush}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Pipeline Health ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Referrals Pipeline */}
        <button
          onClick={() => router.push('/dashboard/referrals')}
          className="bg-white rounded-[5px] border border-[#d0d0d0] p-5 hover:border-[#45bcaa] transition-colors text-left"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#000000]">Referral Pipeline</h3>
            <svg className="w-4 h-4 text-[#d0d0d0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          {referrals.length === 0 ? (
            <p className="text-xs text-[#707070]">
              No referrals yet. When clients refer someone, they appear here.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 text-center">
                  <p className="text-xl font-bold text-[#000000]">
                    {referrals.filter((r) => r.status === 'pending' || r.status === 'outreach-sent').length}
                  </p>
                  <p className="text-[10px] text-[#707070]">Outreach</p>
                </div>
                <div className="w-px h-8 bg-[#d0d0d0]" />
                <div className="flex-1 text-center">
                  <p className="text-xl font-bold text-blue-600">{activeReferrals.length}</p>
                  <p className="text-[10px] text-[#707070]">Active</p>
                </div>
                <div className="w-px h-8 bg-[#d0d0d0]" />
                <div className="flex-1 text-center">
                  <p className="text-xl font-bold text-green-600">{bookedReferrals.length}</p>
                  <p className="text-[10px] text-[#707070]">Booked</p>
                </div>
              </div>
              <PipelineBar
                segments={[
                  { value: referrals.filter((r) => r.status === 'pending' || r.status === 'outreach-sent').length, color: 'bg-[#d0d0d0]' },
                  { value: activeReferrals.length, color: 'bg-blue-500' },
                  { value: bookedReferrals.length, color: 'bg-green-500' },
                ]}
              />
            </>
          )}
        </button>

        {/* Retention Status */}
        <button
          onClick={() => router.push('/dashboard/conservation')}
          className="bg-white rounded-[5px] border border-[#d0d0d0] p-5 hover:border-[#45bcaa] transition-colors text-left"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#000000]">Retention Status</h3>
            <svg className="w-4 h-4 text-[#d0d0d0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          {conservationAlerts.length === 0 ? (
            <p className="text-xs text-[#707070]">
              No at-risk policies. Lapse notices you paste in Retention appear here.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 text-center">
                  <p className={`text-xl font-bold ${activeConservation.length > 0 ? 'text-amber-600' : 'text-[#000000]'}`}>
                    {activeConservation.length}
                  </p>
                  <p className="text-[10px] text-[#707070]">Active</p>
                </div>
                <div className="w-px h-8 bg-[#d0d0d0]" />
                <div className="flex-1 text-center">
                  <p className={`text-xl font-bold ${chargebackCount > 0 ? 'text-red-600' : 'text-[#000000]'}`}>
                    {chargebackCount}
                  </p>
                  <p className="text-[10px] text-[#707070]">Chargeback</p>
                </div>
                <div className="w-px h-8 bg-[#d0d0d0]" />
                <div className="flex-1 text-center">
                  <p className="text-xl font-bold text-green-600">
                    {conservationAlerts.filter((a) => a.status === 'saved').length}
                  </p>
                  <p className="text-[10px] text-[#707070]">Saved</p>
                </div>
              </div>
              <PipelineBar
                segments={[
                  { value: activeConservation.length, color: 'bg-amber-500' },
                  { value: chargebackCount, color: 'bg-red-500' },
                  { value: conservationAlerts.filter((a) => a.status === 'saved').length, color: 'bg-green-500' },
                ]}
              />
            </>
          )}
        </button>

        {/* Touchpoints */}
        <button
          onClick={() => router.push('/dashboard/clients')}
          className="bg-white rounded-[5px] border border-[#d0d0d0] p-5 hover:border-[#45bcaa] transition-colors text-left"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#000000]">Touchpoints</h3>
            <svg className="w-4 h-4 text-[#d0d0d0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          {stats ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 text-center">
                  <p className="text-xl font-bold text-[#000000]">
                    {stats.touchpoints.holidayCardsSent}
                  </p>
                  <p className="text-[10px] text-[#707070]">Holiday</p>
                </div>
                <div className="w-px h-8 bg-[#d0d0d0]" />
                <div className="flex-1 text-center">
                  <p className="text-xl font-bold text-pink-600">
                    {stats.touchpoints.birthdayMessagesSent}
                  </p>
                  <p className="text-[10px] text-[#707070]">Birthday</p>
                </div>
                <div className="w-px h-8 bg-[#d0d0d0]" />
                <div className="flex-1 text-center">
                  <p className="text-xl font-bold text-amber-600">
                    {stats.touchpoints.anniversarySent}
                  </p>
                  <p className="text-[10px] text-[#707070]">Anniversary</p>
                </div>
              </div>
              <PipelineBar
                segments={[
                  { value: stats.touchpoints.holidayCardsSent, color: 'bg-green-500' },
                  { value: stats.touchpoints.birthdayMessagesSent, color: 'bg-pink-500' },
                  { value: stats.touchpoints.anniversarySent, color: 'bg-amber-500' },
                ]}
              />
            </>
          ) : (
            <p className="text-xs text-[#707070]">
              Touchpoint stats will appear as you send birthday, holiday, and anniversary
              messages.
            </p>
          )}
        </button>
      </div>

      {/* Empty state for brand new agents */}
      {clients.length === 0 && referrals.length === 0 && conservationAlerts.length === 0 && (
        <div className="mt-2 bg-white rounded-[5px] border border-[#d0d0d0] p-8 text-center">
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

function PipelineBar({ segments }: { segments: { value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;

  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-[#f0f0f0]">
      {segments.map((seg, i) =>
        seg.value > 0 ? (
          <div
            key={i}
            className={`${seg.color} transition-all duration-500`}
            style={{ width: `${(seg.value / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

function ActionButtons({
  item,
  router,
  onDismiss,
  onSendPush,
  sendingPush,
}: {
  item: ActionItem;
  router: ReturnType<typeof useRouter>;
  onDismiss: (id: string) => void;
  onSendPush: (item: ActionItem) => void;
  sendingPush: string | null;
}) {
  const btnBase = 'px-3 py-1.5 text-xs font-semibold rounded-[5px] transition-colors';

  switch (item.type) {
    case 'conservation':
      return (
        <button
          onClick={() => router.push('/dashboard/conservation')}
          className={`${btnBase} bg-[#44bbaa] hover:bg-[#005751] text-white`}
        >
          View Details
        </button>
      );

    case 'birthday-followup':
    case 'holiday-followup':
      return (
        <>
          {item.clientPhone && (
            <a
              href={`sms:${item.clientPhone}${item.smsBody ? `?body=${encodeURIComponent(item.smsBody)}` : ''}`}
              className={`${btnBase} bg-[#44bbaa] hover:bg-[#005751] text-white`}
            >
              Send Text
            </a>
          )}
          {item.pushData && (
            <button
              onClick={() => onSendPush(item)}
              disabled={sendingPush === item.id}
              className={`${btnBase} border border-[#d0d0d0] text-[#000000] hover:bg-[#f1f1f1] disabled:opacity-50`}
            >
              {sendingPush === item.id ? 'Sending...' : 'Send Push'}
            </button>
          )}
          <button
            onClick={() => onDismiss(item.id)}
            className={`${btnBase} text-[#707070] hover:text-[#000000] hover:bg-[#f1f1f1]`}
          >
            Dismiss
          </button>
        </>
      );

    case 'referral':
      return (
        <button
          onClick={() => router.push('/dashboard/referrals')}
          className={`${btnBase} bg-[#44bbaa] hover:bg-[#005751] text-white`}
        >
          View Conversation
        </button>
      );

    case 'anniversary-rewrite':
      return (
        <button
          onClick={() => router.push('/dashboard/clients')}
          className={`${btnBase} bg-[#44bbaa] hover:bg-[#005751] text-white`}
        >
          View Policy
        </button>
      );

    case 'warm-list':
      return (
        <>
          {item.clientPhone && (
            <a
              href={`tel:${item.clientPhone}`}
              className={`${btnBase} bg-[#44bbaa] hover:bg-[#005751] text-white`}
            >
              Call
            </a>
          )}
          {item.pushData && (
            <button
              onClick={() => onSendPush(item)}
              disabled={sendingPush === item.id}
              className={`${btnBase} border border-[#d0d0d0] text-[#000000] hover:bg-[#f1f1f1] disabled:opacity-50`}
            >
              {sendingPush === item.id ? 'Sending...' : 'Send Push'}
            </button>
          )}
          <button
            onClick={() => onDismiss(item.id)}
            className={`${btnBase} text-[#707070] hover:text-[#000000] hover:bg-[#f1f1f1]`}
          >
            Dismiss
          </button>
        </>
      );

    default:
      return (
        <button
          onClick={() => router.push(item.route)}
          className={`${btnBase} bg-[#44bbaa] hover:bg-[#005751] text-white`}
        >
          View
        </button>
      );
  }
}
