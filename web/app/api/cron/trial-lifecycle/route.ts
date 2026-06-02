import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * GET /api/cron/trial-lifecycle
 *
 * Daily cron — the back wall for the no-card trial (Entry-mechanism
 * cutover, Phase 2). One pass over the agents who are on the trial tier,
 * doing two mutually-exclusive things per agent:
 *
 *   (A) REMINDER — if the trial ends within REMINDER_WINDOW_MS (2 days)
 *       and we haven't emailed them yet (`trialReminderSentAt` unset),
 *       send the "your trial is ending" email and stamp the flag so we
 *       never double-send.
 *
 *   (B) DEFAULT-TO-FREE — if the trial has already ended, drop the agent
 *       to the permanent Free tier (`membershipTier: 'free'`) per the
 *       May 30 Growth + Distribution Lock §2 ("Day 14 default: Free
 *       tier", "No auto-charge, ever, without an explicit paid-plan
 *       selection — hard product rule"). We never charge anyone here;
 *       paid conversion only ever happens through the explicit picker /
 *       Stripe Checkout.
 *
 * Hard guards so a paying agent is NEVER touched:
 *   - we only query `membershipTier == 'trial'` (a paid agent is
 *     'pro' / 'growth' / 'founding' / 'agency', never 'trial'); and
 *   - we additionally skip any doc with `subscriptionStatus == 'active'`
 *     as defense-in-depth.
 *
 * Auth: Bearer ${CRON_SECRET} (same pattern as the other crons).
 * Schedule: daily (vercel.json). Day-granularity is fine — trials are
 * 14 days and a flip landing within 24h of the exact expiry is correct
 * per the "day 14 default" framing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_WINDOW_MS = 2 * DAY_MS;

/** Normalize a Firestore Timestamp | Date | {seconds} | number to millis. */
function tsToMillis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  const obj = v as { toMillis?: () => number; seconds?: number };
  if (typeof obj.toMillis === 'function') return obj.toMillis();
  if (typeof obj.seconds === 'number') return obj.seconds * 1000;
  return null;
}

function reminderEmailHtml(firstName: string, daysLeft: number, dashboardUrl: string): string {
  const dayWord = daysLeft === 1 ? 'day' : 'days';
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; color: #2D3748; line-height: 1.7;">
      <p style="font-size: 16px;">Hey ${firstName},</p>
      <p style="font-size: 16px;">Quick heads up — your AgentForLife trial ends in ${daysLeft} ${dayWord}. After that, you'll move to the free plan automatically (no card, no charge — that's a promise).</p>
      <p style="font-size: 16px;">On the free plan your whole book stays put — every client, policy, and note, safe and exportable anytime. What pauses is the engine that works it for you: the automatic texts, retention nudges, and new application parsing. Pick a plan and it all switches back on — you won't miss a beat.</p>
      <p style="margin: 20px 0;">
        <a href="${dashboardUrl}" style="display:inline-block;padding:12px 20px;background:#005851;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Choose your plan</a>
      </p>
      <p style="font-size: 16px;">Either way, you keep your account and everything in it. Questions? Just reply to this email.</p>
      <p style="font-size: 16px;">— Daniel</p>
    </div>
  `;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const now = Date.now();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app').replace(/\/+$/, '');
  const resendKey = process.env.RESEND_API_KEY;
  const resend = resendKey ? new Resend(resendKey) : null;

  try {
    const db = getAdminFirestore();
    // Only trial-tier agents are candidates — a single-field equality
    // query needs no composite index and keeps us off the full agents
    // collection.
    const snap = await db.collection('agents').where('membershipTier', '==', 'trial').get();

    let agentsScanned = 0;
    let remindersSent = 0;
    let expiredToFree = 0;
    let skippedPaid = 0;

    for (const doc of snap.docs) {
      agentsScanned += 1;
      const data = doc.data() || {};

      // Defense-in-depth: never touch a paying agent.
      if (data.subscriptionStatus === 'active') {
        skippedPaid += 1;
        continue;
      }

      const trialEndsAtMs = tsToMillis(data.trialEndsAt);
      if (trialEndsAtMs == null) {
        // No usable expiry — leave it alone rather than guess.
        continue;
      }

      // (B) Expired → default to Free.
      if (trialEndsAtMs <= now) {
        try {
          await doc.ref.set(
            {
              membershipTier: 'free',
              freeSince: FieldValue.serverTimestamp(),
              trialExpiredAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          expiredToFree += 1;
          console.log('[trial-lifecycle] defaulted to free', { agentId: doc.id });
        } catch (err) {
          console.error('[trial-lifecycle] flip-to-free failed', {
            agentId: doc.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        continue;
      }

      // (A) Ending soon + not yet reminded → send reminder once.
      const endingSoon = trialEndsAtMs - now <= REMINDER_WINDOW_MS;
      const alreadyReminded = Boolean(data.trialReminderSentAt);
      if (endingSoon && !alreadyReminded) {
        const email = typeof data.email === 'string' ? data.email : (typeof data.emailLower === 'string' ? data.emailLower : '');
        if (!email) continue;
        const firstName = typeof data.name === 'string' && data.name.trim().length > 0 ? data.name.trim().split(' ')[0] : 'there';
        const daysLeft = Math.max(1, Math.ceil((trialEndsAtMs - now) / DAY_MS));
        try {
          if (resend) {
            await resend.emails.send({
              from: 'Daniel Roberts — AgentForLife™ <support@agentforlife.app>',
              to: email,
              subject: `Your AgentForLife trial ends in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`,
              html: reminderEmailHtml(firstName, daysLeft, `${appUrl}/dashboard`),
            });
          }
          // Stamp the flag even if Resend isn't configured in this env so
          // we don't loop — but only if we actually attempted a send path.
          if (resend) {
            await doc.ref.set({ trialReminderSentAt: FieldValue.serverTimestamp() }, { merge: true });
            remindersSent += 1;
            console.log('[trial-lifecycle] reminder sent', { agentId: doc.id, daysLeft });
          }
        } catch (err) {
          console.error('[trial-lifecycle] reminder failed (will retry next run)', {
            agentId: doc.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json({
      success: true,
      agentsScanned,
      remindersSent,
      expiredToFree,
      skippedPaid,
      elapsedMs,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[trial-lifecycle] cron failed', { error: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
