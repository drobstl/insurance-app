import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { FieldValue } from 'firebase-admin/firestore';
import { stripe } from '../../../../lib/stripe';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { notifyFounderOfSignup } from '../../../../lib/founder-signup-alert';
import { captureServerEvent } from '../../../../lib/posthog-server';
import { ANALYTICS_EVENTS } from '../../../../lib/analytics-events';

/**
 * POST /api/signup/trial
 *
 * No-card signup entry point (Entry-mechanism cutover, Phase 1 —
 * June 2026). The new default front door per the May 30 Growth +
 * Distribution Lock: agents sign up with NO payment info, get 14 days
 * of full Pro access, and only pick a paid plan later.
 *
 * Coexists with the card-at-signup flow (`start-checkout` →
 * Stripe Checkout). That flow stays untouched and is reached via
 * `/signup?tier=X`; bare `/signup` posts here.
 *
 * Order of operations:
 *   1. Validate email + name + phoneNumber.
 *   2. Reject if email already has a Firebase Auth user (409) — the
 *      form routes them to /login.
 *   3. Create the Firebase Auth user (no password — they set one via
 *      the welcome email's password-reset link).
 *   4. Create a Stripe customer stamped with `firebaseUserId` (NO
 *      subscription). Non-fatal: the upgrade route can create one
 *      later if this fails.
 *   5. Resolve the agent-invite referrer + stash the FirstPromoter
 *      tracking id so affiliate/referral attribution into the no-card
 *      door isn't lost (credited later when they pick paid — see
 *      create-checkout-session, which forwards `affiliateTid`).
 *   6. Write `agents/{uid}` with the trial state.
 *   7. Send the welcome email (Resend) with a set-your-password link.
 *   8. Mint a custom token so the client can sign in immediately.
 *
 * Body: { email, name, phoneNumber, refCode?, fp_tid? }
 * Returns: { uid, customToken }
 */

interface TrialSignupBody {
  email?: unknown;
  name?: unknown;
  phoneNumber?: unknown;
  refCode?: unknown;
  fp_tid?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TRIAL_DAYS = 14;
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as TrialSignupBody;

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
    const refCode =
      typeof body.refCode === 'string' && body.refCode.trim().length > 0
        ? body.refCode.trim().toUpperCase()
        : null;
    const fpTid =
      typeof body.fp_tid === 'string' && body.fp_tid.trim().length > 0
        ? body.fp_tid.trim()
        : null;

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
    }
    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
    }
    if (!phoneNumber) {
      return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
    }

    const auth = getAdminAuth();

    // Block re-signup with an email that already has a Firebase user —
    // the form routes them to /login.
    try {
      await auth.getUserByEmail(email);
      return NextResponse.json({ error: 'email_in_use' }, { status: 409 });
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code !== 'auth/user-not-found') {
        console.error('[signup/trial] auth lookup failed', err);
        return NextResponse.json({ error: 'server_error' }, { status: 500 });
      }
      // user-not-found is the happy path — keep going.
    }

    const db = getAdminFirestore();

    // Resolve the agent-invite referrer up front. Silently drop bad
    // codes (no user-facing error) — mirrors start-checkout.
    let referrerId: string | null = null;
    if (refCode) {
      try {
        const codeDoc = await db.collection('agentInviteCodes').doc(refCode).get();
        if (codeDoc.exists) {
          const data = codeDoc.data();
          referrerId = typeof data?.agentId === 'string' ? data.agentId : null;
        }
      } catch (err) {
        console.warn('[signup/trial] referrer lookup failed', err);
      }
    }

    // Create the Auth user. No password is set here — the welcome
    // email carries a one-click password-set link.
    const created = await auth.createUser({
      email,
      displayName: name,
      emailVerified: false,
    });
    const uid = created.uid;

    // Create a Stripe customer (NO subscription) keyed by firebaseUserId
    // so a later paid pick reuses it instead of creating a duplicate.
    // Non-fatal: create-checkout-session creates one if this is missing.
    let stripeCustomerId: string | null = null;
    try {
      const customer = await stripe.customers.create({
        email,
        name,
        phone: phoneNumber,
        metadata: { firebaseUserId: uid },
      });
      stripeCustomerId = customer.id;
    } catch (err) {
      console.error('[signup/trial] stripe customer create failed (non-fatal)', err);
    }

    // Write the trial state. `membershipTier: 'trial'` is what the
    // gating helpers read — NOT a separate `tier` field.
    const profile: Record<string, unknown> = {
      name,
      email,
      emailLower: email,
      phoneNumber,
      membershipTier: 'trial',
      trialStartedAt: FieldValue.serverTimestamp(),
      trialEndsAt: new Date(Date.now() + TRIAL_MS),
      createdAt: FieldValue.serverTimestamp(),
    };
    if (stripeCustomerId) profile.stripeCustomerId = stripeCustomerId;
    if (referrerId) profile.referredByAgent = referrerId;
    if (fpTid) profile.affiliateTid = fpTid;

    await db.collection('agents').doc(uid).set(profile, { merge: true });

    // Funnel denominator — fired AFTER the trial doc commits so it lines
    // up with the later server-side conversion events (subscription_
    // activated / trial_converted) on the same person (distinct_id = uid).
    // Best-effort and awaited per lib/posthog-server.ts (a fire-and-forget
    // fetch can be frozen when the Vercel function suspends post-response).
    await captureServerEvent(uid, ANALYTICS_EVENTS.TRIAL_STARTED, {
      source: 'no_card_trial',
      new_account: true,
      referred: referrerId != null,
      has_affiliate: fpTid != null,
    });

    // Founder alert — fire-and-forget; never blocks the signup.
    void notifyFounderOfSignup({
      uid,
      name,
      email,
      membershipTier: 'trial',
      referredByAgent: referrerId ?? null,
      source: 'trial',
    }).catch(() => {});

    // Welcome email — no-card trial users have no password yet, so the
    // primary CTA is a one-click password-set link. Non-fatal.
    try {
      const key = process.env.RESEND_API_KEY;
      if (key) {
        const resend = new Resend(key);
        const firstName = name.split(' ')[0] || 'there';
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app').replace(/\/+$/, '');

        let passwordSetLink: string | null = null;
        try {
          passwordSetLink = await auth.generatePasswordResetLink(email);
        } catch (linkErr) {
          console.error('[signup/trial] failed to generate password-set link', linkErr);
        }
        const ctaHref = passwordSetLink ?? `${appUrl}/dashboard`;

        await resend.emails.send({
          from: 'Daniel Roberts — AgentForLife™ <support@agentforlife.app>',
          to: email,
          subject: 'Welcome to AgentForLife — your 14-day trial is live',
          html: `
            <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; color: #2D3748; line-height: 1.7;">
              <p style="font-size: 16px;">Hey ${firstName},</p>
              <p style="font-size: 16px;">Welcome to AgentForLife. Your 14-day free trial is live — full Pro access, no card required. One last step: set your password so you can log back in.</p>
              <p style="margin: 20px 0;">
                <a href="${ctaHref}" style="display:inline-block;padding:12px 20px;background:#005851;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Set your password</a>
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
        console.log(`[signup/trial] welcome email sent to ${email}`);
      }
    } catch (e) {
      console.error('[signup/trial] failed to send welcome email (non-fatal)', e);
    }

    const customToken = await auth.createCustomToken(uid);

    return NextResponse.json({ uid, customToken });
  } catch (error: unknown) {
    console.error('[signup/trial] error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
