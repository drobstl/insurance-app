import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import {
  PRICING_TIERS,
  PRICING_TIER_ORDER,
  isStripeBillableTier,
  resolveStripePriceId,
  type PricingTierId,
} from '../../../../lib/pricing';
import { captureServerEvent } from '../../../../lib/posthog-server';
import { ANALYTICS_EVENTS } from '../../../../lib/analytics-events';

/**
 * POST /api/stripe/upgrade-tier
 *
 * The "magical upgrade" endpoint behind the in-app paywall CTA. Lives
 * separately from /api/stripe/create-checkout-session (which exists
 * for the signup flow) because this endpoint does TWO things:
 *
 *   1. INSPECTS the agent's Stripe customer state and decides whether
 *      to upgrade them IN-APP (existing card on file → subscription
 *      update server-side, no Checkout redirect) or via STRIPE CHECKOUT
 *      (no card on file → standard Checkout flow). Mode discrimination
 *      is invisible to the frontend; it just calls this endpoint and
 *      reacts to the response.
 *
 *   2. AUTO-APPLIES the Founding-member coupon when the agent's
 *      `isFoundingMember` flag is set (per the founding mechanic:
 *      $99 Pro SKU with a permanent $50 founding coupon = $49
 *      effective, badge persists across the upgrade).
 *
 * Body: { tier: 'pro', returnPath?: string, confirm?: boolean }
 * Auth: Bearer <Firebase ID token>
 *
 * Two-call protocol:
 *   - First call with confirm=false → returns mode + preview info (for
 *     in_app) OR Checkout URL (for checkout mode → frontend redirects).
 *   - Second call with confirm=true (in_app mode only) → actually
 *     applies the subscription update + writes Firestore directly.
 *
 * Idempotency: the Stripe webhook still runs on subscription updates,
 * which writes the same Firestore fields. Both writes carry the same
 * data and use `{ merge: true }`, so racing is harmless.
 */

// $50 founding-member discount per CONTEXT.md > Pricing locked May 26.
// Used for client-side display preview only; the actual discount is
// applied via the Stripe Coupon (STRIPE_COUPON_ID_FOUNDING env var).
const FOUNDING_DISCOUNT_CENTS = 5000;

const getAuthUser = async (request: NextRequest) => {
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) return null;
  const token = match[1];
  return getAdminAuth().verifyIdToken(token);
};

function resolveAppOrigin(request: NextRequest): string {
  const rawEnvUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (rawEnvUrl) {
    try {
      return new URL(rawEnvUrl).origin;
    } catch {
      console.warn('NEXT_PUBLIC_APP_URL is invalid. Falling back to request origin.');
    }
  }
  return request.nextUrl.origin;
}

/** Open-redirect guard (mirrors /api/stripe/create-checkout-session). */
function sanitizeReturnPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/dashboard';
  if (!raw.startsWith('/')) return '/dashboard';
  if (raw.startsWith('//')) return '/dashboard';
  if (raw.includes(':')) return '/dashboard';
  if (/[\r\n\t]/.test(raw)) return '/dashboard';
  const pathOnly = raw.split('?')[0] ?? '/dashboard';
  if (!pathOnly.startsWith('/dashboard')) return '/dashboard';
  return pathOnly;
}

