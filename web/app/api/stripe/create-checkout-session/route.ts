import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import {
  PRICING_TIERS,
  isStripeBillableTier,
  resolveStripePriceId,
} from '../../../../lib/pricing';

/**
 * POST /api/stripe/create-checkout-session
 *
 * Track C (May 10, 2026): rewritten to use the v3 pricing source of
 * truth (`web/lib/pricing.ts`). Legacy `charter` / `inner_circle` /
 * default-monthly plans are removed; the only accepted body shape is
 * `{ tier: 'starter' | 'growth' | 'pro' }`. Agency is not Stripe-
 * billable and is sales-led via mailto from the pricing page.
 *
 * Trial is configured at the tier level (`PRICING_TIERS[tier].
 * trialDays`) and applied via Stripe's native `trial_period_days`
 * on the subscription. Per Daniel's lock: standard "CC at signup,
 * 14 days free" pattern. No custom day-7 lockout logic.
 *
 * Body: { tier: 'starter' | 'growth' | 'pro', referralCode?: string }
 * Auth: Bearer <Firebase ID token>
 */

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

/**
 * Sanitizes a return-path string passed by the client (in-app upgrade
 * card sends the current `usePathname()` here so a successful checkout
 * lands the agent back on the surface they tried to access).
 *
 * Open-redirect guard rejects:
 *   - anything not starting with `/`
 *   - protocol-relative `//evil.com` paths
 *   - paths containing `:` (catches javascript:, data:, etc.)
 *   - paths with control chars / newlines
 *   - off-dashboard paths (defense-in-depth — only `/dashboard*` is
 *     reachable as a tier_locked paywall surface today, so anything
 *     else is suspicious)
 *
 * Returns the normalized path-only portion (drops query string), or
 * `'/dashboard'` if the input fails validation.
 */
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      tier?: unknown;
      referralCode?: unknown;
      returnPath?: unknown;
    };
    const tier = typeof body.tier === 'string' ? body.tier.trim() : '';
    const referralCode =
      typeof body.referralCode === 'string' && body.referralCode.trim().length > 0
        ? body.referralCode.trim()
        : null;
    const returnPath = sanitizeReturnPath(body.returnPath);

    if (!isStripeBillableTier(tier)) {
      return NextResponse.json(
        {
          error: `Invalid tier: "${tier}". Expected one of: starter, growth, pro.`,
        },
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

    const priceId = resolveStripePriceId(tier);
    if (!priceId) {
      const envVar = PRICING_TIERS[tier].stripePriceIdEnvVar;
      console.error(`[stripe-checkout] price id not configured`, { tier, envVar });
      return NextResponse.json(
        {
          error: `Pricing for "${tier}" is not configured. Set ${envVar} in environment.`,
        },
        { status: 500 },
      );
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }

    const appOrigin = resolveAppOrigin(request);

    // Reuse customer if one already exists for this Firebase user.
    const customers = await stripe.customers.list({ email, limit: 10 });
    const matchingCustomer = customers.data.find(
      (c) => c.metadata?.firebaseUserId === userId,
    );
    const customer = matchingCustomer
      ? matchingCustomer
      : await stripe.customers.create({
          email,
          metadata: { firebaseUserId: userId },
        });

    const trialDays = PRICING_TIERS[tier].trialDays;

    // Forward a stored FirstPromoter tracking id (Entry-mechanism
    // cutover, Phase 1). No-card trial signups capture `affiliateTid` on
    // the agent doc but can't credit the affiliate at signup — there's no
    // payment yet. When the trial agent converts here, forward it as
    // `fp_tid` into the Checkout metadata (same key + both locations the
    // card-at-signup flow uses) so FirstPromoter's Stripe listener can
    // credit the referrer even after the original click cookie expired.
    // Non-fatal: a read failure just means no tid is forwarded. No
    // double-credit risk — card-signup users are credited at signup and
    // never carry `affiliateTid`; only no-card trial users do.
    let affiliateTid: string | null = null;
    try {
      const agentSnap = await getAdminFirestore().collection('agents').doc(userId).get();
      const storedTid = agentSnap.data()?.affiliateTid;
      if (typeof storedTid === 'string' && storedTid.trim().length > 0) {
        affiliateTid = storedTid.trim();
      }
    } catch (err) {
      console.warn('[stripe-checkout] affiliateTid lookup failed (non-fatal)', err);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${appOrigin}${returnPath}?subscription=success&tier=${tier}`,
      cancel_url: `${appOrigin}/pricing?canceled=true`,
      metadata: {
        firebaseUserId: userId,
        tier,
        ...(referralCode ? { referralCode } : {}),
        ...(affiliateTid ? { fp_tid: affiliateTid } : {}),
      },
      subscription_data: {
        metadata: {
          firebaseUserId: userId,
          tier,
          ...(referralCode ? { referralCode } : {}),
          ...(affiliateTid ? { fp_tid: affiliateTid } : {}),
        },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: unknown) {
    console.error('[stripe-checkout] error', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const stripeError = error as { type?: string; code?: string };
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        details: errorMessage,
        stripeErrorType: stripeError?.type,
        stripeErrorCode: stripeError?.code,
      },
      { status: 500 },
    );
  }
}
