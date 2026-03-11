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
import {
  type TouchStage,
  TOUCH_STAGE_TO_STATUS,
  STATUS_TO_TOUCH_STAGE,
  TOUCH_STAGE_DRIP_NUMBER,
  NEXT_TOUCH_STAGE,
  TOUCH_STAGE_DELAY,
  STAGE_FALLBACK_ORDER,
  STAGE_COMPLEMENT_EMAIL,
} from '../../../../lib/conservation-types';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

// ---------------------------------------------------------------------------
// Channel senders
// ---------------------------------------------------------------------------

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
      from: `${agentName} via AgentForLife™ <support@agentforlife.app>`,
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

// ---------------------------------------------------------------------------
// Channel availability checks
// ---------------------------------------------------------------------------

interface ChannelAvailability {
  push: boolean;
  sms: boolean;
  email: boolean;
  pushToken: string | undefined;
  normalizedPhone: string;
  clientEmail: string;
}

function getChannelAvailability(clientData: FirebaseFirestore.DocumentData): ChannelAvailability {
  const pushToken = clientData.pushToken as string | undefined;
  const clientPhone = (clientData.phone as string) || '';
  const clientEmail = (clientData.email as string) || '';
  const normalizedPhone = normalizePhone(clientPhone);
  return {
    push: !!pushToken,
    sms: isValidE164(normalizedPhone),
    email: !!clientEmail,
    pushToken,
    normalizedPhone,
    clientEmail,
  };
}

function isChannelAvailable(channel: ConservationChannel, avail: ChannelAvailability): boolean {
  return avail[channel];
}

// ---------------------------------------------------------------------------
// Send on a single channel, returning the channel used (or null on failure)
// ---------------------------------------------------------------------------

interface SendResult {
  channel: ConservationChannel;
  chatId: string | null;
}

async function sendOnChannel(
  channel: ConservationChannel,
  opts: {
    message: string;
    avail: ChannelAvailability;
    agentName: string;
    agentFirstName: string;
    agentEmail: string | null;
    agentPhone: string | null;
    schedulingUrl: string | null;
    agentId: string;
    clientId: string;
    existingChatId: string | null;
    outreachCtx: ConservationOutreachContext;
    alertData: FirebaseFirestore.DocumentData;
  },
): Promise<SendResult | null> {
  const {
    message, avail, agentName, schedulingUrl,
    agentId, clientId, existingChatId,
  } = opts;

  if (channel === 'push') {
    if (!avail.pushToken) return null;
    const pushData: Record<string, unknown> = {
      type: 'conservation',
      agentId,
      clientId,
    };
    if (schedulingUrl) {
      pushData.schedulingUrl = schedulingUrl;
      pushData.includeBookingLink = true;
    }
    const ok = await sendPushNotification(avail.pushToken, agentName, message, pushData);
    return ok ? { channel: 'push', chatId: existingChatId } : null;
  }

  if (channel === 'sms') {
    if (!avail.sms) return null;
    try {
      const result = await sendOrCreateChat({
        to: avail.normalizedPhone,
        chatId: existingChatId,
        text: message,
      });
      return { channel: 'sms', chatId: result.chatId };
    } catch (e) {
      console.error('Conservation Linq error:', e);
      return null;
    }
  }

  if (channel === 'email') {
    if (!avail.clientEmail) return null;
    const policyType = (opts.alertData.policyType as string) || 'insurance';
    const emailBody = await generateConservationEmail({
      ...opts.outreachCtx,
      agentEmail: opts.agentEmail,
      agentPhone: opts.agentPhone,
      coverageAmount: (opts.alertData.coverageAmount as number) || null,
    });
    const ok = await sendConservationEmailMessage(
      avail.clientEmail,
      agentName,
      `${opts.agentFirstName} here -- about your ${policyType} policy`,
      emailBody,
    );
    return ok ? { channel: 'email', chatId: existingChatId } : null;
  }

  return null;
}

/**
 * Try the primary channel for a stage; on failure, walk the fallback list.
 * Returns the first successful send or null if all fail.
 */
