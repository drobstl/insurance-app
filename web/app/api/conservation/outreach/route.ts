import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { sendOrCreateChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';

/**
 * POST /api/conservation/outreach
 *
 * Sends push notification + iMessage to the client for a conservation alert.
 * Called manually by the agent, or by the cron job after the grace period.
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

    const clientRef = db.collection('agents').doc(agentId).collection('clients').doc(clientId);
    const clientDoc = await clientRef.get();
    if (!clientDoc.exists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const clientData = clientDoc.data()!;
    const pushToken = clientData.pushToken as string | undefined;
    const clientPhone = (clientData.phone as string) || '';

    const agentDoc = await db.collection('agents').doc(agentId).get();
    const agentData = agentDoc.data() || {};
    const agentName = (agentData.name as string) || 'Your Agent';
    const schedulingUrl = (agentData.schedulingUrl as string) || null;

    const now = new Date().toISOString();
    let pushSent = false;
    let smsSent = false;

    if (pushToken) {
      try {
        const pushData: Record<string, unknown> = {
          type: 'conservation',
          agentId,
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
            badge: 1,
            priority: 'high',
            data: pushData,
            ...(schedulingUrl && { categoryId: 'BOOK_APPOINTMENT' }),
          }),
        });

        const expoResult = await expoResponse.json();
        pushSent = expoResult?.data?.status === 'ok';

        if (!pushSent) {
          console.error('Expo push error for conservation outreach:', expoResult?.data?.message);
        }
      } catch (pushError) {
        console.error('Failed to send conservation push:', pushError);
      }
    }

    const normalizedPhone = normalizePhone(clientPhone);
    if (isValidE164(normalizedPhone)) {
      try {
        await sendOrCreateChat({
          to: normalizedPhone,
          text: message,
        });
        smsSent = true;
      } catch (smsError) {
        console.error('Failed to send conservation message via Linq:', smsError);
      }
    }

    await clientRef.collection('notifications').add({
      type: 'conservation',
      title: `Message from ${agentName}`,
      body: message,
      includeBookingLink: !!schedulingUrl,
      schedulingUrl: schedulingUrl || null,
      sentAt: FieldValue.serverTimestamp(),
      readAt: null,
      status: pushSent ? 'sent' : smsSent ? 'sent' : 'failed',
    });

    await alertRef.update({
      status: 'outreach_sent',
      outreachSentAt: now,
      pushSentAt: pushSent ? now : null,
      smsSentAt: smsSent ? now : null,
      lastDripAt: now,
    });

    return NextResponse.json({
      success: true,
      pushSent,
      smsSent,
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
