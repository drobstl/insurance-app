import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { getTwilioClient, getTwilioPhoneNumber } from '../../../../lib/twilio';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { generateOutreachMessage } from '../../../../lib/conservation-ai';
import type { ConservationOutreachContext } from '../../../../lib/conservation-types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DRIP_STATUSES = ['outreach_sent', 'drip_1', 'drip_2'] as const;

const DRIP_DELAYS: Record<string, number> = {
  outreach_sent: 2 * MS_PER_DAY,  // Day 2
  drip_1: 3 * MS_PER_DAY,         // Day 5 (2 + 3)
  drip_2: 2 * MS_PER_DAY,         // Day 7 (5 + 2)
};

const NEXT_STATUS: Record<string, string> = {
  outreach_sent: 'drip_1',
  drip_1: 'drip_2',
  drip_2: 'drip_3',
};

const DRIP_NUMBER: Record<string, number> = {
  outreach_sent: 1,
  drip_1: 2,
  drip_2: 3,
};

/**
 * GET /api/cron/conservation-outreach
 *
 * Vercel Cron -- runs every 30 minutes.
 *
 * A) Fires scheduled outreach for alerts past their 2-hour grace period.
 * B) Sends drip follow-ups on Day 2, Day 5, Day 7 for unresolved alerts.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    const now = Date.now();
    let outreachFired = 0;
    let dripsSent = 0;

    const agentsSnap = await db.collection('agents').get();

    for (const agentDoc of agentsSnap.docs) {
      const agentData = agentDoc.data();
      const agentName = (agentData.name as string) || 'Your Agent';
      const agentFirstName = agentName.split(' ')[0];
      const twilioNumber = (agentData.twilioPhoneNumber as string) || getTwilioPhoneNumber();
      const schedulingUrl = (agentData.schedulingUrl as string) || null;

      const alertsRef = db
        .collection('agents')
        .doc(agentDoc.id)
        .collection('conservationAlerts');

      // ── A) Fire scheduled outreach past grace period ───────────────────
      const scheduledSnap = await alertsRef
        .where('status', '==', 'outreach_scheduled')
        .get();

      for (const alertDoc of scheduledSnap.docs) {
        const alertData = alertDoc.data();
        const scheduledAt = alertData.scheduledOutreachAt as string | null;

        if (!scheduledAt || new Date(scheduledAt).getTime() > now) continue;

        const clientId = alertData.clientId as string | null;
        if (!clientId) continue;

        const clientDoc = await db
          .collection('agents')
          .doc(agentDoc.id)
          .collection('clients')
          .doc(clientId)
          .get();

        if (!clientDoc.exists) continue;

        const clientData = clientDoc.data()!;
        const pushToken = clientData.pushToken as string | undefined;
        const clientPhone = (clientData.phone as string) || '';
        const message = (alertData.initialMessage as string) || '';

        if (!message) continue;

        let pushSent = false;
        let smsSent = false;
        const nowIso = new Date().toISOString();

        // Push notification
        if (pushToken) {
          try {
            const pushData: Record<string, unknown> = {
              type: 'conservation',
              agentId: agentDoc.id,
              clientId,
            };
            if (schedulingUrl) {
              pushData.schedulingUrl = schedulingUrl;
              pushData.includeBookingLink = true;
            }

            const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'Accept-Encoding': 'gzip, deflate',
              },
              body: JSON.stringify({
                to: pushToken,
                title: `Message from ${agentName}`,
                body: message,
                sound: 'default',
                data: pushData,
              }),
            });

            const expoResult = await expoResponse.json();
            pushSent = expoResult?.data?.status === 'ok';
          } catch (e) {
            console.error('Conservation cron push error:', e);
          }
        }

        // SMS
        const normalizedPhone = normalizePhone(clientPhone);
        if (isValidE164(normalizedPhone)) {
          try {
            const twilioClient = getTwilioClient();
            await twilioClient.messages.create({
              body: message,
              from: twilioNumber,
              to: normalizedPhone,
            });
            smsSent = true;
          } catch (e) {
            console.error('Conservation cron SMS error:', e);
          }
        }

        // Write notification record
        if (pushSent || smsSent) {
          await db
            .collection('agents')
            .doc(agentDoc.id)
            .collection('clients')
            .doc(clientId)
            .collection('notifications')
            .add({
              type: 'conservation',
              title: `Message from ${agentName}`,
              body: message,
              includeBookingLink: !!schedulingUrl,
              schedulingUrl: schedulingUrl || null,
              sentAt: FieldValue.serverTimestamp(),
              readAt: null,
              status: pushSent ? 'sent' : 'failed',
            });
        }

        await alertDoc.ref.update({
          status: 'outreach_sent',
          outreachSentAt: nowIso,
          pushSentAt: pushSent ? nowIso : null,
          smsSentAt: smsSent ? nowIso : null,
          lastDripAt: nowIso,
        });

        outreachFired++;
      }

      // ── B) Drip follow-ups ─────────────────────────────────────────────
      for (const status of DRIP_STATUSES) {
        const dripSnap = await alertsRef.where('status', '==', status).get();

        for (const alertDoc of dripSnap.docs) {
          const alertData = alertDoc.data();

          const lastDripAt = alertData.lastDripAt as string | null;
          const outreachSentAt = alertData.outreachSentAt as string | null;
          const lastMs = lastDripAt
            ? new Date(lastDripAt).getTime()
            : outreachSentAt
              ? new Date(outreachSentAt).getTime()
              : 0;

          if (!lastMs) continue;

          const delay = DRIP_DELAYS[status];
          if (now - lastMs < delay) continue;

          const clientId = alertData.clientId as string | null;
          if (!clientId) continue;

          const clientDoc = await db
            .collection('agents')
            .doc(agentDoc.id)
            .collection('clients')
            .doc(clientId)
            .get();

          if (!clientDoc.exists) continue;

          const clientData = clientDoc.data()!;
          const clientPhone = (clientData.phone as string) || '';
          const pushToken = clientData.pushToken as string | undefined;
          const clientName = (alertData.clientName as string) || 'Client';

          // Generate AI drip message
          const dripNumber = DRIP_NUMBER[status];
          const outreachCtx: ConservationOutreachContext = {
            clientFirstName: clientName.split(' ')[0],
            clientName,
            agentName,
            agentFirstName,
            policyType: (alertData.policyType as string) || null,
            policyAge: (alertData.policyAge as number) || null,
            reason: (alertData.reason as 'lapsed_payment' | 'cancellation' | 'other') || 'other',
            schedulingUrl,
            dripNumber,
            premiumAmount: (alertData.premiumAmount as number) || null,
          };

          let dripMessage: string;
          try {
            dripMessage = await generateOutreachMessage(outreachCtx);
          } catch (e) {
            console.error('Failed to generate drip message:', e);
            continue;
          }

          if (!dripMessage) continue;

          let smsSent = false;
          let pushSent = false;

          // SMS
          const normalizedPhone = normalizePhone(clientPhone);
          if (isValidE164(normalizedPhone)) {
            try {
              const twilioClient = getTwilioClient();
              await twilioClient.messages.create({
                body: dripMessage,
                from: twilioNumber,
                to: normalizedPhone,
              });
              smsSent = true;
            } catch (e) {
              console.error('Conservation drip SMS error:', e);
            }
          }

          // Push
          if (pushToken) {
            try {
              const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                  'Accept-Encoding': 'gzip, deflate',
                },
                body: JSON.stringify({
                  to: pushToken,
                  title: `Message from ${agentName}`,
                  body: dripMessage,
                  sound: 'default',
                  data: { type: 'conservation', agentId: agentDoc.id, clientId },
                }),
              });
              const expoResult = await expoResponse.json();
              pushSent = expoResult?.data?.status === 'ok';
            } catch (e) {
              console.error('Conservation drip push error:', e);
            }
          }

          if (smsSent || pushSent) {
            await db
              .collection('agents')
              .doc(agentDoc.id)
              .collection('clients')
              .doc(clientId)
              .collection('notifications')
              .add({
                type: 'conservation',
                title: `Message from ${agentName}`,
                body: dripMessage,
                sentAt: FieldValue.serverTimestamp(),
                readAt: null,
                status: pushSent ? 'sent' : 'failed',
              });
          }

          const existingDripMessages = (alertData.dripMessages as string[]) || [];
          await alertDoc.ref.update({
            status: NEXT_STATUS[status],
            dripCount: (alertData.dripCount || 0) + 1,
            lastDripAt: new Date().toISOString(),
            dripMessages: [...existingDripMessages, dripMessage],
          });

          dripsSent++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      outreachFired,
      dripsSent,
    });
  } catch (error) {
    console.error('Conservation outreach cron error:', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
