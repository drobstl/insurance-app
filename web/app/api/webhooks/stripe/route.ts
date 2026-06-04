import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { FieldValue } from 'firebase-admin/firestore';
import { stripe } from '../../../../lib/stripe';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { notifyFounderOfSignup } from '../../../../lib/founder-signup-alert';
import { tierIdFromStripePriceId } from '../../../../lib/pricing';
import {
  isTransientWebhookError,
  recordPermanentWebhookError,
} from '../../../../lib/webhook-error-handling';
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

/**
 * Track C (May 10, 2026): tier resolution now uses the v3 pricing
 * source of truth (`web/lib/pricing.ts`). Legacy charter /
 * inner_circle / standard mappings are removed. The session metadata
 * `tier` field (set by the new checkout-session route) is the
 * primary signal; price-ID lookup is a defensive fallback for
 * subscriptions created outside our checkout flow (e.g. Stripe
 * Dashboard manual creation).
 */
function deriveTier(
  priceId: string | undefined,
  sessionMeta: Record<string, string> | null,
): string {
  if (sessionMeta?.tier) return sessionMeta.tier;
  // Backward compat for in-flight subscriptions written under the
  // old metadata key. Safe to remove ≥30 days post-cutover.
  if (sessionMeta?.membershipTier) return sessionMeta.membershipTier;
  return tierIdFromStripePriceId(priceId) ?? 'unknown';
}

/**
 * Deferred-account fulfillment (May 25, 2026).
 *
 * The pre-pay /signup flow writes `pendingSignups/{sessionId}` with
 * the user's name/email/tier/referrer before sending them to Stripe
 * Checkout. When the session completes, we look that doc up and
 * create the Firebase Auth user + agents/{uid} doc here — i.e. the
 * account only exists once Stripe says payment succeeded.
 *
 * Returns the resolved Firebase userId, or null if this session was
 * not a deferred-signup flow (e.g. an already-authed user resubscribing
 * via /api/stripe/create-checkout-session, which sets `firebaseUserId`
 * in metadata directly).
 */
