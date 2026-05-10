import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import {
  classifyLineHealth,
  DEFAULT_THRESHOLDS,
  type LineHealthLane,
  type LineHealthMetrics,
  type LineHealthSnapshot,
  type LineHealthThresholds,
  type LineHealthTier,
} from './line-health-shared';

// Re-export so existing imports of these names from `./line-health`
// keep working — the split between this server-only module and
// `./line-health-shared` is a Next.js bundling concern, not a public
// API change.
export {
  classifyLineHealth,
  DEFAULT_THRESHOLDS,
  TIER_DISPLAY,
  type LineHealthLane,
  type LineHealthMetrics,
  type LineHealthSnapshot,
  type LineHealthThresholds,
  type LineHealthTier,
  type TierDisplay,
} from './line-health-shared';

/**
 * Linq line health — server-only implementation (counters,
 * Firestore reads, manual override writes).
 *
 * Pairs with `web/lib/line-health-shared.ts` for types and the
 * pure classifier. The shared module is safe to import from client
 * components; this server module is not.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > KPI Tier System +
 * `docs/AFL_Messaging_Operating_Model_v3.1.md` §6 +
 * Linq partner guide screenshots (May 10, 2026).
 *
 * Phase A (May 10, 2026) — visibility only. Counters increment on
 * every Linq-line outbound + inbound; the admin widget reads them
 * and classifies the line into a tier; no auto-throttle enforcement
 * yet. Phase B wires the tier into outbound gates.
 */

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rollingDayKeys(now: Date, days: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    keys.push(dayKey(d));
  }
  return keys;
}

const ROLLING_WINDOW_DAYS = 7;

// ─────────────────────────────────────────────
// Increment hooks (called from linq.ts + webhook)
// ─────────────────────────────────────────────

interface DailyCounterDoc {
  outboundCount?: number;
  inboundCount?: number;
  newConversationCount?: number;
  outboundByLane?: Partial<Record<LineHealthLane, number>>;
}

function dailyDocRef(
  db: FirebaseFirestore.Firestore,
  day: string,
): FirebaseFirestore.DocumentReference {
  return db.collection('lineHealth').doc(`daily_${day}`);
}

/**
 * Record a Linq-line outbound. Called from `linq.ts` chokepoints
 * (`createChat`, `sendMessage`) after successful send. Fire-and-
 * forget — counter increment failures never block the actual send.
 *
 * `isNewConversation` distinguishes `createChat` (new thread) from
 * `sendMessage` (reply within existing thread). Both count toward
 * `outboundCount` for reply-rate calculation, but `createChat` also
 * increments `newConversationCount` since that's Linq's 50/day cap.
 */
