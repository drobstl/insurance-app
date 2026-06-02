import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * POST /api/trial/stay-free
 *
 * Entry-mechanism cutover, Phase 2 — the "Stay Free" choice on the
 * day-12 plan picker (see web/app/dashboard/PlanPickerGate.tsx). An
 * agent on the no-card trial who doesn't want to pick a paid plan lands
 * on the permanent Free tier per the May 30 Growth + Distribution Lock
 * §2 ("Day 14 default: Free tier" — here taken explicitly, early).
 *
 * Sets `membershipTier: 'free'`. We deliberately DON'T fake a
 * `subscriptionStatus` — a Free agent has no subscription. The dashboard
 * SubscriptionGate admits Free via `isFreeTier(...)` instead (semantically
 * honest, mirrors the Phase 1 trial decision).
 *
 * Hard guard: never demote a paid agent. If the caller somehow already
 * has an active subscription, this is a no-op. The picker only renders
 * for active-trial agents, so in practice the caller is always a trial
 * agent — but the route is defensive because it mutates membership.
 *
 * Auth: Bearer <Firebase ID token>
 * Returns: { ok, membershipTier }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(match[1]);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const db = getAdminFirestore();
    const ref = db.collection('agents').doc(uid);
    const snap = await ref.get();
    const data = snap.data() || {};

    // Never demote a paying agent — if they have an active subscription,
    // leave their tier untouched. (The picker shouldn't have shown for
    // them, but membership writes must be defensive.)
    if (data.subscriptionStatus === 'active') {
      return NextResponse.json({
        ok: true,
        membershipTier: typeof data.membershipTier === 'string' ? data.membershipTier : 'unknown',
        unchanged: true,
        reason: 'already_subscribed',
      });
    }

    await ref.set(
      {
        membershipTier: 'free',
        freeSince: FieldValue.serverTimestamp(),
        // Records that Free was an explicit choice (vs. the day-14 cron
        // default) — useful for funnel analysis later.
        trialChoseFreeAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, membershipTier: 'free' });
  } catch (error) {
    console.error('[trial/stay-free] error', error);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
