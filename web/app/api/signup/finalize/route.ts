import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * POST /api/signup/finalize
 *
 * Called by /signup/success after Stripe redirects the user back.
 * Verifies the Checkout session is paid and the webhook has finished
 * provisioning the Firebase user, then returns a custom auth token
 * so the client can sign in (without ever needing a password).
 *
 * The client polls this endpoint — webhook latency is usually <2s
 * but can spike, so we return 202 + { status: 'pending' } if the
 * pendingSignups doc hasn't been marked fulfilled yet. Final fallback
 * is the password-set link in the welcome email.
 *
 * Body: { sessionId }
 */

interface FinalizeBody {
  sessionId?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as FinalizeBody;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId) {
      return NextResponse.json({ error: 'invalid_session' }, { status: 400 });
    }

    if (!stripe) {
      return NextResponse.json({ error: 'stripe_not_configured' }, { status: 500 });
    }

    // Authoritative payment-status check straight from Stripe, not
    // from our DB. A user could craft a bogus session_id otherwise.
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return NextResponse.json(
        { status: 'unpaid', paymentStatus: session.payment_status },
        { status: 402 },
      );
    }

    const db = getAdminFirestore();
    const pendingSnap = await db.collection('pendingSignups').doc(sessionId).get();
    if (!pendingSnap.exists) {
      // No pendingSignup record means either: (a) this session was a
      // legacy/resubscribe flow (handled elsewhere), or (b) someone is
      // probing finalize with a random session id. Either way, nothing
      // to do here.
      return NextResponse.json({ error: 'not_a_signup_session' }, { status: 404 });
    }

    const pending = pendingSnap.data() as {
      status?: string;
      firebaseUserId?: string;
    };

    if (pending.status !== 'fulfilled' || !pending.firebaseUserId) {
      // Webhook hasn't finished yet — frontend retries.
      return NextResponse.json({ status: 'pending' }, { status: 202 });
    }

    const customToken = await getAdminAuth().createCustomToken(pending.firebaseUserId);

    return NextResponse.json({
      status: 'ready',
      uid: pending.firebaseUserId,
      customToken,
    });
  } catch (error: unknown) {
    console.error('[signup/finalize] error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
