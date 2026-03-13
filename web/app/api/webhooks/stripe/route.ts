import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { stripe } from '../../../../lib/stripe';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import Stripe from 'stripe';

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function getOrCreateInviteUrl(
  db: ReturnType<typeof getAdminFirestore>,
  agentId: string,
): Promise<string | null> {
  const agentRef = db.collection('agents').doc(agentId);
  const agentSnap = await agentRef.get();
  if (!agentSnap.exists) return null;
  const data = agentSnap.data()!;
  let inviteCode = data.inviteCode as string | undefined;
  if (!inviteCode) {
    let attempts = 0;
    while (attempts < 10) {
      const candidate = generateInviteCode();
      const existing = await db.collection('agentInviteCodes').doc(candidate).get();
      if (!existing.exists) {
        inviteCode = candidate;
        break;
      }
      attempts++;
    }
    if (!inviteCode) return null;
    await db.collection('agentInviteCodes').doc(inviteCode).set({ agentId });
    await agentRef.update({ inviteCode });
  }
  return `https://agentforlife.app/signup?ref=${inviteCode}`;
}

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

const CHARTER_PRICE_IDS = new Set([
  process.env.STRIPE_PRICE_ID_CHARTER_MONTHLY,
  process.env.STRIPE_PRICE_ID_CHARTER_ANNUAL,
].filter(Boolean));

const INNER_CIRCLE_PRICE_IDS = new Set([
  process.env.STRIPE_PRICE_ID_INNER_CIRCLE_MONTHLY,
  process.env.STRIPE_PRICE_ID_INNER_CIRCLE_ANNUAL,
].filter(Boolean));

function deriveTier(priceId: string | undefined, sessionMeta: Record<string, string> | null): string {
  if (sessionMeta?.membershipTier) return sessionMeta.membershipTier;
  if (priceId && CHARTER_PRICE_IDS.has(priceId)) return 'charter';
  if (priceId && INNER_CIRCLE_PRICE_IDS.has(priceId)) return 'inner_circle';
  return 'standard';
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

  const priceId = subscription.items?.data?.[0]?.price?.id as string | undefined;
  const membershipTier = deriveTier(priceId, session.metadata as Record<string, string> | null);

  // Update Firestore using Admin SDK (bypasses security rules)
  const db = getAdminFirestore();
  await db.collection('agents').doc(userId).set(
    {
      subscriptionStatus: 'active',
      stripeCustomerId: customerId,
      subscriptionId: subscriptionId,
      membershipTier,
      subscriptionStartDate: subscription.current_period_start
        ? new Date(subscription.current_period_start * 1000)
        : new Date(),
      subscriptionCurrentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : new Date(),
    },
    { merge: true }
  );

  // Check if this user is an approved founding member (handles the case where
  // they signed up after being approved, so the approval route couldn't find them)
  const agentDoc = await db.collection('agents').doc(userId).get();
  const agentEmail = agentDoc.data()?.email;

  if (agentEmail) {
    const fmSnapshot = await db
      .collection('foundingMemberApplications')
      .where('email', '==', agentEmail)
      .where('status', '==', 'approved')
      .limit(1)
      .get();

    if (!fmSnapshot.empty) {
      await db.collection('agents').doc(userId).set(
        { isFoundingMember: true, foundingMemberApprovedAt: new Date() },
        { merge: true }
      );
      console.log(`Founding member badge set for user ${userId}`);
    }
  }

  // ── Credit the referrer with a one-month balance adjustment ──
  // TODO: Re-enable when public $49/mo tier launches
  const REFERRAL_CREDIT_ENABLED = false;
  const referrerAgentUid = session.metadata?.referredByAgent;
  if (REFERRAL_CREDIT_ENABLED && referrerAgentUid) {
    try {
      const referrerDoc = await db.collection('agents').doc(referrerAgentUid).get();
      const referrerCustomerId = referrerDoc.data()?.stripeCustomerId as string | undefined;
      if (referrerCustomerId) {
        const unitAmount = subscription.items?.data?.[0]?.price?.unit_amount;
        const monthlyPrice = typeof unitAmount === 'number' && unitAmount > 0 ? unitAmount : 999;
        await stripe.customers.createBalanceTransaction(referrerCustomerId, {
          amount: -monthlyPrice,
          currency: 'usd',
          description: 'Referral reward: 1 free month for referring a new agent',
        });
        await db.collection('agents').doc(referrerAgentUid).set(
          { referralRewardsGiven: (referrerDoc.data()?.referralRewardsGiven ?? 0) + 1 },
          { merge: true },
        );
        console.log(`Referral credit applied for referrer ${referrerAgentUid}`);
      }
    } catch (e) {
      console.error('Failed to credit referrer:', e);
    }
  }

  // ── Send welcome email with personalized invite link ──
  const email = agentDoc.data()?.email as string | undefined;
  const agentName = agentDoc.data()?.name as string | undefined;
  if (email) {
    try {
      const inviteUrl = await getOrCreateInviteUrl(db, userId);
      const key = process.env.RESEND_API_KEY;
      if (key && inviteUrl) {
        const resend = new Resend(key);
        const firstName = agentName?.split(' ')[0] || 'there';
        await resend.emails.send({
          from: 'Daniel Roberts — AgentForLife™ <support@agentforlife.app>',
          to: email,
          subject: 'Welcome to AgentForLife',
          html: `
            <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; color: #2D3748; line-height: 1.7;">
              <p style="font-size: 16px;">Hey ${firstName},</p>
              <p style="font-size: 16px;">Thanks for subscribing. You're all set — start adding clients and let the app handle retention and referrals.</p>
              <p style="font-size: 16px;">Share your personal invite link — when another agent signs up, you both earn a referral badge:</p>
              <p style="font-size: 16px;"><a href="${inviteUrl}" style="color: #0D4D4D; font-weight: 600;">${inviteUrl}</a></p>
              <p style="font-size: 16px;">Questions? Just reply to this email.</p>
              <p style="font-size: 16px;">— Daniel</p>
            </div>
          `,
        });
        console.log(`Welcome email sent to ${email}`);
      }
    } catch (e) {
      console.error('Failed to send welcome email:', e);
    }
  }

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInvoicePaymentFailed(invoice: any) {
  const customerId = invoice.customer as string;
  const userId = await getFirebaseUserIdFromCustomer(customerId);

  if (!userId) {
    console.error('Could not find Firebase user ID for failed payment');
    return;
  }

  // Get subscription ID from the invoice
  const subscriptionId = typeof invoice.subscription === 'string' 
    ? invoice.subscription 
    : invoice.subscription?.id ?? null;

  const db = getAdminFirestore();
  await db.collection('agents').doc(userId).set(
    {
      subscriptionStatus: 'past_due',
      lastPaymentFailedAt: new Date(),
      stripeCustomerId: invoice.customer,
      subscriptionId: subscriptionId,
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