async function fulfillPendingSignup(
  session: Stripe.Checkout.Session,
): Promise<{ userId: string; createdNewUser: boolean } | null> {
  const db = getAdminFirestore();
  const pendingRef = db.collection('pendingSignups').doc(session.id);
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists) return null;

  const pending = pendingSnap.data() as {
    email?: string;
    name?: string;
    tier?: string;
    referrerId?: string | null;
    status?: string;
  };

  // Idempotency — if a duplicate webhook fires after fulfillment, just
  // return the recorded userId without re-creating anything.
  if (pending.status === 'fulfilled') {
    const existingUid = (pendingSnap.data() as { firebaseUserId?: string }).firebaseUserId;
    if (existingUid) return { userId: existingUid, createdNewUser: false };
  }

  const email = pending.email?.trim().toLowerCase();
  const name = pending.name?.trim();
  if (!email || !name) {
    throw new Error(`pendingSignup ${session.id} missing email or name`);
  }

  const auth = getAdminAuth();

  // Race protection: another webhook delivery (or a stranded legacy
  // signup with the same email) may have created the Auth user
  // already. Reuse it instead of erroring out.
  let userId: string;
  let createdNewUser: boolean;
  try {
    const existing = await auth.getUserByEmail(email);
    userId = existing.uid;
    createdNewUser = false;
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== 'auth/user-not-found') throw err;
    const created = await auth.createUser({
      email,
      displayName: name,
      emailVerified: false,
    });
    userId = created.uid;
    createdNewUser = true;
  }

  // Backfill the Stripe Customer's metadata with firebaseUserId so
  // future webhook events (subscription.updated etc.) can resolve
  // the user via getFirebaseUserIdFromCustomer.
  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id ?? null;
  if (customerId) {
    try {
      await stripe.customers.update(customerId, {
        metadata: { firebaseUserId: userId },
      });
    } catch (err) {
      console.warn('[stripe-webhook] could not update customer metadata', {
        customerId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Seed agents/{uid} with profile data the pendingSignup carried.
  // subscriptionStatus is left for the main handler below — keeping
  // a single writer for the active/tier fields avoids drift.
  const profileSeed: Record<string, unknown> = {
    name,
    email,
    emailLower: email,
    createdAt: FieldValue.serverTimestamp(),
  };
  if (pending.referrerId) profileSeed.referredByAgent = pending.referrerId;
  await db.collection('agents').doc(userId).set(profileSeed, { merge: true });

  await pendingRef.set(
    {
      status: 'fulfilled',
      fulfilledAt: FieldValue.serverTimestamp(),
      firebaseUserId: userId,
    },
    { merge: true },
  );

  return { userId, createdNewUser };
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  // Deferred-signup path: create the Firebase user from the pending
  // signup doc before falling through to the standard activation
  // logic. For legacy/resubscribe flows, fulfilledFromPending is null
  // and we use `session.metadata.firebaseUserId` as before.
  const fulfilledFromPending = await fulfillPendingSignup(session);

  const userId = fulfilledFromPending?.userId ?? session.metadata?.firebaseUserId;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!userId) {
    console.error('No Firebase user ID in checkout session metadata', {
      sessionId: session.id,
      customerId,
    });
    await recordPermanentWebhookError({
      db: getAdminFirestore(),
      source: 'stripe',
      error: new Error('No Firebase user ID in checkout session metadata'),
      context: {
        handler: 'handleCheckoutSessionCompleted',
        sessionId: session.id,
        customerId,
      },
    });
    return;
  }

  // Get subscription details
  const subscriptionResponse = await stripe.subscriptions.retrieve(subscriptionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscription = subscriptionResponse as any;

  const priceId = subscription.items?.data?.[0]?.price?.id as string | undefined;
  const membershipTier = deriveTier(priceId, session.metadata as Record<string, string> | null);

  // Trial end timestamp — `subscription.trial_end` is a Unix epoch (seconds)
  // when the subscription is in `trialing` state, otherwise null. We persist
  // it so the dashboard can render "Trial ends in X days" before the first
  // charge fires. The subscription.updated handler nulls it out when the
  // trial ends so the chip disappears.
  const trialEndsAt = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;

  // Update Firestore using Admin SDK (bypasses security rules)
  const db = getAdminFirestore();
  const preActivationAgentDoc = await db.collection('agents').doc(userId).get();
  const wasAlreadyActive = preActivationAgentDoc.data()?.subscriptionStatus === 'active';
  await db.collection('agents').doc(userId).set(
    {
      subscriptionStatus: 'active',
      stripeCustomerId: customerId,
      subscriptionId: subscriptionId,
      membershipTier,
      pendingSubscriptionCelebration: !wasAlreadyActive,
      subscriptionStartDate: subscription.current_period_start
        ? new Date(subscription.current_period_start * 1000)
        : new Date(),
      subscriptionCurrentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : new Date(),
      trialEndsAt,
    },
    { merge: true }
  );

  // Founder alert — brand-new paid signups only (not renewals/resubscribes).
  // Fire-and-forget; must never block or fail webhook fulfillment or a charge.
  if (fulfilledFromPending?.createdNewUser) {
    const seed = preActivationAgentDoc.data() || {};
    void notifyFounderOfSignup({
      uid: userId,
      name: typeof seed.name === 'string' ? seed.name : null,
      email: typeof seed.email === 'string' ? seed.email : null,
      membershipTier,
      referredByAgent: typeof seed.referredByAgent === 'string' ? seed.referredByAgent : null,
      source: 'paid',
    }).catch(() => {});
  }

  // Check if this user is an approved founding member (handles the case where
  // they signed up after being approved, so the approval route couldn't find them)
  const agentDoc = await db.collection('agents').doc(userId).get();
  const agentEmail = agentDoc.data()?.email;
  const normalizedAgentEmail =
    typeof agentEmail === 'string' ? agentEmail.trim().toLowerCase() : null;

  if (normalizedAgentEmail) {
    let hasApprovedApplication = false;

    let fmSnapshot = await db
      .collection('foundingMemberApplications')
      .where('emailLower', '==', normalizedAgentEmail)
      .where('status', '==', 'approved')
      .limit(1)
      .get();
    hasApprovedApplication = !fmSnapshot.empty;

    if (!hasApprovedApplication) {
      fmSnapshot = await db
        .collection('foundingMemberApplications')
        .where('email', '==', normalizedAgentEmail)
        .where('status', '==', 'approved')
        .limit(1)
        .get();
      hasApprovedApplication = !fmSnapshot.empty;
    }

    if (!hasApprovedApplication) {
      const approvedSnapshot = await db
        .collection('foundingMemberApplications')
        .where('status', '==', 'approved')
        .limit(100)
        .get();
      hasApprovedApplication = approvedSnapshot.docs.some((doc) => {
        const value = doc.data().email;
        return typeof value === 'string' && value.trim().toLowerCase() === normalizedAgentEmail;
      });
    }

    if (hasApprovedApplication) {
      await db.collection('agents').doc(userId).set(
        { isFoundingMember: true, foundingMemberApprovedAt: new Date() },
        { merge: true }
      );
      console.log(`Founding member badge set for user ${userId}`);
    }
  }

  // ── Send standard welcome email ──
  const email = agentDoc.data()?.email as string | undefined;
  const agentName = agentDoc.data()?.name as string | undefined;
  if (email) {
    try {
      const key = process.env.RESEND_API_KEY;
      if (key) {
        const resend = new Resend(key);
        const firstName = agentName?.split(' ')[0] || 'there';
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app').replace(/\/+$/, '');

        // Deferred-signup users have no password yet. Generate a
        // one-click password-set link as their primary CTA so they
        // can finish setup even if they closed the browser after
        // paying. For legacy/resubscribe users (already had a password),
        // we skip the link and keep the "Open dashboard" CTA.
        let passwordSetLink: string | null = null;
        if (fulfilledFromPending?.createdNewUser) {
          try {
            passwordSetLink = await getAdminAuth().generatePasswordResetLink(email);
          } catch (linkErr) {
            console.error('[stripe-webhook] failed to generate password-set link', linkErr);
          }
        }

        const ctaHref = passwordSetLink ?? `${appUrl}/dashboard`;
        const ctaLabel = passwordSetLink ? 'Set your password' : 'Open your dashboard';
        const bodyCopy = passwordSetLink
          ? 'Welcome to AgentForLife. Your payment went through and your account is active. One last step — set your password to log in.'
          : 'Welcome to AgentForLife. Your account is active and your dashboard is ready.';

        await resend.emails.send({
          from: 'Daniel Roberts — AgentForLife™ <support@agentforlife.app>',
          to: email,
          subject: 'Welcome to AgentForLife',
          html: `
            <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; color: #2D3748; line-height: 1.7;">
              <p style="font-size: 16px;">Hey ${firstName},</p>
              <p style="font-size: 16px;">${bodyCopy}</p>
              <p style="margin: 20px 0;">
                <a href="${ctaHref}" style="display:inline-block;padding:12px 20px;background:#005851;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">${ctaLabel}</a>
              </p>
              <p style="font-size: 16px;">Best next steps once you're in:</p>
              <ul style="font-size: 16px; margin: 8px 0 16px 20px; padding: 0;">
                <li>Add your first client</li>
                <li>Upload your business card in Settings</li>
                <li>Turn on AI referral assistant</li>
              </ul>
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
    console.error('Could not find Firebase user ID for subscription update', {
      customerId: subscriptionData.customer,
      subscriptionId: subscriptionData.id,
    });
    await recordPermanentWebhookError({
      db: getAdminFirestore(),
      source: 'stripe',
      error: new Error('Could not find Firebase user ID for subscription update'),
      context: {
        handler: 'handleSubscriptionUpdated',
        customerId: subscriptionData.customer,
        subscriptionId: subscriptionData.id,
      },
    });
    return;
  }

  const status = subscriptionData.status === 'active' || subscriptionData.status === 'trialing'
    ? 'active'
    : subscriptionData.status;

  // Refresh trialEndsAt on every subscription update. Goes to null when the
  // trial ends (Stripe nulls trial_end at that point), which is what makes
  // the dashboard "Trial ends in X" chip disappear automatically.
  const trialEndsAt = subscriptionData.trial_end
    ? new Date(subscriptionData.trial_end * 1000)
    : null;

  const db = getAdminFirestore();
  await db.collection('agents').doc(userId).set(
    {
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: subscriptionData.current_period_end
        ? new Date(subscriptionData.current_period_end * 1000)
        : new Date(),
      stripeCustomerId: subscriptionData.customer,
      subscriptionId: subscriptionData.id,
      trialEndsAt,
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
    console.error('Could not find Firebase user ID for subscription deletion', {
      customerId: subscriptionData.customer,
      subscriptionId: subscriptionData.id,
    });
    await recordPermanentWebhookError({
      db: getAdminFirestore(),
      source: 'stripe',
      error: new Error('Could not find Firebase user ID for subscription deletion'),
      context: {
        handler: 'handleSubscriptionDeleted',
        customerId: subscriptionData.customer,
        subscriptionId: subscriptionData.id,
      },
    });
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
    console.error('Could not find Firebase user ID for failed payment', {
      customerId,
      invoiceId: invoice.id,
    });
    await recordPermanentWebhookError({
      db: getAdminFirestore(),
      source: 'stripe',
      error: new Error('Could not find Firebase user ID for failed payment'),
      context: {
        handler: 'handleInvoicePaymentFailed',
        customerId,
        invoiceId: invoice.id,
      },
    });
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

    try {
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
    } catch (handlerError) {
      // Differentiate transient (infrastructure) vs permanent (code bug /
      // config drift) the same way Linq does. Transient → 5xx so Stripe
      // retries from its own queue; permanent → 200 + alert so Stripe
      // doesn't hammer the bug while we fix it. Pre-May-11 we returned
      // 500 on every handler error, which made Stripe retry the same
      // bad event for hours.
      const transient = isTransientWebhookError(handlerError);
      const codeRaw = (handlerError as { code?: unknown } | null)?.code ?? null;
      const message = handlerError instanceof Error ? handlerError.message : String(handlerError);
      console.error('[Stripe Webhook] Handler error:', {
        eventType: event.type,
        transient,
        code: codeRaw,
        message,
        stack: handlerError instanceof Error && typeof handlerError.stack === 'string'
          ? handlerError.stack.slice(0, 1000)
          : null,
      });

      if (transient) {
        return NextResponse.json(
          { ok: false, retryable: true },
          { status: 503 }
        );
      }

      try {
        const db = getAdminFirestore();
        await recordPermanentWebhookError({
          db,
          source: 'stripe',
          error: handlerError,
          context: { eventType: event.type, eventId: event.id },
        });
      } catch {
        // Best-effort alerting.
      }
      return NextResponse.json({ ok: true, permanentError: true });
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
