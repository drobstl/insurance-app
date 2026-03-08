import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { sendOrCreateChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { Resend } from 'resend';
import { generateOutreachMessage, generateConservationEmail } from '../../../../lib/conservation-ai';
import { getCarrierServicePhone } from '../../../../lib/carriers';
import type { ConservationOutreachContext, ConservationChannel } from '../../../../lib/conservation-types';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DRIP_STATUSES = ['outreach_sent', 'drip_1', 'drip_2'] as const;

const DRIP_DELAYS: Record<string, number> = {
  outreach_sent: 2 * MS_PER_DAY,
  drip_1: 3 * MS_PER_DAY,
  drip_2: 2 * MS_PER_DAY,
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

const EMAIL_DRIP_NUMBERS = new Set([2, 3]);

async function sendPushNotification(
  pushToken: string,
  agentName: string,
  message: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
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
        badge: 1,
        priority: 'high',
        data,
        ...(data.includeBookingLink ? { categoryId: 'BOOK_APPOINTMENT' } : {}),
      }),
    });
    const result = await res.json();
    return result?.data?.status === 'ok';
  } catch (e) {
    console.error('Conservation push error:', e);
    return false;
  }
}

async function sendConservationEmailMessage(
  to: string,
  agentName: string,
  subject: string,
  body: string,
): Promise<boolean> {
  try {
    const resend = getResend();
    await resend.emails.send({
      from: `${agentName} via AgentForLife <support@agentforlife.app>`,
      to,
      subject,
      text: body,
    });
    return true;
  } catch (e) {
    console.error('Conservation email error:', e);
    return false;
  }
}