function formatPriceDisplay(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars}/mo`;
}

function formatNextBillingDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      tier?: unknown;
      returnPath?: unknown;
      confirm?: unknown;
    };

    const tier = typeof body.tier === 'string' ? body.tier.trim() : '';
    const returnPath = sanitizeReturnPath(body.returnPath);
    const confirm = body.confirm === true;

    if (!isStripeBillableTier(tier)) {
      return NextResponse.json(
        { error: `Invalid tier: "${tier}". Expected one of: starter, growth, pro.` },
        { status: 400 },
      );
    }

    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authUser.uid;
    const email = authUser.email;
    if (!email) {
      return NextResponse.json(
        { error: 'Authenticated email is required' },
        { status: 400 },
      );
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }

    const priceId = resolveStripePriceId(tier);
    if (!priceId) {
      const envVar = PRICING_TIERS[tier].stripePriceIdEnvVar;
      console.error('[upgrade-tier] price id not configured', { tier, envVar });
      return NextResponse.json(
        { error: `Pricing for "${tier}" is not configured. Set ${envVar}.` },
        { status: 500 },
      );
    }

    // Founding membership decides whether to apply the $50 coupon.
    // Read from Firestore (server-trusted) rather than the client
    // (don't trust client-claimed founding status for billing).
    const db = getAdminFirestore();
    const agentDoc = await db.collection('agents').doc(userId).get();
    const agentData = agentDoc.data() ?? {};
    const isFounding = agentData.isFoundingMember === true;
    const foundingCouponId = isFounding
      ? process.env.STRIPE_COUPON_ID_FOUNDING?.trim() || null
      : null;

    if (isFounding && !foundingCouponId) {
      // Refuse rather than overcharge. A founding member was promised the
      // $49 rate; charging them full $99 because an env var is missing is a
      // money/trust bug, not a degraded-mode fallback. Fail loudly so the
      // misconfiguration surfaces (and so they retry once it's fixed) — far
      // better than silently double-charging and having to refund.
      console.error(
        '[upgrade-tier] founding user but STRIPE_COUPON_ID_FOUNDING is not set — refusing to upgrade rather than overcharge. Fix the env var.',
      );
      return NextResponse.json(
        {
          error:
            'Your founding-member discount could not be applied right now. We have not charged you. Please try again shortly or contact support.',
        },
        { status: 503 },
      );
    }

    // Look up existing Stripe customer for this Firebase user.
    const customers = await stripe.customers.list({ email, limit: 10 });
    const matchingCustomer = customers.data.find(
      (c) => c.metadata?.firebaseUserId === userId,
    );

    const appOrigin = resolveAppOrigin(request);

    // ── Mode discrimination ────────────────────────────────────────
    // - in_app:  customer exists AND has a usable card on file
    // - checkout: no customer, OR customer has no card on file
    //
    // The frontend never sees this decision-making — it just gets
    // back either preview info (in_app) or a Checkout URL (checkout).
    type CardBrief = { brand: string; last4: string; pmId: string };
    let mode: 'in_app' | 'checkout' = 'checkout';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let activeSubscription: any | null = null;
    let cardOnFile: CardBrief | null = null;

    if (matchingCustomer) {
      // First check the customer's default payment method, then fall
      // back to any saved card payment method.
      const customerDetail = await stripe.customers.retrieve(matchingCustomer.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const customerAny = customerDetail as any;
      const defaultPmId =
        (customerAny.invoice_settings?.default_payment_method as string | undefined) ||
        undefined;

      if (defaultPmId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pm = (await stripe.paymentMethods.retrieve(defaultPmId)) as any;
        if (pm.card?.brand && pm.card?.last4) {
          cardOnFile = {
            brand: pm.card.brand,
            last4: pm.card.last4,
            pmId: pm.id,
          };
        }
      }

      if (!cardOnFile) {
        const pmList = await stripe.paymentMethods.list({
          customer: matchingCustomer.id,
          type: 'card',
          limit: 1,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pm = pmList.data[0] as any | undefined;
        if (pm?.card?.brand && pm?.card?.last4) {
          cardOnFile = {
            brand: pm.card.brand,
            last4: pm.card.last4,
            pmId: pm.id,
          };
        }
      }

      if (cardOnFile) {
        mode = 'in_app';
        const subList = await stripe.subscriptions.list({
          customer: matchingCustomer.id,
          status: 'active',
          limit: 5,
        });
        if (subList.data.length > 0) {
          activeSubscription = subList.data[0];
        }
      }
    }

    // Display price (server-computed for safety — never trust client).
    const baseCents = PRICING_TIERS[tier].priceMonthly * 100;
    const effectiveCents = isFounding
      ? Math.max(0, baseCents - FOUNDING_DISCOUNT_CENTS)
      : baseCents;

    // ── COMMIT path (in_app + confirm=true) ────────────────────────
    if (confirm && mode === 'in_app' && matchingCustomer && cardOnFile) {
      const customerId = matchingCustomer.id;
      let newSubscriptionId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let resultingSubscription: any;

      if (activeSubscription) {
        // SWAP price on existing subscription. Stripe handles proration
        // automatically with `create_prorations`.
        const itemId = activeSubscription.items.data[0].id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateParams: any = {
          items: [{ id: itemId, price: priceId }],
          proration_behavior: 'create_prorations',
          metadata: {
            ...(activeSubscription.metadata ?? {}),
            firebaseUserId: userId,
            tier,
          },
        };
        if (foundingCouponId) {
          updateParams.coupon = foundingCouponId;
        }
        resultingSubscription = await stripe.subscriptions.update(
          activeSubscription.id,
          updateParams,
        );
        newSubscriptionId = resultingSubscription.id;
      } else {
        // CREATE a new subscription using the saved payment method.
        // off_session=true tells Stripe to charge immediately without
        // user interaction (we already have their card on file).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createParams: any = {
          customer: customerId,
          items: [{ price: priceId }],
          default_payment_method: cardOnFile.pmId,
          off_session: true,
          payment_behavior: 'allow_incomplete',
          metadata: { firebaseUserId: userId, tier },
        };
        if (foundingCouponId) {
          createParams.coupon = foundingCouponId;
        }
        resultingSubscription = await stripe.subscriptions.create(createParams);
        newSubscriptionId = resultingSubscription.id;
      }

      // Write Firestore directly so the dashboard re-renders unlocked
      // immediately on the redirect. The webhook also writes these
      // fields with the same merge — idempotent, harmless overlap.
      const periodEndUnix = resultingSubscription.current_period_end as number | undefined;
      const periodStartUnix = resultingSubscription.current_period_start as number | undefined;
      await db.collection('agents').doc(userId).set(
        {
          subscriptionStatus: 'active',
          stripeCustomerId: customerId,
          subscriptionId: newSubscriptionId,
          membershipTier: tier,
          ...(periodStartUnix
            ? { subscriptionStartDate: new Date(periodStartUnix * 1000) }
            : {}),
          ...(periodEndUnix
            ? { subscriptionCurrentPeriodEnd: new Date(periodEndUnix * 1000) }
            : {}),
        },
        { merge: true },
      );

      // Revenue funnel — in-app plan moves never pass through Checkout,
      // and the webhook's subscription.updated can't see the prior tier,
      // so this is the ONE place an upgrade/downgrade is observable.
      const prevTier = typeof agentData.membershipTier === 'string'
        ? agentData.membershipTier
        : null;
      const fromIdx = prevTier ? PRICING_TIER_ORDER.indexOf(prevTier as PricingTierId) : -1;
      const toIdx = PRICING_TIER_ORDER.indexOf(tier as PricingTierId);
      await captureServerEvent(userId, ANALYTICS_EVENTS.SUBSCRIPTION_TIER_CHANGED, {
        from_tier: prevTier,
        to_tier: tier,
        direction: fromIdx < 0 || toIdx < 0
          ? undefined
          : toIdx > fromIdx ? 'upgrade' : toIdx < fromIdx ? 'downgrade' : 'unchanged',
        is_founding: isFounding,
        had_active_subscription: Boolean(activeSubscription),
      });

      return NextResponse.json({
        success: true,
        redirectPath: `${returnPath}?subscription=success&tier=${tier}`,
      });
    }

    // ── PREVIEW path (in_app + confirm=false) ──────────────────────
    if (mode === 'in_app' && cardOnFile) {
      const nextBillingUnix = activeSubscription?.current_period_end as
        | number
        | undefined;
      return NextResponse.json({
        mode: 'in_app',
        preview: {
          monthlyPriceCents: effectiveCents,
          monthlyPriceDisplay: formatPriceDisplay(effectiveCents),
          isFounding,
          cardBrand: cardOnFile.brand,
          cardLast4: cardOnFile.last4,
          nextBillingDateDisplay: nextBillingUnix
            ? formatNextBillingDate(nextBillingUnix)
            : null,
          hasActiveSubscription: Boolean(activeSubscription),
        },
      });
    }

    // ── CHECKOUT path (no card on file) ────────────────────────────
    let customerId: string;
    if (matchingCustomer) {
      customerId = matchingCustomer.id;
    } else {
      const created = await stripe.customers.create({
        email,
        metadata: { firebaseUserId: userId },
      });
      customerId = created.id;
    }

    const trialDays = PRICING_TIERS[tier].trialDays;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionParams: any = {
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${appOrigin}${returnPath}?subscription=success&tier=${tier}`,
      cancel_url: `${appOrigin}/pricing?canceled=true`,
      metadata: { firebaseUserId: userId, tier },
      subscription_data: {
        metadata: { firebaseUserId: userId, tier },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
    };

    if (foundingCouponId) {
      // Auto-apply founding coupon at Checkout — no manual promo code
      // entry needed.
      sessionParams.discounts = [{ coupon: foundingCouponId }];
    } else {
      // Still allow promo codes for everyone else (legacy / future
      // campaigns).
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({
      mode: 'checkout',
      url: session.url,
    });
  } catch (error: unknown) {
    console.error('[upgrade-tier] error', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stripeError = error as { type?: string; code?: string };
    return NextResponse.json(
      {
        error: 'Failed to process upgrade',
        details: message,
        stripeErrorType: stripeError?.type,
        stripeErrorCode: stripeError?.code,
      },
      { status: 500 },
    );
  }
}
