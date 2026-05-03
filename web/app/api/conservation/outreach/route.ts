import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { sendOrCreateChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { ensureAgentBookingSlug, buildBrandedBookingUrl } from '../../../../lib/booking-link';
import { enforceOutreachBookingCta } from '../../../../lib/conservation-ai';
import { ensureSmsFirstTouchConfirmation } from '../../../../lib/sms-first-touch';
import {
  type TouchStage,
  type ConservationChannel,
  NEXT_TOUCH_STAGE,
  TOUCH_STAGE_DELAY,
  STAGE_FALLBACK_ORDER,
} from '../../../../lib/conservation-types';

/**
 * POST /api/conservation/outreach
 *
 * Sends the initial outreach for a conservation alert using a single channel
 * (push-first with fallback). Called by the agent manually or by the cron.
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

    if (['outreach_sent', 'drip_1', 'drip_2', 'drip_3', 'saved', 'lost'].includes(status)) {
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

    // Lightweight send lock to reduce duplicate sends from manual+cron races.
    await alertRef.update({ initialSendLockAt: new Date().toISOString() });

    if (!message) {
      return NextResponse.json(
        { error: 'No outreach message generated for this alert.' },
        { status: 422 },
      );
    }

    const clientRef = db.collection('agents').doc(agentId).collection('clients').doc(clientId);
    const clientDoc = await clientRef.get();
    if (!clientDoc.exists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const clientData = clientDoc.data()!;
    const pushToken = clientData.pushToken as string | undefined;
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
    const messageWithBooking = enforceOutreachBookingCta({
      message,
      schedulingUrl,
      bookingUrl,
      dripNumber: 0,
    });

    const now = new Date();
    const nowIso = now.toISOString();

    // Walk the stage-1 fallback order: push -> sms -> email
    const fallbackOrder = STAGE_FALLBACK_ORDER['initial'];
    const avail: Record<ConservationChannel, boolean> = {
      push: !!pushToken,
      sms: isValidE164(normalizedPhone),
      email: !!(clientData.email as string),
    };

    let sentChannel: ConservationChannel | null = null;
    let chatId: string | null = (alertData.chatId as string) || null;
    let sentMessage = messageWithBooking;

    for (const ch of fallbackOrder) {
      if (!avail[ch]) continue;

      if (ch === 'push') {
        const pushData: Record<string, unknown> = {
          type: 'conservation',
          agentId,
          clientId,
        };
        if (schedulingUrl) {
          pushData.schedulingUrl = schedulingUrl;
          pushData.includeBookingLink = true;
        }

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
              body: messageWithBooking,
              sound: 'default',
              badge: 1,
              priority: 'high',
              data: pushData,
              ...(schedulingUrl ? { categoryId: 'BOOK_APPOINTMENT' } : {}),
            }),
          });
          const expoResult = await expoResponse.json();
          if (expoResult?.data?.status === 'ok') {
            sentChannel = 'push';
            break;
          }
          console.error('Expo push error for conservation outreach:', expoResult?.data?.message);
        } catch (pushError) {
          console.error('Failed to send conservation push:', pushError);
        }
      }

      if (ch === 'sms') {
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
          break;
        } catch (smsError) {
          console.error('Failed to send conservation SMS via Linq:', smsError);
        }
      }

      if (ch === 'email') {
        // Email fallback not implemented in manual outreach (would need Resend import)
        // For now, skip -- the cron handles email follow-ups
        continue;
      }
    }

    const nextStage = NEXT_TOUCH_STAGE['initial']!;
    const nextTouchAt = new Date(now.getTime() + TOUCH_STAGE_DELAY[nextStage]).toISOString();

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

    const alertUpdate: Record<string, unknown> = {
      status: 'outreach_sent',
      touchStage: 'initial' as TouchStage,
      nextTouchAt,
      channelsUsed: sentChannel ? [sentChannel] : [],
      outreachSentAt: nowIso,
      pushSentAt: sentChannel === 'push' ? nowIso : null,
      smsSentAt: sentChannel === 'sms' ? nowIso : null,
      lastDripAt: nowIso,
      chatId,
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
