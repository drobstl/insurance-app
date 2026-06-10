import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';
import { computeAPV } from '../../../../lib/apv';

/**
 * /api/admin/performance — system-wide production visibility (admin-only).
 *
 * Unlike `/dashboard/admin/stats` (which shows only the signed-in agent's
 * own `stats/aggregates`) and `/api/admin/growth` (which is acquisition:
 * signups, tiers, login activity), this endpoint rolls PRODUCTION up across
 * every agent: how much APV is being saved / rewritten / referred company-
 * wide, a per-agent leaderboard, and a live "recent wins" feed
 * ("Ashley saved Tandeka Jones's policy").
 *
 *   GET → { totals, statsUpdatedAtMs, perAgent[], recentActivity[] }
 *
 * Totals + per-agent come from the daily `stats/aggregates` docs (computed
 * by the 6 AM UTC cron). The recent-wins feed reads the underlying event
 * docs live, so a save shows up the moment an agent marks it — even before
 * the next nightly rollup moves the headline totals.
 *
 * Admin-gated via NEXT_PUBLIC_ADMIN_EMAILS; all reads use the Admin SDK.
 */

export const maxDuration = 60;

const RECENT_LIMIT = 40;

type ActivityType = 'save' | 'rewrite' | 'referral';

interface ActivityItem {
  id: string;
  type: ActivityType;
  agentUid: string;
  agentName: string;
  clientName: string;
  apv: number;
  timestampMs: number;
  carrier: string | null;
  detail: string | null;
}

interface PerAgentRow {
  uid: string;
  name: string;
  totalApv: number;
  savedCount: number;
  savedApv: number;
  rewriteCount: number;
  rewriteApv: number;
  referralTotal: number;
  referralApv: number;
}

async function requireAdminUid(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  const decoded = await getAdminAuth().verifyIdToken(token);
  if (!isAdminEmail(decoded.email)) return null;
  return decoded.uid;
}

/**
 * Coerce Firestore timestamps to epoch ms. Save events stamp ISO strings
 * (`resolvedAt`), rewrites stamp a server `Timestamp` (`updatedAt`), and
 * `createdAt` can be either — so we handle all shapes defensively.
 */
function toMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof v === 'object') {
    const c = v as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof c.toMillis === 'function') return c.toMillis();
    const seconds = typeof c.seconds === 'number' ? c.seconds : c._seconds;
    if (typeof seconds === 'number') return seconds * 1000;
  }
  return 0;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export async function GET(req: NextRequest) {
  try {
    const uid = await requireAdminUid(req);
    if (!uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = getAdminFirestore();

    // ── Agent uid → display name ──────────────────────────────
    const agentsSnap = await db.collection('agents').get();
    const agentName = new Map<string, string>();
    for (const d of agentsSnap.docs) {
      const a = d.data();
      agentName.set(d.id, str(a.name) ?? str(a.email) ?? d.id);
    }
    const nameFor = (id: string | undefined): string =>
      (id && agentName.get(id)) || id || 'Unknown agent';

    // ── Company totals + per-agent leaderboard (daily aggregates) ──
    // `collectionGroup('stats')` returns every agent's `aggregates` doc in
    // one read. We guard on the path so we only pick up agents/*/stats/*.
    const statsSnap = await db.collectionGroup('stats').get();

    let totalApv = 0;
    let savedApv = 0;
    let savedCount = 0;
    let rewriteApv = 0;
    let rewriteCount = 0;
    let referralApv = 0;
    let referralTotal = 0;
    let clientsFromReferrals = 0;
    let touchpoints = 0;
    let statsUpdatedAtMs = 0;
    const perAgent: PerAgentRow[] = [];

    for (const doc of statsSnap.docs) {
      if (doc.id !== 'aggregates') continue;
      const agentDoc = doc.ref.parent.parent;
      if (!agentDoc || agentDoc.parent.id !== 'agents') continue;

      const a = doc.data() as Record<string, unknown>;
      const saved = (a.savedPolicies as { count?: number; apv?: number }) ?? {};
      const rewrite = (a.successfulRewrites as { count?: number; apv?: number }) ?? {};
      const refs = (a.referrals as { total?: number }) ?? {};
      const tp = (a.touchpoints as { total?: number }) ?? {};

      const aSavedApv = num(saved.apv) ?? 0;
      const aSavedCount = num(saved.count) ?? 0;
      const aRewriteApv = num(rewrite.apv) ?? 0;
      const aRewriteCount = num(rewrite.count) ?? 0;
      const aReferralApv = num(a.referralApv) ?? 0;
      const aReferralTotal = num(refs.total) ?? 0;
      const aTotalApv = num(a.totalApv) ?? aSavedApv + aRewriteApv + aReferralApv;

      savedApv += aSavedApv;
      savedCount += aSavedCount;
      rewriteApv += aRewriteApv;
      rewriteCount += aRewriteCount;
      referralApv += aReferralApv;
      referralTotal += aReferralTotal;
      clientsFromReferrals += num(a.clientsFromReferrals) ?? 0;
      touchpoints += num(tp.total) ?? 0;
      totalApv += aTotalApv;
      statsUpdatedAtMs = Math.max(statsUpdatedAtMs, toMillis(a.updatedAt));

      perAgent.push({
        uid: agentDoc.id,
        name: nameFor(agentDoc.id),
        totalApv: aTotalApv,
        savedCount: aSavedCount,
        savedApv: aSavedApv,
        rewriteCount: aRewriteCount,
        rewriteApv: aRewriteApv,
        referralTotal: aReferralTotal,
        referralApv: aReferralApv,
      });
    }

    perAgent.sort((x, y) => y.totalApv - x.totalApv);

    // ── Live recent-wins feed ─────────────────────────────────
    // Bare collectionGroup reads (no where/orderBy ⇒ no composite index
    // needed); we filter to the "win" status and sort newest-first in
    // memory. Fine at current cohort scale; the scale path is an
    // index-backed `.where(status).orderBy(ts).limit()` per collection.
    const [savesSnap, rewritesSnap, referralsSnap] = await Promise.all([
      db.collectionGroup('conservationAlerts').get(),
      db.collectionGroup('policyReviews').get(),
      db.collectionGroup('referrals').get(),
    ]);

    const activity: ActivityItem[] = [];

    for (const doc of savesSnap.docs) {
      const d = doc.data();
      if (d.status !== 'saved') continue;
      const agentUid = doc.ref.parent.parent?.id;
      if (!agentUid) continue;
      activity.push({
        id: doc.id,
        type: 'save',
        agentUid,
        agentName: nameFor(agentUid),
        clientName: str(d.clientName) ?? 'a client',
        // Match the aggregation's methodology (premiumAmount, default monthly).
        apv: computeAPV(num(d.premiumAmount)),
        timestampMs: toMillis(d.resolvedAt) || toMillis(d.campaignEndedAt) || toMillis(d.createdAt),
        carrier: str(d.carrier),
        detail: str(d.policyType),
      });
    }

    for (const doc of rewritesSnap.docs) {
      const d = doc.data();
      if (d.status !== 'booked') continue;
      const agentUid = doc.ref.parent.parent?.id;
      if (!agentUid) continue;
      activity.push({
        id: doc.id,
        type: 'rewrite',
        agentUid,
        agentName: nameFor(agentUid),
        clientName: str(d.clientName) ?? str(d.name) ?? 'a client',
        apv: computeAPV(num(d.premiumAmount)),
        timestampMs: toMillis(d.updatedAt) || toMillis(d.bookedAt) || toMillis(d.resolvedAt) || toMillis(d.createdAt),
        carrier: str(d.carrier),
        detail: str(d.policyType),
      });
    }

    for (const doc of referralsSnap.docs) {
      const d = doc.data();
      const booked = d.status === 'booked' || d.appointmentBooked === true;
      if (!booked) continue;
      const agentUid = doc.ref.parent.parent?.id;
      if (!agentUid) continue;
      activity.push({
        id: doc.id,
        type: 'referral',
        agentUid,
        agentName: nameFor(agentUid),
        clientName: str(d.clientName) ?? str(d.name) ?? 'a referral',
        // Referral APV is policy-derived (computed in the rollup), not on
        // the referral doc — leave the per-event figure at 0.
        apv: 0,
        timestampMs: toMillis(d.bookedAt) || toMillis(d.updatedAt) || toMillis(d.createdAt),
        carrier: null,
        detail: null,
      });
    }

    activity.sort((a, b) => b.timestampMs - a.timestampMs);

    return NextResponse.json({
      totals: {
        totalApv,
        savedApv,
        savedCount,
        rewriteApv,
        rewriteCount,
        referralApv,
        referralTotal,
        clientsFromReferrals,
        touchpoints,
        agentsWithStats: perAgent.length,
        totalAgents: agentsSnap.size,
      },
      statsUpdatedAtMs: statsUpdatedAtMs || null,
      perAgent: perAgent.slice(0, 200),
      recentActivity: activity.slice(0, RECENT_LIMIT),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Firebase ID token')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[admin/performance] GET failed', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