async function sendWithFallback(
  stage: TouchStage,
  avail: ChannelAvailability,
  opts: Parameters<typeof sendOnChannel>[1],
): Promise<SendResult | null> {
  const order = STAGE_FALLBACK_ORDER[stage];
  for (const ch of order) {
    if (!isChannelAvailable(ch, avail)) continue;
    const result = await sendOnChannel(ch, opts);
    if (result) return result;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Legacy migration: derive touchStage + nextTouchAt from old status fields
// ---------------------------------------------------------------------------

interface ResolvedStageInfo {
  touchStage: TouchStage;
  nextTouchAt: string | null;
}

function resolveTouchStage(alertData: FirebaseFirestore.DocumentData): ResolvedStageInfo | null {
  const explicit = alertData.touchStage as TouchStage | null | undefined;
  if (explicit) {
    return {
      touchStage: explicit,
      nextTouchAt: (alertData.nextTouchAt as string) || null,
    };
  }

  const status = alertData.status as string;
  const mapped = STATUS_TO_TOUCH_STAGE[status as keyof typeof STATUS_TO_TOUCH_STAGE];
  if (!mapped) return null;

  const lastDripAt = alertData.lastDripAt as string | null;
  const outreachSentAt = alertData.outreachSentAt as string | null;
  const baseTime = lastDripAt || outreachSentAt;
  const nextStage = NEXT_TOUCH_STAGE[mapped];

  let nextTouchAt: string | null = null;
  if (nextStage && baseTime) {
    nextTouchAt = new Date(
      new Date(baseTime).getTime() + TOUCH_STAGE_DELAY[nextStage],
    ).toISOString();
  }

  return { touchStage: mapped, nextTouchAt };
}

// ---------------------------------------------------------------------------
// Cron handler
// ---------------------------------------------------------------------------

/**
 * GET /api/cron/conservation-outreach
 *
 * Vercel Cron -- runs every 30 minutes.
 *
 * Staged outreach cadence:
 *   Stage 1 (initial):       Push (fallback: Text, Email)
 *   Stage 2 (24h no reply):  Text (fallback: Email, Push)
 *   Stage 3 (day 3):         Email (fallback: Push, Text)
 *   Stage 4 (day 7):         Push (fallback: Text) -- final
 *
 * Stops when the client replies or the alert is resolved.
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
    const nowIso = new Date().toISOString();
    let outreachFired = 0;
    let followUpsSent = 0;

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

      // ── A) Fire scheduled initial outreach past grace period ──────────
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
        const message = (alertData.initialMessage as string) || '';
        if (!message) continue;

        const avail = getChannelAvailability(clientData);
        const carrierName = (alertData.carrier as string) || '';
        const clientName = (alertData.clientName as string) || 'Client';
        const clientFirstName = clientName.split(' ')[0];

        const outreachCtx: ConservationOutreachContext = {
          clientFirstName,
          clientName,
          agentName,
          agentFirstName,
          policyType: (alertData.policyType as string) || null,
          policyAge: (alertData.policyAge as number) || null,
          reason: (alertData.reason as 'lapsed_payment' | 'cancellation' | 'other') || 'other',
          schedulingUrl,
          dripNumber: 0,
          premiumAmount: (alertData.premiumAmount as number) || null,
          availableChannels: (alertData.availableChannels as ConservationChannel[]) || [],
          carrier: carrierName || null,
          carrierServicePhone: getCarrierServicePhone(carrierName),
        };

        const sendOpts = {
          message,
          avail,
          agentName,
          agentFirstName,
          agentEmail,
          agentPhone,
          schedulingUrl,
          agentId: agentDoc.id,
          clientId,
          existingChatId: (alertData.chatId as string) || null,
          outreachCtx,
          alertData,
        };

        const result = await sendWithFallback('initial', avail, sendOpts);

        if (result) {
          const nextStage = NEXT_TOUCH_STAGE['initial']!;
          const nextTouchAt = new Date(now + TOUCH_STAGE_DELAY[nextStage]).toISOString();

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
              status: 'sent',
            });

          const conversationEntry = {
            role: 'agent-ai' as const,
            body: message,
            timestamp: nowIso,
            channels: [result.channel],
          };

          await alertDoc.ref.update({
            status: 'outreach_sent',
            touchStage: 'initial' as TouchStage,
            nextTouchAt,
            channelsUsed: [result.channel],
            outreachSentAt: nowIso,
            pushSentAt: result.channel === 'push' ? nowIso : null,
            smsSentAt: result.channel === 'sms' ? nowIso : null,
            lastDripAt: nowIso,
            chatId: result.chatId,
            conversation: FieldValue.arrayUnion(conversationEntry),
          });

          outreachFired++;
        }
      }

      // ── B) Follow-up stages for alerts that need the next touch ───────
      // Query all active (non-resolved) alerts that have a nextTouchAt in the past
      const activeStatuses = ['outreach_sent', 'drip_1', 'drip_2'];
      for (const statusVal of activeStatuses) {
        const snap = await alertsRef.where('status', '==', statusVal).get();

        for (const alertDoc of snap.docs) {
          const alertData = alertDoc.data();

          // Skip if client already replied
          if (alertData.lastClientReplyAt) continue;

          // Determine the current stage and when the next touch is due
          const stageInfo = resolveTouchStage(alertData);
          if (!stageInfo) continue;

          const nextStage = NEXT_TOUCH_STAGE[stageInfo.touchStage];
          if (!nextStage) continue;

          // Check timing: is the next touch due?
          let dueAt: number;
          if (stageInfo.nextTouchAt) {
            dueAt = new Date(stageInfo.nextTouchAt).getTime();
          } else {
            const baseTime = (alertData.lastDripAt as string) || (alertData.outreachSentAt as string);
            if (!baseTime) continue;
            dueAt = new Date(baseTime).getTime() + TOUCH_STAGE_DELAY[nextStage];
          }

          if (now < dueAt) continue;

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
          const avail = getChannelAvailability(clientData);
          const clientName = (alertData.clientName as string) || 'Client';
          const clientFirstName = clientName.split(' ')[0];
          const carrierName = (alertData.carrier as string) || '';
          const channels = (alertData.availableChannels as ConservationChannel[]) || [];

          const dripNumber = TOUCH_STAGE_DRIP_NUMBER[nextStage];
          const reason = (alertData.reason as 'lapsed_payment' | 'cancellation' | 'other') || 'other';

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
            carrierServicePhone: getCarrierServicePhone(carrierName),
          };

          let followUpMessage: string;
          try {
            followUpMessage = await generateOutreachMessage(outreachCtx);
          } catch (e) {
            console.error('Failed to generate follow-up message:', e);
            continue;
          }
          if (!followUpMessage) continue;

          const sendOpts = {
            message: followUpMessage,
            avail,
            agentName,
            agentFirstName,
            agentEmail,
            agentPhone,
            schedulingUrl,
            agentId: agentDoc.id,
            clientId,
            existingChatId: (alertData.chatId as string) || null,
            outreachCtx,
            alertData,
          };

          const sendResult = await sendWithFallback(nextStage, avail, sendOpts);
          if (!sendResult) continue;

          // Email complement on final stage (send in addition to primary channel)
          if (STAGE_COMPLEMENT_EMAIL[nextStage] && avail.clientEmail) {
            try {
              const emailBody = await generateConservationEmail({
                ...outreachCtx,
                agentEmail,
                agentPhone,
                coverageAmount: (alertData.coverageAmount as number) || null,
              });
              await sendConservationEmailMessage(
                avail.clientEmail,
                agentName,
                `${agentFirstName} here — about your ${(alertData.policyType as string) || 'insurance'} policy`,
                emailBody,
              );
            } catch (emailErr) {
              console.error('Conservation complement email failed:', emailErr);
            }
          }

          // Write notification record
          await db
            .collection('agents')
            .doc(agentDoc.id)
            .collection('clients')
            .doc(clientId)
            .collection('notifications')
            .add({
              type: 'conservation',
              title: `Message from ${agentName}`,
              body: followUpMessage,
              includeBookingLink: !!schedulingUrl,
              sentAt: FieldValue.serverTimestamp(),
              readAt: null,
              status: 'sent',
            });

          const conversationEntry = {
            role: 'agent-ai' as const,
            body: followUpMessage,
            timestamp: nowIso,
            channels: [sendResult.channel],
          };

          const existingDripMessages = (alertData.dripMessages as string[]) || [];
          const existingChannelsUsed = (alertData.channelsUsed as ConservationChannel[]) || [];
          const nextNextStage = NEXT_TOUCH_STAGE[nextStage];
          const nextNextTouchAt = nextNextStage
            ? new Date(now + TOUCH_STAGE_DELAY[nextNextStage]).toISOString()
            : null;

          const updateData: Record<string, unknown> = {
            status: TOUCH_STAGE_TO_STATUS[nextStage],
            touchStage: nextStage,
            nextTouchAt: nextNextTouchAt,
            channelsUsed: [...existingChannelsUsed, sendResult.channel],
            dripCount: (alertData.dripCount || 0) + 1,
            lastDripAt: nowIso,
            dripMessages: [...existingDripMessages, followUpMessage],
            conversation: FieldValue.arrayUnion(conversationEntry),
          };

          if (sendResult.chatId && !alertData.chatId) {
            updateData.chatId = sendResult.chatId;
          }

          await alertDoc.ref.update(updateData);
          followUpsSent++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      outreachFired,
      followUpsSent,
    });
  } catch (error) {
    console.error('Conservation outreach cron error:', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
