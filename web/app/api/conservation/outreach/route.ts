import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { sendOrCreateChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { ensureAgentBookingSlug, buildBrandedBookingUrl } from '../../../../lib/booking-link';
import { enforceOutreachBookingCta } from '../../../../lib/conservation-ai';
import { resolveClientLanguage } from '../../../../lib/client-language';
import { ensureSmsFirstTouchConfirmation } from '../../../../lib/sms-first-touch';
import {
  type TouchStage,
  type ConservationChannel,
  type ConservationStatus,
  RETENTION_STAGE_INTERVAL_MS,
  pickInitialRetentionStage,
} from '../../../../lib/conservation-types';
import {
  isPushEligible,
  readValidPushToken,
  sendExpoPush,
} from '../../../../lib/push-permission-lifecycle';

/**
 * POST /api/conservation/outreach
 *
 * Manual / cron-fallback Stage 1 trigger. May 9, 2026 retention
 * rewrite: a single channel is chosen at send time based on push
 * eligibility (push if eligible, else SMS via Linq). NO fallback —
 * if push send fails, the campaign still advances onto the
 * 5-stage push-eligible track and the next-stage cron tick handles
 * stage_sms 48h later.
 *
 * Body: { alertId: string }
 * Auth: Bearer <Firebase ID token> OR cron secret
 */
export async function POST(req: NextRequest) {
  try {
    const db = getAdminFirestore();
    let agentId: string;

    const authHeader = req.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;
    const body = await req.json();

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];

      if (cronSecret && token === cronSecret) {
        agentId = body.agentId;
        if (!agentId) {
          return NextResponse.json({ error: 'Missing agentId for cron call' }, { status: 400 });
        }
      } else {
        const adminAuth = getAdminAuth();
        const decodedToken = await adminAuth.verifyIdToken(token);
        agentId = decodedToken.uid;
      }
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { alertId } = body;
    if (!alertId) {
      return NextResponse.json({ error: 'Missing required field: alertId' }, { status: 400 });
    }

    const alertRef = db
      .collection('agents')
      .doc(agentId)
      .collection('conservationAlerts')
      .doc(alertId);

    const alertSnap = await alertRef.get();
    if (!alertSnap.exists) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    const alertData = alertSnap.data()!;
    const clientId = alertData.clientId as string | null;
    const message = (alertData.initialMessage as string) || '';
    const status = (alertData.status as string) || 'new';
    const lockAt = (alertData.initialSendLockAt as string | null) || null;
    const lockFresh = lockAt && Date.now() - new Date(lockAt).getTime() < 5 * 60 * 1000;

    // Already past Stage 1 — caller is no-op'd.
    const postStage1Statuses: ConservationStatus[] = [
      'outreach_sent',
      'drip_1',
      'drip_2',
      'drip_3',
      'drip_complete',
      'saved',
      'lost',
    ];
    if (postStage1Statuses.includes(status as ConservationStatus)) {
      return NextResponse.json({ success: true, alreadySent: true, sentChannel: null });
    }

    if (!['new', 'outreach_scheduled'].includes(status)) {
      return NextResponse.json(
        { error: `Alert is not in a sendable state (${status}).` },
        { status: 409 },
      );
    }

    if (lockFresh) {
      return NextResponse.json({ success: true, alreadySending: true, sentChannel: null });
    }

    if (!clientId) {
      return NextResponse.json(
        { error: 'Alert is not matched to a client. Match a client first.' },
        { status: 422 },
      );
    }

    if (!message) {
      return NextResponse.json(
        { error: 'No outreach message generated for this alert.' },
        { status: 422 },
      );
    }

    await alertRef.update({ initialSendLockAt: new Date().toISOString() });

    const clientRef = db.collection('agents').doc(agentId).collection('clients').doc(clientId);
    const clientDoc = await clientRef.get();
    if (!clientDoc.exists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const clientData = clientDoc.data()!;
    const pushToken = readValidPushToken(clientData) ?? undefined;
    const clientPhone = (clientData.phone as string) || '';
    const normalizedPhone = normalizePhone(clientPhone);

    const agentDoc = await db.collection('agents').doc(agentId).get();
    const agentData = agentDoc.data() || {};
    const agentName = (agentData.name as string) || 'Your Agent';
    const schedulingUrl = (agentData.schedulingUrl as string) || null;
    let bookingUrl: string | null = null;
    if (schedulingUrl) {
      const bookingSlug = await ensureAgentBookingSlug({
        agentId,
        agentName,
        agencyName: (agentData.agencyName as string) || null,
        existingSlug: (agentData.bookingSlug as string) || null,
      });
      bookingUrl = buildBrandedBookingUrl({
        bookingSlug,
        source: 'conservation',
        stage: 'initial',
      });
    }
    const now = new Date();
    const nowIso = now.toISOString();

    const pushEligible = isPushEligible(clientData);
    const stage1: TouchStage = pickInitialRetentionStage(pushEligible);

    // Linq line-health gate: SMS first contact = no URL injection
    // (Linq deliverability rule). Push has no such constraint.
    const messageWithBooking = enforceOutreachBookingCta({
      message,
      schedulingUrl,
      bookingUrl,
      dripNumber: 0,
      channel: stage1 === 'stage_push' ? 'push' : 'sms',
      clientHasReplied: false,
    });

    let sentChannel: ConservationChannel | null = null;
    let chatId: string | null = (alertData.chatId as string) || null;
    let sentMessage = messageWithBooking;

    if (stage1 === 'stage_push') {
      if (pushToken) {
        const pushData: Record<string, unknown> = {
          type: 'conservation',
          agentId,
          clientId,
        };
        if (schedulingUrl) {
          pushData.schedulingUrl = schedulingUrl;
          pushData.includeBookingLink = true;
        }
        const outcome = await sendExpoPush(
          {
            to: pushToken,
            title: `Message from ${agentName}`,
            body: messageWithBooking,
            sound: 'default',
            badge: 1,
            priority: 'high',
            data: pushData,
            ...(schedulingUrl ? { categoryId: 'BOOK_APPOINTMENT' } : {}),
          },
          {
            ref: clientRef,
            agentId,
            clientId,
          },
        );
        if (outcome.status === 'ok') {
          sentChannel = 'push';
        }
        // No fallback to SMS — see file header comment.
      }
    } else if (stage1 === 'stage_sms' && isValidE164(normalizedPhone)) {
      try {
        const smsMessageWithConfirmation = ensureSmsFirstTouchConfirmation(
          messageWithBooking,
          resolveClientLanguage(alertData.preferredLanguage ?? clientData.preferredLanguage),
        );
        const result = await sendOrCreateChat({
          to: normalizedPhone,
          chatId,
          text: smsMessageWithConfirmation,
        });
        chatId = result.chatId;
        sentChannel = 'sms';
        sentMessage = smsMessageWithConfirmation;
      } catch (smsError) {
        console.error('[conservation-outreach] linq sms failed', smsError);
      }
    }

    await clientRef.collection('notifications').add({
      type: 'conservation',
      title: `Message from ${agentName}`,
      body: sentMessage,
      includeBookingLink: !!schedulingUrl,
      schedulingUrl: schedulingUrl || null,
      sentAt: FieldValue.serverTimestamp(),
      readAt: null,
      status: sentChannel ? 'sent' : 'failed',
    });

    const usedChannel: ConservationChannel = sentChannel
      ?? (stage1 === 'stage_push' ? 'push' : 'sms');

    const alertUpdate: Record<string, unknown> = {
      status: 'outreach_sent' satisfies ConservationStatus,
      touchStage: stage1,
      dripCount: 1,
      nextTouchAt: new Date(now.getTime() + RETENTION_STAGE_INTERVAL_MS).toISOString(),
      channelsUsed: [usedChannel],
      outreachSentAt: nowIso,
      pushSentAt: stage1 === 'stage_push' ? nowIso : null,
      smsSentAt: stage1 === 'stage_sms' ? nowIso : null,
      lastDripAt: nowIso,
      chatId,
      campaignStartPushEligible: pushEligible,
      initialSendLockAt: FieldValue.delete(),
    };
    if (sentChannel) {
      alertUpdate.conversation = FieldValue.arrayUnion({
        role: 'agent-ai' as const,
        body: sentMessage,
        timestamp: nowIso,
        channels: [sentChannel],
      });
    }
    await alertRef.update(alertUpdate);

    return NextResponse.json({
      success: true,
      sentChannel,
      stage: stage1,
    });
  } catch (error) {
    console.error('Error sending conservation outreach:', error);

    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to send conservation outreach' },
      { status: 500 },
    );
  }
}
