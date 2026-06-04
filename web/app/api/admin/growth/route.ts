import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';

/**
 * /api/admin/growth — founder growth visibility (admin-only).
 *
 *   GET                → full snapshot (composition + signup counts +
 *                        recent signups + unread count).
 *   GET ?countOnly=1   → just { unreadCount } (drives the nav badge).
 *   POST               → mark the growth feed viewed (clears the badge).
 *
 * Admin-gated via NEXT_PUBLIC_ADMIN_EMAILS. All reads go through the Admin
 * SDK, so `adminSignupEvents` / `adminSettings` stay default-deny to
 * clients — no Firestore rules change needed.
 */

async function requireAdminUid(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  const decoded = await getAdminAuth().verifyIdToken(token);
  if (!isAdminEmail(decoded.email)) return null;
  return decoded.uid;
}

function toMillis(v: unknown): number {
  return v && typeof (v as Timestamp).toMillis === 'function' ? (v as Timestamp).toMillis() : 0;
}

/**
 * Map of uid -> last-active epoch ms, from Firebase Auth sign-in metadata.
 * `lastSignInTime` is the canonical "last logged in"; `lastRefreshTime`
 * (token refresh, present on newer SDKs) is a finer signal when available.
 */
async function buildLastActiveMap(): Promise<Map<string, number>> {
  const auth = getAdminAuth();
  const map = new Map<string, number>();
  let pageToken: string | undefined;
  do {
    const res = await auth.listUsers(1000, pageToken);
    for (const u of res.users) {
      const meta = u.metadata as { lastSignInTime?: string | null; lastRefreshTime?: string | null };
      const signIn = meta.lastSignInTime ? Date.parse(meta.lastSignInTime) : 0;
      const refresh = meta.lastRefreshTime ? Date.parse(meta.lastRefreshTime) : 0;
      const last = Math.max(Number.isNaN(signIn) ? 0 : signIn, Number.isNaN(refresh) ? 0 : refresh);
      if (last > 0) map.set(u.uid, last);
    }
    pageToken = res.pageToken;
  } while (pageToken);
  return map;
}

export async function GET(req: NextRequest) {
  try {
    const uid = await requireAdminUid(req);
    if (!uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = getAdminFirestore();

    const settingsSnap = await db.collection('adminSettings').doc(uid).get();
    const lastViewedMs = toMillis(settingsSnap.data()?.growthLastViewedAt);

    const eventsSnap = await db
      .collection('adminSignupEvents')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const events = eventsSnap.docs.map((d) => {
      const data = d.data();
      return {
        uid: typeof data.uid === 'string' ? data.uid : d.id,
        name: typeof data.name === 'string' ? data.name : null,
        email: typeof data.email === 'string' ? data.email : null,
        membershipTier: typeof data.membershipTier === 'string' ? data.membershipTier : null,
        referredByAgent: typeof data.referredByAgent === 'string' ? data.referredByAgent : null,
        source: typeof data.source === 'string' ? data.source : null,
        createdAtMs: toMillis(data.createdAt),
      };
    });

    const unreadCount = events.filter((e) => e.createdAtMs > lastViewedMs).length;

    if (req.nextUrl.searchParams.get('countOnly') === '1') {
      return NextResponse.json({ unreadCount });
    }

    const lastActiveByUid = await buildLastActiveMap();
    const agentsSnap = await db.collection('agents').get();
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    let total = 0;
    let paying = 0;
    let trial = 0;
    let founding = 0;
    let onboarded = 0;
    let new7 = 0;
    let new30 = 0;
    let active7 = 0;
    let active30 = 0;
    const byTier: Record<string, number> = {};
    const agents: Array<{
      uid: string;
      name: string | null;
      email: string | null;
      membershipTier: string;
      subscriptionStatus: string | null;
      createdAtMs: number;
      lastActiveMs: number;
    }> = [];

    for (const doc of agentsSnap.docs) {
      const a = doc.data();
      total += 1;
      const tier = typeof a.membershipTier === 'string' ? a.membershipTier : 'unknown';
      byTier[tier] = (byTier[tier] ?? 0) + 1;
      if (a.subscriptionStatus === 'active') paying += 1;
      if (tier === 'trial') trial += 1;
      if (tier === 'founding' || a.isFoundingMember === true) founding += 1;
      if (a.onboardingComplete === true) onboarded += 1;
      const createdMs = toMillis(a.createdAt);
      if (createdMs > 0) {
        if (now - createdMs <= 7 * DAY) new7 += 1;
        if (now - createdMs <= 30 * DAY) new30 += 1;
      }
      const lastActiveMs = lastActiveByUid.get(doc.id) ?? 0;
      if (lastActiveMs > 0) {
        if (now - lastActiveMs <= 7 * DAY) active7 += 1;
        if (now - lastActiveMs <= 30 * DAY) active30 += 1;
      }
      agents.push({
        uid: doc.id,
        name: typeof a.name === 'string' ? a.name : null,
        email: typeof a.email === 'string' ? a.email : null,
        membershipTier: tier,
        subscriptionStatus: typeof a.subscriptionStatus === 'string' ? a.subscriptionStatus : null,
        createdAtMs: createdMs,
        lastActiveMs,
      });
    }

    // Most-recently-active first; dormant / never-active fall to the bottom.
    agents.sort((x, y) => y.lastActiveMs - x.lastActiveMs);

    return NextResponse.json({
      unreadCount,
      totals: { total, paying, trial, founding, onboarded, new7, new30, active7, active30, byTier },
      recentSignups: events.slice(0, 25),
      agents: agents.slice(0, 200),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Firebase ID token')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[admin/growth] GET failed', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await requireAdminUid(req);
    if (!uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = getAdminFirestore();
    await db
      .collection('adminSettings')
      .doc(uid)
      .set({ growthLastViewedAt: FieldValue.serverTimestamp() }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Firebase ID token')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[admin/growth] POST failed', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
