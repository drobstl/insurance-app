import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';
import { getAdminAuth } from '../../../../lib/firebase-admin';

// Price IDs from environment variables
const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_ID_MONTHLY || '',
  annual: process.env.STRIPE_PRICE_ID_ANNUAL || '',
};

const getAuthUser = async (request: NextRequest) => {
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) return null;

  const token = match[1];
  return getAdminAuth().verifyIdToken(token);
};

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

    // Validate plan type
    if (plan !== 'monthly' && plan !== 'annual') {
      return NextResponse.json(
        { error: 'Invalid plan type. Must be "monthly" or "annual"' },
        { status: 400 }
      );
    }

    // Get the appropriate price ID
    const priceId = PRICE_IDS[plan as keyof typeof PRICE_IDS];

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

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

    // Create checkout session with all options
    // allow_promotion_codes lets users enter promo codes at checkout
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
      success_url: `${appUrl}/dashboard?subscription=success`,
      cancel_url: `${appUrl}/subscribe?canceled=true`,
      allow_promotion_codes: true,
      metadata: {
        firebaseUserId: userId,
        plan: plan,
      },
      subscription_data: {
        metadata: {
          firebaseUserId: userId,
          plan: plan,
        },
      },
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
