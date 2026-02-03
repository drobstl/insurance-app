import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import Stripe from 'stripe';

// Disable body parsing, need raw body for webhook signature verification
export const dynamic = 'force-dynamic';

async function getFirebaseUserIdFromCustomer(customerId: string): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return (customer as Stripe.Customer).metadata?.firebaseUserId || null;
  } catch {
    return null;
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.firebaseUserId;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!userId) {
    console.error('No Firebase user ID in session metadata');
    return;
  }

  // Get subscription details
  const subscriptionResponse = await stripe.subscriptions.retrieve(subscriptionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscription = subscriptionResponse as any;

  // Update Firestore using Admin SDK (bypasses security rules)
  const db = getAdminFirestore();
  await db.collection('agents').doc(userId).set(
    {
      subscriptionStatus: 'active',
      stripeCustomerId: customerId,
      subscriptionId: subscriptionId,
      subscriptionStartDate: subscription.current_period_start
        ? new Date(subscription.current_period_start * 1000)
        : new Date(),
      subscriptionCurrentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : new Date(),
    },
    { merge: true }
  );

  console.log(`Subscription activated for user ${userId}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionUpdated(subscriptionData: any) {
  const userId = subscriptionData.metadata?.firebaseUserId || 
    await getFirebaseUserIdFromCustomer(subscriptionData.customer as string);

  if (!userId) {
    console.error('Could not find Firebase user ID for subscription update');
    return;
  }

  const status = subscriptionData.status === 'active' || subscriptionData.status === 'trialing' 
    ? 'active' 
    : subscriptionData.status;

  const db = getAdminFirestore();
  await db.collection('agents').doc(userId).set(
    {
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: subscriptionData.current_period_end
        ? new Date(subscriptionData.current_period_end * 1000)
        : new Date(),
      stripeCustomerId: subscriptionData.customer,
      subscriptionId: subscriptionData.id,
    },
    { merge: true }
  );

  console.log(`Subscription updated for user ${userId}: ${status}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionDeleted(subscriptionData: any) {
  const userId = subscriptionData.metadata?.firebaseUserId || 
    await getFirebaseUserIdFromCustomer(subscriptionData.customer as string);

  if (!userId) {
    console.error('Could not find Firebase user ID for subscription deletion');
    return;
  }

  const db = getAdminFirestore();
  await db.collection('agents').doc(userId).set(
    {
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: new Date(),
      stripeCustomerId: subscriptionData.customer,
      subscriptionId: subscriptionData.id,
    },
    { merge: true }
  );

  console.log(`Subscription canceled for user ${userId}`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const userId = await getFirebaseUserIdFromCustomer(customerId);

  if (!userId) {
    console.error('Could not find Firebase user ID for failed payment');
    return;
  }

  const db = getAdminFirestore();
  await db.collection('agents').doc(userId).set(
    {
      subscriptionStatus: 'past_due',
      lastPaymentFailedAt: new Date(),
      stripeCustomerId: invoice.customer,
      subscriptionId: invoice.subscription,
    },
    { merge: true }
  );

  console.log(`Payment failed for user ${userId}`);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'No signature provided' },
        { status: 400 }
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET is not set');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
