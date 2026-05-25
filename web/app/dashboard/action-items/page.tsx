'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';
import WelcomeActionItemCard from '../../../components/WelcomeActionItemCard';
import RetentionCallActionItemCard from '../../../components/RetentionCallActionItemCard';
import RetentionTextActionItemCard from '../../../components/RetentionTextActionItemCard';
import AnniversaryReferralActionItemCard from '../../../components/AnniversaryReferralActionItemCard';
import AppointmentOutcomeActionItemCard from '../../../components/AppointmentOutcomeActionItemCard';
import UpcomingAppointmentsCard from '../../../components/UpcomingAppointmentsCard';
import type {
  ActionItemDoc,
  ActionItemLane,
} from '../../../lib/action-item-types';

/**
 * Cross-lane action items queue.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > `Channel Rules` > Agent action item
 * surface. Replaces the welcome-only `/dashboard/welcomes` page with a
 * single tabbed surface across all four lanes (welcome, anniversary,
 * retention, referral). The legacy `/dashboard/welcomes` route remains
 * as a redirect to `?lane=welcome` so existing callsites and bookmarks
 * keep working.
 *
 * Each lane subscribes to `actionItems` filtered by lane + status
 * pending. Tab counts update live via the same snapshot. Cards are
 * lane-specific so the per-lane vocabulary (welcome: text only;
 * anniversary/referral: call+text+skip; retention: separate call card
 * and text card per stage) stays visually correct.
 */

// Lane order on the tab strip. Outcome lane sits after Welcome since
// both are most-active "things you do today" surfaces — Welcome for
// new clients, Outcome for yesterday's meetings. Retention / anniversary
// / referral come after because they're slower-moving.
const LANE_ORDER: ActionItemLane[] = ['welcome', 'appointment_outcome', 'retention', 'anniversary', 'referral'];

const LANE_LABEL: Record<ActionItemLane, string> = {
  welcome: 'Welcomes',
  appointment_outcome: 'Meeting outcomes',
  retention: 'Retention',
  anniversary: 'Anniversary',
  referral: 'Referrals',
};

const LANE_SUBTITLE: Record<ActionItemLane, string> = {
  welcome: 'New clients waiting for their first text. Send from any device.',
  appointment_outcome: 'Meetings from the past day that need an outcome marked — keeps your book/show/close rates accurate.',
  retention: 'At-risk clients where automated touches went unanswered. Time to call or text personally.',
  anniversary: 'Anniversary check-ins where push delivery failed. Reach out personally.',
  referral: 'Warm referrals where the AI conversation went quiet. Your turn to follow up.',
};

const LANE_EMPTY_TITLE: Record<ActionItemLane, string> = {
  welcome: "You're all caught up.",
  appointment_outcome: 'No meetings need an outcome.',
  retention: 'No retention items.',
  anniversary: 'No anniversary items.',
  referral: 'No referral items.',
};

