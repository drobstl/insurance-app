import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { Resend } from 'resend';

import { getAdminFirestore } from './firebase-admin';
import { getAdminEmails } from './admin';
import {
  isPushEligible,
  readValidPushToken,
  sendExpoPush,
} from './push-permission-lifecycle';

/**
 * Founder alert on every new agent signup (trial OR paid — any kind).
 *
 * Three independent, fully-guarded steps. This function NEVER throws, so
 * callers can fire it from a signup route OR the payment-critical Stripe
 * webhook with zero risk of blocking or failing a signup/charge:
 *   1. Record an `adminSignupEvents/{uid}` doc (feeds the admin Growth
 *      dashboard + unread badge; keyed by uid so a webhook retry is
 *      idempotent).
 *   2. Email the admin(s) (NEXT_PUBLIC_ADMIN_EMAILS) via Resend.
 *   3. Push the admin agents that have a registered, non-revoked device
 *      token, through the standard Expo push lifecycle.
 *
 * Always call as `void notifyFounderOfSignup(...).catch(() => {})`.
 */
export interface NewSignupInfo {
  uid: string;
  name?: string | null;
  email?: string | null;
  membershipTier?: string | null;
  referredByAgent?: string | null;
  source: 'trial' | 'paid';
}

export async function notifyFounderOfSignup(info: NewSignupInfo): Promise<void> {
  await runSafely('record', () => recordSignupEvent(info));
  await runSafely('email', () => emailAdmins(info));
  await runSafely('push', () => pushAdmins(info));
}

async function runSafely(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[founder-signup-alert] ${label} failed (non-fatal)`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function recordSignupEvent(info: NewSignupInfo): Promise<void> {
  const db = getAdminFirestore();
  await db
    .collection('adminSignupEvents')
    .doc(info.uid)
    .set(
      {
        uid: info.uid,
        name: info.name ?? null,
        email: info.email ?? null,
        membershipTier: info.membershipTier ?? null,
        referredByAgent: info.referredByAgent ?? null,
        source: info.source,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

async function emailAdmins(info: NewSignupInfo): Promise<void> {
  const admins = getAdminEmails();
  const key = process.env.RESEND_API_KEY;
  if (admins.length === 0 || !key) return;

  const resend = new Resend(key);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app').replace(/\/+$/, '');
  const tier = info.membershipTier || 'unknown';
  const who = info.name || info.email || info.uid;

  await resend.emails.send({
    from: 'AgentForLife™ <support@agentforlife.app>',
    to: admins,
    subject: `New signup: ${who} — ${tier}${info.referredByAgent ? ' (referred)' : ''}`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; color: #2D3748; line-height: 1.7;">
        <p style="font-size:16px;"><strong>New ${info.source} signup on AgentForLife.</strong></p>
        <ul style="font-size:15px;">
          <li><strong>Name:</strong> ${esc(info.name) || '—'}</li>
          <li><strong>Email:</strong> ${esc(info.email) || '—'}</li>
          <li><strong>Tier:</strong> ${esc(tier)}</li>
          ${info.referredByAgent ? `<li><strong>Referred by agent:</strong> ${esc(info.referredByAgent)}</li>` : ''}
        </ul>
        <p style="margin-top:16px;">
          <a href="${appUrl}/dashboard/admin/growth" style="color:#005851;font-weight:600;">View growth dashboard →</a>
        </p>
      </div>
    `,
  });
}

async function pushAdmins(info: NewSignupInfo): Promise<void> {
  const admins = getAdminEmails();
  if (admins.length === 0) return;

  const db = getAdminFirestore();
  // The admin set is tiny — well under Firestore's `in` limit. `emailLower`
  // is the normalized key written on every agent doc.
  const snap = await db.collection('agents').where('emailLower', 'in', admins).get();
  if (snap.empty) return;

  const tier = info.membershipTier || 'unknown';
  const who = info.name || info.email || 'Someone';
  const title = 'New AgentForLife signup';
  const body = `${who} just signed up (${tier}).`;

  await Promise.all(
    snap.docs.map(async (doc) => {
      const data = doc.data();
      if (!isPushEligible(data)) return;
      const token = readValidPushToken(data);
      if (!token) return;
      await sendExpoPush(
        {
          to: token,
          title,
          body,
          sound: 'default',
          priority: 'high',
          data: { deepLink: 'agentforlife://admin/growth', kind: 'admin_signup' },
        },
        { agentId: doc.id, ref: doc.ref },
      );
    }),
  );
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
