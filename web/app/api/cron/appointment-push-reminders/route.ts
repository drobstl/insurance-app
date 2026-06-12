import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { isFreeTier } from '../../../../lib/tier-gating';
import {
  isPushEligible,
  readValidPushToken,
  sendExpoPush,
} from '../../../../lib/push-permission-lifecycle';
import { pushAgentForConfirmation } from '../../../../lib/agent-push';

/**
 * GET /api/cron/appointment-push-reminders
 *
 * Chunk 4f-extension: scan every agent's upcoming appointments and fire
 * two independent pushes:
 *   1. AGENT-side — wake the agent's phone with a "tap to send the
 *      reminder text" notification (deep-links into the send screen).
 *      This is the one agents actually rely on.
 *   2. LEAD-side — auto-push a reminder to the lead's own mobile app, if
 *      they happen to have it installed and granted push permission.
 *
 * Per-agent timing is controlled by `agents/{id}.reminderPushHoursBefore`
 * (default 1 hour; 0 disables).
 *
 * Schedule: every 5 minutes (vercel.json). With a 5-min cadence and a
 * sliding 15-min lookahead window, an appointment scheduled for "exactly
 * 1 hour from now" gets a reminder somewhere between 60 and 65 minutes
 * before — close enough.
 *
 * Channel separation (all independent — each has its own stamp; none
 * gates another):
 *   - sentReminderAt           → agent hand-sent SMS (Chunk 4f-MVP)
 *   - agentReminderPushSentAt  → agent-side push that tees up the
 *                                reminder text (restored by this fix)
 *   - reminderPushSentAt       → lead-side auto-push to the client's app
 *
 * IMPORTANT: the agent-side push must NOT be gated on the lead having the
 * app — a pre-sale lead with an upcoming appointment never does. Keeping
 * the agent push ahead of the lead-token check is the whole point of this
 * ordering; an earlier version nested it below the lead-token `continue`,
 * so it silently never ran.
 */

interface RunCounts {
  agentsScanned: number;
  candidates: number;
  // Agent-side 1hr reminder push (the load-bearing notification).
  agentPushSent: number;
  agentNoToken: number;
  agentPushFailed: number;
  // Lead-side auto-reminder (dormant: pre-sale leads have no token).
  pushSent: number;
  noToken: number;
  pushFailed: number;
  alreadySent: number;
  outOfWindow: number;
  errors: number;
}

const LOOKAHEAD_WINDOW_MINUTES = 15;
const DEFAULT_HOURS_BEFORE = 1;

