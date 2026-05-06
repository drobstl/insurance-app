'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { useMobilePWA } from '../../../lib/use-mobile-pwa';
import type { ActionItemDoc } from '../../../lib/action-item-types';

/**
 * Phase 1 Track B — Welcomes queue page.
 *
 * SOURCE OF TRUTH: CONTEXT.md > Channel Rules > Agent action item
 * surface, > Phase 1 implementation constraints, > The two-step
 * welcome flow.
 *
 * - Mobile installed PWA: shows the welcome queue and the
 *   "Send from my phone" one-tap on each card.
 * - Desktop / non-installed mobile browser: shows the same queue
 *   read-only with an explicit "Open AFL on your phone to send"
 *   affordance per card and a banner at the top of the page.
 *
 * Layout: items grouped by date created (oldest first per Daniel's
 * locked Q2 — "list grouped by date created (oldest first)"). Within
 * each day group, individual cards age-shift their styling per the
 * subtle-color-shift variant chosen up-front. The dashboard nav badge
 * shows the count of items >7d old.
 */

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

function dayKeyForSort(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  // Bucket to UTC day so all items created on the same day land in one
  // group regardless of agent timezone display nuances.
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return utc;
}

export default function WelcomesPage() {
  const { user } = useDashboard();
  const { isMobileViewport, isStandalonePWA, canSendFromPhone } = useMobilePWA();
  const [items, setItems] = useState<ActionItemDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const ref = collection(db, 'agents', user.uid, 'actionItems');
    const q = query(
      ref,
      where('lane', '==', 'welcome'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => d.data() as ActionItemDoc);
        setItems(next);
        setLoaded(true);
      },
      (err) => {
        console.error('[welcomes-page] subscription failed', err);
        setError(err.message || 'Could not load welcome queue.');
        setLoaded(true);
      },
    );
    return () => unsub();
  }, [user]);

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

  // Hold a stable "now" value in state, refreshed every minute via
  // setState inside a setInterval callback (which is the
  // set-state-in-effect-allowed pattern — async updates from external
  // sources are fine; the lint only flags synchronous setState in the
  // effect body). Lazy initial value reads Date.now() once on mount
  // without the impure-render lint.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const totalCount = items.length;
  const overdueCount = items.reduce((acc, it) => {
    const ms = Date.parse(it.createdAt);
    if (!Number.isFinite(ms)) return acc;
    return (nowMs - ms) >= 7 * 24 * 60 * 60 * 1000 ? acc + 1 : acc;
  }, 0);

  const showDesktopReadonlyBanner = !canSendFromPhone;

  return (
    <div className="min-h-screen pt-16 pb-24 md:pt-6 md:pb-10 md:ml-56 md:mr-[300px] px-4 md:px-8">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-[#0D4D4D]">Welcomes</h1>
        <p className="text-sm text-[#4f4f4f] mt-1">
          Send your client&apos;s welcome text from your phone — that&apos;s how the AFL welcome flow works.
        </p>
      </header>

      {showDesktopReadonlyBanner ? (
        <div className="mb-4 rounded-xl border-2 border-[#0D4D4D]/20 bg-[#0D4D4D] text-white px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold">Open AFL on your phone to send.</p>
          <p className="text-[12px] text-white/85 mt-1 leading-snug">
            Welcome texts come from your personal phone via one-tap iMessage. We don&apos;t support sending from desktop.
            {' '}
            {!isStandalonePWA ? 'On your phone, install AFL to your home screen, then open the Welcomes tab here.' : null}
            {isMobileViewport && !isStandalonePWA ? ' (Tap your browser\'s Add to Home Screen.)' : ''}
          </p>
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#5f5f5f]">
          {totalCount === 0 ? 'No pending welcomes' : `${totalCount} pending`}
          {overdueCount > 0 ? ` · ${overdueCount} over 7 days` : ''}
        </p>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-[#f3a8a8] bg-[#fff5f5] px-3 py-2 text-xs font-semibold text-[#b42318]">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <p className="text-sm text-[#5f5f5f]">Loading…</p>
      ) : totalCount === 0 ? (
        <div className="rounded-xl border border-dashed border-[#cdcdcd] bg-[#fafafa] px-4 py-8 text-center">
          <p className="text-sm font-semibold text-[#0D4D4D]">You&apos;re all caught up.</p>
          <p className="mt-1 text-xs text-[#5f5f5f]">
            New welcomes appear here the moment you create a client profile.
          </p>
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
                {group.items.map((item) => (
                  <WelcomeActionItemCard
                    key={item.itemId}
                    item={item}
                    user={user}
                    canSendFromPhone={canSendFromPhone}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
