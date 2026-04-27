import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

// Price IDs from environment variables — keyed by "{tier}_{interval}"
const PRICE_IDS: Record<string, string> = {
  charter_monthly: process.env.STRIPE_PRICE_ID_CHARTER_MONTHLY || '',
  charter_annual: process.env.STRIPE_PRICE_ID_CHARTER_ANNUAL || '',
  inner_circle_monthly: process.env.STRIPE_PRICE_ID_INNER_CIRCLE_MONTHLY || '',
  inner_circle_annual: process.env.STRIPE_PRICE_ID_INNER_CIRCLE_ANNUAL || '',
  monthly: process.env.STRIPE_PRICE_ID_MONTHLY || '',
  annual: process.env.STRIPE_PRICE_ID_ANNUAL || '',
};

const VALID_PLANS = new Set(Object.keys(PRICE_IDS));

function tierFromPlan(plan: string): string {
  if (plan.startsWith('charter_')) return 'charter';
  if (plan.startsWith('inner_circle_')) return 'inner_circle';
  return 'standard';
}

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

export async function POST(request: NextRequest) {
  try {
    const { plan = 'monthly' } = await request.json();

    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = authUser.uid;
    const email = authUser.email;

    if (!email) {
      return NextResponse.json(
        { error: 'Authenticated email is required' },
        { status: 400 }
      );
    }

    if (!VALID_PLANS.has(plan)) {
      return NextResponse.json(
        { error: `Invalid plan type: "${plan}"` },
        { status: 400 }
      );
    }

    const priceId = PRICE_IDS[plan];
    const membershipTier = tierFromPlan(plan);

    // Capacity check for limited tiers (charter: 50, inner_circle: 50)
    const TIER_LIMITS: Record<string, number> = { charter: 50, inner_circle: 50 };
    if (TIER_LIMITS[membershipTier]) {
      const db = getAdminFirestore();
      const tierSnap = await db
        .collection('agents')
        .where('membershipTier', '==', membershipTier)
        .get();
      if (tierSnap.size >= TIER_LIMITS[membershipTier]) {
        return NextResponse.json(
          { error: `The ${membershipTier.replace('_', ' ')} tier is full. Please refresh and choose an available tier.` },
          { status: 409 }
        );
      }
    }

    if (!priceId) {
      console.error(`Price ID not configured for plan: ${plan}`);
      return NextResponse.json(
        { error: `Price ID not configured for ${plan} plan. Check STRIPE_PRICE_ID_${plan.toUpperCase()} env variable.` },
        { status: 500 }
      );
    }

    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 500 }
      );
    }

    const appOrigin = resolveAppOrigin(request);

    // Create or retrieve customer for this Firebase user
    const customers = await stripe.customers.list({
      email,
      limit: 10,
    });

    const matchingCustomer = customers.data.find(
      (customer) => customer.metadata?.firebaseUserId === userId
    );

    const customer = matchingCustomer
      ? matchingCustomer
      : await stripe.customers.create({
          email,
          metadata: {
            firebaseUserId: userId,
          },
        });

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${appOrigin}/dashboard?subscription=success`,
      cancel_url: `${appOrigin}/subscribe?canceled=true`,
      metadata: {
        firebaseUserId: userId,
        plan: plan,
        membershipTier,
      },
      subscription_data: {
        metadata: {
          firebaseUserId: userId,
          plan: plan,
          membershipTier,
        },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: unknown) {
    console.error('Error creating checkout session:', error);
    
    // Return more detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const stripeError = error as { type?: string; code?: string };
    
    return NextResponse.json(
      { 
        error: 'Failed to create checkout session',
        details: errorMessage,
        stripeErrorType: stripeError?.type,
        stripeErrorCode: stripeError?.code,
      },
      { status: 500 }
    );
  }
}
