import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { resolveStripePriceId } from '../../../../lib/pricing';
import { captureServerEvent } from '../../../../lib/posthog-server';
import { ANALYTICS_EVENTS } from '../../../../lib/analytics-events';

/**
 * POST /api/stripe/resolve-comp
 *
 * Backs the "Keep Pro" / "Switch to Growth" CTAs on the "your free Pro is
 * ending" banner. A comped account is a Pro subscription carrying a 100%-off
 * window plus a scheduled cancellation (`cancel_at`) at the moment the discount
 * lapses — so by default it simply ends and the card is never charged. This
 * endpoint lets the caller opt INTO continuing:
 *
 *   - keep_pro:      clear the scheduled cancel → bills Pro ($99) once the
 *                    coupon runs out.
 *   - switch_growth: clear the scheduled cancel + swap the price to Growth →
 *                    bills Growth ($49) once the coupon runs out. The tier label
 *                    stays 'pro' through the free window (she keeps Pro features
 *                    until then); the daily cron flips it to 'growth' at the
 *                    cancel date via `pendingTierAtPeriodEnd`.
 *
 * "Let it end" needs no call — the existing scheduled cancel handles it.
 *
 * Auth: Bearer <Firebase ID token>. Acts only on the caller's own subscription.
 */

const VALID_CHOICES = ['keep_pro', 'switch_growth'] as const;
type Choice = (typeof VALID_CHOICES)[number];

const getAuthUser = async (request: NextRequest) => {
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) return null;
  return getAdminAuth().verifyIdToken(match[1]);
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { choice?: unknown };
    const choice = (typeof body.choice === 'string' ? body.choice.trim() : '') as Choice;
    if (!VALID_CHOICES.includes(choice)) {
      return NextResponse.json(
        { error: `Invalid choice. Expected one of: ${VALID_CHOICES.join(', ')}.` },
        { status: 400 },
      );
    }

    const authUser = await getAuthUser(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = authUser.uid;

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }

    const db = getAdminFirestore();
    const agentRef = db.collection('agents').doc(userId);
    const agentSnap = await agentRef.get();
    const agent = agentSnap.data() ?? {};
    const subscriptionId =
      typeof agent.subscriptionId === 'string' ? agent.subscriptionId : null;
    if (!subscriptionId) {
      return NextResponse.json({ error: 'No subscription on file.' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as any;
    if (!sub || sub.status === 'canceled') {
      return NextResponse.json({ error: 'Subscription is not active.' }, { status: 400 });
    }
    if (!sub.cancel_at) {
      // Nothing scheduled — idempotent no-op (e.g. a double-click after the
      // first call already cleared it).
      return NextResponse.json({ success: true, alreadyResolved: true });
    }

    if (choice === 'keep_pro') {
      // Empty string unsets the scheduled cancellation in the Stripe API.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await stripe.subscriptions.update(subscriptionId, { cancel_at: '' } as any);
      await agentRef.set(
        { subscriptionCancelAt: null, compChoice: 'keep_pro', pendingTierAtPeriodEnd: null },
        { merge: true },
      );
    } else {
      const growthPrice = resolveStripePriceId('growth');
      if (!growthPrice) {
        return NextResponse.json(
          { error: 'Growth pricing is not configured.' },
          { status: 500 },
        );
      }
      const itemId = sub.items.data[0].id;
      // proration_behavior: 'none' → no immediate charge; the 100%-off coupon
      // keeps any remaining free months free, then Growth bills at the next
      // renewal after the coupon lapses.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: any = {
        cancel_at: '',
        items: [{ id: itemId, price: growthPrice }],
        proration_behavior: 'none',
        metadata: { ...(sub.metadata ?? {}), firebaseUserId: userId, tier: 'growth' },
      };
      await stripe.subscriptions.update(subscriptionId, params);
      await agentRef.set(
        {
          subscriptionCancelAt: null,
          compChoice: 'switch_growth',
          pendingTierAtPeriodEnd: 'growth',
        },
        { merge: true },
      );
    }

    await captureServerEvent(userId, ANALYTICS_EVENTS.SUBSCRIPTION_TIER_CHANGED, {
      from_tier: 'pro',
      to_tier: choice === 'keep_pro' ? 'pro' : 'growth',
      comp_resolution: choice,
      had_active_subscription: true,
    });

    return NextResponse.json({ success: true, choice });
  } catch (err) {
    console.error('[resolve-comp] failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to resolve comp.' },
      { status: 500 },
    );
  }
}
