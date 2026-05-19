import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import {
  isPushEligible,
  readValidPushToken,
  sendExpoPush,
} from '../../../../lib/push-permission-lifecycle';

/**
 * GET /api/cron/appointment-push-reminders
 *
 * Chunk 4f-extension: scan every agent's upcoming appointments and
 * auto-push a reminder to the lead's mobile app (if they downloaded
 * it and granted push permission).
 *
 * Per-agent timing is controlled by `agents/{id}.reminderPushHoursBefore`
 * (default 1 hour; 0 disables).
 *
 * Schedule: every 5 minutes (vercel.json). With a 5-min cadence and a
 * sliding 15-min lookahead window, an appointment scheduled for "exactly
 * 1 hour from now" gets a reminder somewhere between 60 and 65 minutes
 * before — close enough.
 *
 * Channel separation:
 *   - sentReminderAt        → agent-sent SMS (Chunk 4f-MVP)
 *   - reminderPushSentAt    → this cron's auto-push (Chunk 4f-extension)
 *
 * The two are independent: an agent who hand-sends an SMS reminder isn't
 * prevented from getting an auto-push as well; same the other direction.
 * The handoff doc's design is "both surfaces coexist peacefully".
 */

interface RunCounts {
  agentsScanned: number;
  candidates: number;
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

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - startedAt,
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