export async function recordLinqOutbound(params: {
  db: FirebaseFirestore.Firestore;
  isNewConversation: boolean;
  lane?: LineHealthLane;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  const day = dayKey(now);
  const ref = dailyDocRef(params.db, day);
  const lane = params.lane ?? 'unknown';
  const updates: Record<string, unknown> = {
    outboundCount: FieldValue.increment(1),
    [`outboundByLane.${lane}`]: FieldValue.increment(1),
    lastUpdatedAt: FieldValue.serverTimestamp(),
  };
  if (params.isNewConversation) {
    updates.newConversationCount = FieldValue.increment(1);
  }
  try {
    await ref.set(updates, { merge: true });
  } catch (err) {
    console.warn('[line-health] recordLinqOutbound failed (non-blocking)', {
      day,
      lane,
      isNewConversation: params.isNewConversation,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Record a Linq-line inbound (incoming reply from a recipient).
 * Called from the Linq webhook handler when a message lands.
 */
export async function recordLinqInbound(params: {
  db: FirebaseFirestore.Firestore;
  lane?: LineHealthLane;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  const day = dayKey(now);
  const ref = dailyDocRef(params.db, day);
  try {
    await ref.set(
      {
        inboundCount: FieldValue.increment(1),
        lastUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn('[line-health] recordLinqInbound failed (non-blocking)', {
      day,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  void params.lane; // reserved for future per-lane inbound breakdowns
}

// ─────────────────────────────────────────────
// Read + classify
// ─────────────────────────────────────────────

interface ManualOverrideDoc {
  tier: LineHealthTier | null;
  reason: string | null;
  setBy: string | null;
  setAt: string | null;
}

function manualOverrideRef(db: FirebaseFirestore.Firestore) {
  return db.collection('lineHealth').doc('manualOverride');
}

/**
 * Read the 7-day rolling counters + manual override and return a
 * full snapshot. Used by the admin widget read API.
 */
export async function getLineHealthSnapshot(params: {
  db: FirebaseFirestore.Firestore;
  thresholds?: LineHealthThresholds;
  now?: Date;
}): Promise<LineHealthSnapshot> {
  const now = params.now ?? new Date();
  const thresholds = params.thresholds ?? DEFAULT_THRESHOLDS;
  const todayKey = dayKey(now);
  const windowKeys = rollingDayKeys(now, ROLLING_WINDOW_DAYS);

  const refs = windowKeys.map((k) => dailyDocRef(params.db, k));
  const [overrideSnap, ...daySnaps] = await Promise.all([
    manualOverrideRef(params.db).get(),
    ...refs.map((r) => r.get()),
  ]);

  let outboundCount = 0;
  let inboundCount = 0;
  let newConversationCount = 0;
  let outboundToday = 0;
  let inboundToday = 0;
  const outboundByLane: Partial<Record<LineHealthLane, number>> = {};

  for (const snap of daySnaps) {
    if (!snap.exists) continue;
    const data = snap.data() as DailyCounterDoc;
    const obs = data.outboundCount ?? 0;
    const ibs = data.inboundCount ?? 0;
    const nc = data.newConversationCount ?? 0;
    outboundCount += obs;
    inboundCount += ibs;
    newConversationCount += nc;
    if (snap.id === `daily_${todayKey}`) {
      outboundToday = obs;
      inboundToday = ibs;
    }
    if (data.outboundByLane) {
      for (const [lane, count] of Object.entries(data.outboundByLane)) {
        if (typeof count !== 'number') continue;
        const k = lane as LineHealthLane;
        outboundByLane[k] = (outboundByLane[k] ?? 0) + count;
      }
    }
  }

  const replyRate = outboundCount > 0 ? inboundCount / outboundCount : 0;

  const metrics: LineHealthMetrics = {
    outboundCount,
    inboundCount,
    newConversationCount,
    replyRate,
    outboundToday,
    inboundToday,
    outboundByLane,
    computedAt: now.toISOString(),
  };

  const autoTier = classifyLineHealth(metrics, thresholds);

  const override = overrideSnap.exists
    ? (overrideSnap.data() as ManualOverrideDoc)
    : null;
  const manualTier = override?.tier ?? null;

  const effectiveTier: LineHealthTier =
    manualTier !== null && manualTier > autoTier ? manualTier : autoTier;

  return {
    metrics,
    autoTier,
    manualTier,
    manualOverrideReason: override?.reason ?? null,
    manualOverrideSetBy: override?.setBy ?? null,
    manualOverrideSetAt: override?.setAt ?? null,
    effectiveTier,
  };
}

/**
 * Set or clear the manual override tier. Setting `tier: null` clears
 * the override and lets the auto-computed tier take over.
 */
export async function setManualOverride(params: {
  db: FirebaseFirestore.Firestore;
  tier: LineHealthTier | null;
  reason: string | null;
  setBy: string;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  const ref = manualOverrideRef(params.db);
  if (params.tier === null) {
    await ref.set(
      {
        tier: null,
        reason: null,
        setBy: params.setBy,
        setAt: now.toISOString(),
        clearedAt: now.toISOString(),
      },
      { merge: true },
    );
  } else {
    await ref.set(
      {
        tier: params.tier,
        reason: params.reason,
        setBy: params.setBy,
        setAt: now.toISOString(),
      },
      { merge: true },
    );
  }
}