const LANE_EMPTY_BODY: Record<ActionItemLane, string> = {
  welcome: 'New welcomes appear here the moment you create a client profile.',
  appointment_outcome: 'Items appear the day after a booked meeting if you haven\'t marked the outcome (showed-no-sale, no-show, etc.). Marking outcomes here keeps your show rate and close rate honest.',
  retention: 'Items appear when a retention campaign reaches the call or text stage.',
  anniversary: 'Items appear when a push send fails for an anniversary check-in.',
  referral: 'Items appear 24h after a referral drip goes unanswered.',
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function dayKeyForSort(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return utc;
}

function isLane(value: string | null): value is ActionItemLane {
  return (
    value === 'welcome' ||
    value === 'retention' ||
    value === 'anniversary' ||
    value === 'referral' ||
    value === 'appointment_outcome'
  );
}

function isRetentionCall(item: ActionItemDoc): boolean {
  return item.itemId.endsWith('_call');
}

function isRetentionText(item: ActionItemDoc): boolean {
  return item.itemId.endsWith('_text');
}

function ActionItemsPageInner() {
  const { user, agentProfile } = useDashboard();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialLane: ActionItemLane = (() => {
    const fromQuery = searchParams.get('lane');
    return isLane(fromQuery) ? fromQuery : 'welcome';
  })();
  const [activeLane, setActiveLane] = useState<ActionItemLane>(initialLane);

  // Per-lane buckets of pending items. Each lane has its own snapshot
  // so the tab badges update live without a single combined query.
  const [itemsByLane, setItemsByLane] = useState<Record<ActionItemLane, ActionItemDoc[]>>({
    welcome: [],
    retention: [],
    anniversary: [],
    referral: [],
    appointment_outcome: [],
  });
  const [loaded, setLoaded] = useState<Record<ActionItemLane, boolean>>({
    welcome: false,
    retention: false,
    anniversary: false,
    referral: false,
    appointment_outcome: false,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubs: Array<() => void> = [];
    for (const lane of LANE_ORDER) {
      const ref = collection(db, 'agents', user.uid, 'actionItems');
      const q = query(
        ref,
        where('lane', '==', lane),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'asc'),
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          const next = snap.docs.map((d) => d.data() as ActionItemDoc);
          setItemsByLane((prev) => ({ ...prev, [lane]: next }));
          setLoaded((prev) => ({ ...prev, [lane]: true }));
        },
        (err) => {
          console.error(`[action-items-page] ${lane} subscription failed`, err);
          setError(err.message || `Could not load ${lane} queue.`);
          setLoaded((prev) => ({ ...prev, [lane]: true }));
        },
      );
      unsubs.push(unsub);
    }
    return () => {
      for (const u of unsubs) u();
    };
  }, [user]);

  const setLane = (lane: ActionItemLane) => {
    setActiveLane(lane);
    const next = new URLSearchParams(searchParams.toString());
    next.set('lane', lane);
    router.replace(`/dashboard/action-items?${next.toString()}`, { scroll: false });
  };

  const items = itemsByLane[activeLane];
  const groups = useMemo(() => {
    const byDay = new Map<number, { label: string; items: ActionItemDoc[] }>();
    for (const item of items) {
      const sortKey = dayKeyForSort(item.createdAt);
      const label = dayKey(item.createdAt);
      const bucket = byDay.get(sortKey) || { label, items: [] };
      bucket.items.push(item);
      byDay.set(sortKey, bucket);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([sortKey, bucket]) => ({ sortKey, ...bucket }));
  }, [items]);

  const renderCard = (item: ActionItemDoc) => {
    if (item.lane === 'welcome') {
      return <WelcomeActionItemCard key={item.itemId} item={item} user={user} />;
    }
    if (item.lane === 'appointment_outcome') {
      return <AppointmentOutcomeActionItemCard key={item.itemId} item={item} user={user} />;
    }
    if (item.lane === 'retention') {
      if (isRetentionCall(item)) {
        return <RetentionCallActionItemCard key={item.itemId} item={item} user={user} />;
      }
      if (isRetentionText(item)) {
        return <RetentionTextActionItemCard key={item.itemId} item={item} user={user} />;
      }
      // Defensive: a retention item without a recognized suffix
      // shouldn't exist (writer guarantees the suffix), but render
      // something rather than nothing if it does.
      return <RetentionCallActionItemCard key={item.itemId} item={item} user={user} />;
    }
    return <AnniversaryReferralActionItemCard key={item.itemId} item={item} user={user} />;
  };

  return (
    <div className="min-h-screen pt-16 pb-24 md:pt-6 md:pb-10 md:ml-56 md:mr-[300px] px-4 md:px-8">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-[#0D4D4D]">Action Items</h1>
        <p className="text-sm text-[#4f4f4f] mt-1">{LANE_SUBTITLE[activeLane]}</p>
      </header>

      {/* Upcoming Appointments (Chunk 4f). Sits ABOVE the lane tabs
          because appointment reminders are time-sensitive — agents
          should see them whether or not they're on the right lane.
          Renders nothing when there are no upcoming appointments in
          the next 24h, so it doesn't add clutter for agents who
          haven't booked any. */}
      <UpcomingAppointmentsCard
        user={user}
        agentName={agentProfile.name || ''}
        agentBusinessCardBase64={agentProfile.businessCardBase64}
        licenses={agentProfile.licenses || {}}
      />

      <div className="mb-4 -mx-1 flex items-center gap-1 overflow-x-auto">
        {LANE_ORDER.map((lane) => {
          const count = itemsByLane[lane].length;
          const isActive = lane === activeLane;
          return (
            <button
              key={lane}
              type="button"
              onClick={() => setLane(lane)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                isActive
                  ? 'bg-[#0D4D4D] text-white shadow-sm'
                  : 'bg-white text-[#0D4D4D] border border-[#d0d0d0] hover:bg-gray-50'
              }`}
            >
              <span>{LANE_LABEL[lane]}</span>
              {count > 0 ? (
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-bold ${
                    isActive ? 'bg-white text-[#0D4D4D]' : 'bg-[#3DD6C3] text-[#0D4D4D]'
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-[#f3a8a8] bg-[#fff5f5] px-3 py-2 text-xs font-semibold text-[#b42318]">
          {error}
        </p>
      ) : null}

      {!loaded[activeLane] ? (
        <p className="text-sm text-[#5f5f5f]">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#cdcdcd] bg-[#fafafa] px-4 py-8 text-center">
          <p className="text-sm font-semibold text-[#0D4D4D]">{LANE_EMPTY_TITLE[activeLane]}</p>
          <p className="mt-1 text-xs text-[#5f5f5f]">{LANE_EMPTY_BODY[activeLane]}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.sortKey}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#0D4D4D]/70">
                {group.label}
                <span className="ml-2 font-medium text-[#5f5f5f]">({group.items.length})</span>
              </h2>
              <div className="space-y-3">
                {group.items.map((item) => renderCard(item))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ActionItemsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-16 md:pt-6 px-4"><p className="text-sm text-[#5f5f5f]">Loading…</p></div>}>
      <ActionItemsPageInner />
    </Suspense>
  );
}
