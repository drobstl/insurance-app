import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { stripe } from '../../../../lib/stripe';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import {
  PRICING_TIERS,
  isStripeBillableTier,
  resolveStripePriceId,
} from '../../../../lib/pricing';

/**
 * POST /api/signup/start-checkout
 *
 * Deferred-account signup entry point (May 25, 2026). Closes the
 * "Pryor Hovis" gap where a Firebase user could exist without a
 * paid Stripe subscription.
 *
 * Order of operations:
 *   1. Validate email + name + tier.
 *   2. Reject if email already has a Firebase Auth user — frontend
 *      routes them to /login.
 *   3. Create the Stripe Checkout session (subscription mode) with
 *      `customer_email` set. Stripe will create the customer when
 *      payment succeeds.
 *   4. Write `pendingSignups/{sessionId}` so the webhook knows to
 *      create the Firebase user on `checkout.session.completed`.
 *   5. Return the Checkout URL.
 *
 * If the user abandons at the Stripe card form, NO Firebase user
 * and NO agents/{uid} doc are ever created. The pendingSignups doc
 * has a 24h TTL and is GC'd by a future cleanup cron (not yet
 * shipped — the docs are tiny and harmless).
 *
 * Body: { email, name, tier, refCode? }
 */

interface StartCheckoutBody {
  email?: unknown;
  name?: unknown;
  tier?: unknown;
  refCode?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as StartCheckoutBody;

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const tier = typeof body.tier === 'string' ? body.tier.trim() : '';
    const refCode =
      typeof body.refCode === 'string' && body.refCode.trim().length > 0
        ? body.refCode.trim().toUpperCase()
        : null;

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
    }
    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
    }
    if (!isStripeBillableTier(tier)) {
      return NextResponse.json({ error: 'invalid_tier' }, { status: 400 });
    }

    // Coming-soon tier back-door close (May 26, 2026). Even though the
    // pricing page swaps the buy CTA for a notify-me mailto, a
    // bookmarked /signup?tier=pro URL would still POST here. Reject so
    // nobody pays for a tier that isn't ready, regardless of how they
    // got to the form.
    if (PRICING_TIERS[tier].comingSoon) {
      return NextResponse.json(
        { error: 'tier_not_yet_available', tier },
        { status: 400 },
      );
    }

    // Block re-signup with an email that already has a Firebase user
    // BEFORE checking Stripe config so the user gets a clean "log in
    // instead" message even if pricing is misconfigured.
    const auth = getAdminAuth();
    try {
      await auth.getUserByEmail(email);
      return NextResponse.json({ error: 'email_in_use' }, { status: 409 });
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code !== 'auth/user-not-found') {
        console.error('[signup/start-checkout] auth lookup failed', err);
        return NextResponse.json({ error: 'server_error' }, { status: 500 });
      }
      // user-not-found is the happy path — keep going.
    }

    const priceId = resolveStripePriceId(tier);
    if (!priceId) {
      const envVar = PRICING_TIERS[tier].stripePriceIdEnvVar;
      console.error('[signup/start-checkout] price id not configured', { tier, envVar });
      return NextResponse.json({ error: 'pricing_not_configured' }, { status: 500 });
    }

    const db = getAdminFirestore();

    // Resolve the referrer up front so the webhook doesn't need to
    // do another lookup. Silently drop bad codes (no user-facing error).
    let referrerId: string | null = null;
    if (refCode) {
      const codeDoc = await db.collection('agentInviteCodes').doc(refCode).get();
      if (codeDoc.exists) {
        const data = codeDoc.data();
        referrerId = typeof data?.agentId === 'string' ? data.agentId : null;
      }
    }

    if (!stripe) {
      return NextResponse.json({ error: 'stripe_not_configured' }, { status: 500 });
    }

    const appOrigin = resolveAppOrigin(request);
    const trialDays = PRICING_TIERS[tier].trialDays;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      // Echo the email + tier into metadata so the webhook can
      // identify a pending signup from the session payload alone.
      metadata: {
        pendingSignupEmail: email,
        tier,
        ...(refCode ? { referralCode: refCode } : {}),
      },
      subscription_data: {
        metadata: {
          pendingSignupEmail: email,
          tier,
          ...(refCode ? { referralCode: refCode } : {}),
        },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
      success_url: `${appOrigin}/signup/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/pricing?canceled=1${refCode ? `&ref=${encodeURIComponent(refCode)}` : ''}`,
      allow_promotion_codes: true,
    });

    if (!session.id || !session.url) {
      return NextResponse.json({ error: 'checkout_failed' }, { status: 500 });
    }

    await db.collection('pendingSignups').doc(session.id).set({
      sessionId: session.id,
      email,
      emailLower: email,
      name,
      tier,
      refCode,
      referrerId,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      // Best-effort: ~24h TTL window. No hard enforcement yet — these
      // docs are tiny and a cleanup cron will be added later if needed.
      expiresAtMs: Date.now() + 24 * 60 * 60 * 1000,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error: unknown) {
    console.error('[signup/start-checkout] error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