/**
 * GET /api/cron/conservation-outreach
 *
 * Vercel Cron -- runs every 30 minutes.
 *
 * A) Fires scheduled outreach for alerts past their 2-hour grace period.
 * B) Sends drip follow-ups on Day 2, Day 5, Day 7 for unresolved alerts.
 *
 * Channels: Linq (iMessage > RCS > SMS) + Push + Email (complement on drips 2-3,
 * sole channel for email-only clients).
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
      const schedulingUrl = (agentData.schedulingUrl as string) || null;
      const agentEmail = (agentData.email as string) || null;
      const agentPhone = (agentData.phoneNumber as string) || null;

      const alertsRef = db
        .collection('agents')
        .doc(agentDoc.id)
        .collection('conservationAlerts');

      // A) Fire scheduled outreach past grace period
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
        const clientEmail = (clientData.email as string) || '';
        const message = (alertData.initialMessage as string) || '';

        if (!message) continue;

        let pushSent = false;
        let smsSent = false;
        let emailSent = false;
        let linqChatId: string | null = (alertData.chatId as string) || null;
        const nowIso = new Date().toISOString();
        const usedChannels: ConservationChannel[] = [];

        if (pushToken) {
          const pushData: Record<string, unknown> = {
            type: 'conservation',
            agentId: agentDoc.id,
            clientId,
          };
          if (schedulingUrl) {
            pushData.schedulingUrl = schedulingUrl;
            pushData.includeBookingLink = true;
          }
          pushSent = await sendPushNotification(pushToken, agentName, message, pushData);
          if (pushSent) usedChannels.push('push');
        }

        const normalizedPhone = normalizePhone(clientPhone);
        if (isValidE164(normalizedPhone)) {
          try {
            const result = await sendOrCreateChat({ to: normalizedPhone, text: message });
            smsSent = true;
            linqChatId = result.chatId;
            usedChannels.push('sms');
          } catch (e) {
            console.error('Conservation cron Linq error:', e);
          }
        }

        // Email-only fallback: if no SMS and no push available, send via email
        if (!smsSent && !pushSent && clientEmail) {
          const clientFirstName = ((alertData.clientName as string) || 'Client').split(' ')[0];
          emailSent = await sendConservationEmailMessage(
            clientEmail,
            agentName,
            `${agentFirstName} here -- about your policy`,
            message,
          );
          if (emailSent) usedChannels.push('email');
        }

        if (pushSent || smsSent || emailSent) {
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
              status: pushSent ? 'sent' : smsSent ? 'sent' : emailSent ? 'sent' : 'failed',
            });
        }

        const conversationEntry = {
          role: 'agent-ai' as const,
          body: message,
          timestamp: nowIso,
          channels: usedChannels,
        };

        await alertDoc.ref.update({
          status: 'outreach_sent',
          outreachSentAt: nowIso,
          pushSentAt: pushSent ? nowIso : null,
          smsSentAt: smsSent ? nowIso : null,
          lastDripAt: nowIso,
          chatId: linqChatId,
          conversation: FieldValue.arrayUnion(conversationEntry),
        });

        outreachFired++;
      }

      // B) Drip follow-ups
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
          const clientEmail = (clientData.email as string) || '';
          const pushToken = clientData.pushToken as string | undefined;
          const clientName = (alertData.clientName as string) || 'Client';
          const clientFirstName = clientName.split(' ')[0];
          const channels = (alertData.availableChannels as ConservationChannel[]) || [];

          const dripNumber = DRIP_NUMBER[status];
          const reason = (alertData.reason as 'lapsed_payment' | 'cancellation' | 'other') || 'other';
          const carrierName = (alertData.carrier as string) || '';
          const carrierServicePhone = getCarrierServicePhone(carrierName);

          const outreachCtx: ConservationOutreachContext = {
            clientFirstName,
            clientName,
            agentName,
            agentFirstName,
            policyType: (alertData.policyType as string) || null,
            policyAge: (alertData.policyAge as number) || null,
            reason,
            schedulingUrl,
            dripNumber,
            premiumAmount: (alertData.premiumAmount as number) || null,
            availableChannels: channels,
            carrier: carrierName || null,
            carrierServicePhone,
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
          let emailSent = false;
          let linqChatId: string | null = (alertData.chatId as string) || null;
          const usedChannels: ConservationChannel[] = [];

          const normalizedPhone = normalizePhone(clientPhone);
          if (isValidE164(normalizedPhone)) {
            try {
              const result = await sendOrCreateChat({
                to: normalizedPhone,
                chatId: linqChatId,
                text: dripMessage,
              });
              smsSent = true;
              if (!linqChatId) linqChatId = result.chatId;
              usedChannels.push('sms');
            } catch (e) {
              console.error('Conservation drip Linq error:', e);
            }
          }

          if (pushToken) {
            const dripPushData: Record<string, unknown> = {
              type: 'conservation',
              agentId: agentDoc.id,
              clientId,
            };
            if (schedulingUrl) {
              dripPushData.schedulingUrl = schedulingUrl;
              dripPushData.includeBookingLink = true;
            }
            pushSent = await sendPushNotification(
              pushToken,
              agentName,
              dripMessage,
              dripPushData,
            );
            if (pushSent) usedChannels.push('push');
          }

          // Email complement on drips 2+3, or email-only fallback at any stage
          const isEmailOnlyClient = !smsSent && !pushSent && clientEmail;
          const shouldComplementWithEmail = EMAIL_DRIP_NUMBERS.has(dripNumber) && clientEmail;

          if (isEmailOnlyClient || shouldComplementWithEmail) {
            try {
              const emailBody = await generateConservationEmail({
                ...outreachCtx,
                agentEmail,
                agentPhone,
                coverageAmount: (alertData.coverageAmount as number) || null,
              });
              emailSent = await sendConservationEmailMessage(
                clientEmail,
                agentName,
                `${agentFirstName} here -- about your ${(alertData.policyType as string) || 'insurance'} policy`,
                emailBody,
              );
              if (emailSent) usedChannels.push('email');
            } catch (e) {
              console.error('Conservation drip email error:', e);
            }
          }

          if (smsSent || pushSent || emailSent) {
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
                includeBookingLink: !!schedulingUrl,
                sentAt: FieldValue.serverTimestamp(),
                readAt: null,
                status: pushSent ? 'sent' : smsSent ? 'sent' : emailSent ? 'sent' : 'failed',
              });
          }

          const conversationEntry = {
            role: 'agent-ai' as const,
            body: dripMessage,
            timestamp: new Date().toISOString(),
            channels: usedChannels,
          };

          const existingDripMessages = (alertData.dripMessages as string[]) || [];
          const updateData: Record<string, unknown> = {
            status: NEXT_STATUS[status],
            dripCount: (alertData.dripCount || 0) + 1,
            lastDripAt: new Date().toISOString(),
            dripMessages: [...existingDripMessages, dripMessage],
            conversation: FieldValue.arrayUnion(conversationEntry),
          };

          if (linqChatId && !alertData.chatId) {
            updateData.chatId = linqChatId;
          }

          await alertDoc.ref.update(updateData);

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