function shortTime(d: Date, tz: string): string {
  try {
    return d.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
    }).toLowerCase().replace(' ', '');
  } catch {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const counts: RunCounts = {
    agentsScanned: 0,
    candidates: 0,
    agentPushSent: 0,
    agentNoToken: 0,
    agentPushFailed: 0,
    pushSent: 0,
    noToken: 0,
    pushFailed: 0,
    alreadySent: 0,
    outOfWindow: 0,
    errors: 0,
  };

  try {
    const db = getAdminFirestore();
    const agentsSnap = await db.collection('agents').get();
    const now = new Date();
    const nowMs = now.getTime();

    for (const agentDoc of agentsSnap.docs) {
      counts.agentsScanned++;
      const agentId = agentDoc.id;
      const agentData = agentDoc.data();
      // Free tier is engine-paused: skip client-facing automated outreach.
      if (isFreeTier(agentData.membershipTier as string | undefined)) continue;
      const hoursBefore = typeof agentData.reminderPushHoursBefore === 'number'
        ? agentData.reminderPushHoursBefore
        : DEFAULT_HOURS_BEFORE;
      if (hoursBefore <= 0) continue;  // agent opted out

      const agentName = typeof agentData.name === 'string' ? agentData.name : 'Your agent';
      const agentFirstName = agentName.split(/\s+/)[0] || 'your agent';

      // Look at appointments scheduled between [now + hoursBefore - windowEnd, now + hoursBefore + windowStart].
      // We want to fire at roughly hoursBefore before scheduledAt. So scheduledAt should be in
      // [now + (hoursBefore * 60 - LOOKAHEAD_WINDOW_MINUTES)ms, now + hoursBefore*60ms].
      const targetMs = nowMs + hoursBefore * 60 * 60 * 1000;
      const windowStartMs = targetMs - LOOKAHEAD_WINDOW_MINUTES * 60 * 1000;
      const windowEndMs = targetMs;
      const windowStartTs = Timestamp.fromDate(new Date(windowStartMs));
      const windowEndTs = Timestamp.fromDate(new Date(windowEndMs));

      const apptSnap = await db
        .collection('agents').doc(agentId).collection('appointments')
        .where('status', '==', 'scheduled')
        .where('scheduledAt', '>=', windowStartTs)
        .where('scheduledAt', '<=', windowEndTs)
        .get();

      for (const apptDoc of apptSnap.docs) {
        counts.candidates++;
        const appt = apptDoc.data();

        // ── Agent-side 1hr reminder push ──
        // The load-bearing notification: wakes the AGENT's phone so they
        // can hand-send a "see you in an hour" text to the lead. It is
        // INDEPENDENT of the lead-side auto-reminder below and must never
        // be gated on the lead having the app — a lead with an upcoming
        // sales appointment is pre-sale and (per the May 18 push-token
        // narrowing) has no app/token. This block used to live *after* the
        // lead-token `continue` further down, so in practice it never ran:
        // the lead had no token, we bailed the iteration, and the agent
        // never got their reminder. Gate only on its own
        // `agentReminderPushSentAt` stamp so repeated sweeps of the same
        // window don't double-push.
        if (!appt.agentReminderPushSentAt) {
          const leadName = typeof appt.leadName === 'string' ? appt.leadName : '';
          const agentRes = await pushAgentForConfirmation({
            db,
            agentId,
            apptId: apptDoc.id,
            leadName,
            kind: 'reminder',
          });
          if (agentRes.outcome === 'ok') {
            counts.agentPushSent++;
            await apptDoc.ref.update({ agentReminderPushSentAt: Timestamp.now() }).catch((err) => {
              console.error('[appointment-push-reminders] agent stamp failed', {
                agentId,
                apptId: apptDoc.id,
                err,
              });
            });
          } else if (agentRes.outcome === 'no_token' || agentRes.outcome === 'ineligible') {
            counts.agentNoToken++;
          } else {
            counts.agentPushFailed++;
            console.warn('[appointment-push-reminders] agent push failed', {
              agentId,
              apptId: apptDoc.id,
              outcome: agentRes.outcome,
              reason: agentRes.reason,
            });
          }
        }

        // ── Lead-side auto-reminder push ──
        // Dormant in practice: pre-sale leads have no app/token, so
        // `readValidPushToken` returns null and we skip below. Kept intact
        // (not deleted) so the lane revives automatically if leads ever
        // register tokens — that revival is a separate product decision
        // from the May 18 narrowing, out of scope for this fix.
        if (appt.reminderPushSentAt) {
          counts.alreadySent++;
          continue;
        }

        const leadId = typeof appt.leadId === 'string' ? appt.leadId : '';
        if (!leadId) continue;
        const leadRef = db.collection('agents').doc(agentId).collection('leads').doc(leadId);
        let leadSnap;
        try {
          leadSnap = await leadRef.get();
        } catch (err) {
          counts.errors++;
          console.error('[appointment-push-reminders] lead read failed', { agentId, leadId, err });
          continue;
        }
        if (!leadSnap.exists) continue;
        const leadData = leadSnap.data() ?? {};

        const pushToken = readValidPushToken(leadData);
        if (!pushToken) {
          counts.noToken++;
          continue;
        }

        const scheduledAt = (appt.scheduledAt as Timestamp).toDate();
        const tz = typeof appt.scheduledAtTimeZone === 'string' && appt.scheduledAtTimeZone
          ? appt.scheduledAtTimeZone
          : 'UTC';
        const time = shortTime(scheduledAt, tz);
        const meetingUrl = typeof appt.meetingUrl === 'string' ? appt.meetingUrl : '';

        const title = `Reminder: ${agentFirstName} at ${time}`;
        const body = meetingUrl
          ? `Your Mortgage Protection call is coming up. Tap to join.`
          : `Your Mortgage Protection call is coming up.`;

        const outcome = await sendExpoPush(
          {
            to: pushToken,
            title,
            body,
            sound: 'default',
            data: {
              kind: 'appointment_reminder',
              appointmentId: apptDoc.id,
              leadId,
              meetingUrl: meetingUrl || undefined,
            },
          },
          {
            ref: leadRef,
            agentId,
          },
        );

        if (outcome.status === 'ok') {
          counts.pushSent++;
          await apptDoc.ref.update({ reminderPushSentAt: Timestamp.now() }).catch((err) => {
            console.error('[appointment-push-reminders] stamp failed', { agentId, apptId: apptDoc.id, err });
          });
        } else {
          counts.pushFailed++;
          console.warn('[appointment-push-reminders] send failed', {
            agentId,
            apptId: apptDoc.id,
            status: outcome.status,
            errorCode: 'errorCode' in outcome ? outcome.errorCode : null,
          });
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    // Per-run summary so the agent-push lane is visible in logs even on a
    // clean run — only failures were logged before, which is how a fully
    // dead agent-reminder lane stayed invisible until an agent reported it.
    // `agentPushSent` is the "is it firing?" number to watch.
    console.log('[appointment-push-reminders] run complete', { durationMs, ...counts });

    return NextResponse.json({
      success: true,
      durationMs,
      ...counts,
    });
  } catch (error) {
    console.error('[appointment-push-reminders] fatal', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'unknown',
      ...counts,
    }, { status: 500 });
  }
}
