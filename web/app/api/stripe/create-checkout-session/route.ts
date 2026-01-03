import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';

// Price IDs for different plans
const PRICE_IDS = {
  monthly: 'price_1SlMFGE6F9fvCEUdh5pGoMj9',
  annual: 'price_1SldZkE6F9fvCEUdX2TDYuMp',
};

export async function POST(request: NextRequest) {
  try {
    const { userId, email, plan = 'monthly' } = await request.json();

    if (!userId || !email) {
      return NextResponse.json(
        { error: 'User ID and email are required' },
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

    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Create or retrieve customer
    const customers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    let customerId: string;

    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          firebaseUserId: userId,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session with all options
    // allow_promotion_codes lets users enter promo codes at checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
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
