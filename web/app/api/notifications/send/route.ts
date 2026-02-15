import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/notifications/send
 *
 * Sends a push notification to a specific client via the Expo Push API
 * and stores a notification record in Firestore for history / mobile display.
 *
 * Body: { clientId, title?, body, includeBookingLink? }
 * Auth: Bearer <Firebase ID token> — the agent must own the client.
 */

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default' | null;
  data?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(token);
    const agentId = decodedToken.uid;

    // ── Parse body ───────────────────────────────────────────────────
    const { clientId, title, body: messageBody, includeBookingLink } = await req.json();

    if (!clientId || !messageBody) {
      return NextResponse.json(
        { error: 'Missing required fields: clientId, body' },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();

    // ── Verify ownership & get client data ───────────────────────────
    const clientRef = db.doc(`agents/${agentId}/clients/${clientId}`);
    const clientDoc = await clientRef.get();

    if (!clientDoc.exists) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    const clientData = clientDoc.data();
    const pushToken = clientData?.pushToken as string | undefined;

    if (!pushToken) {
      return NextResponse.json(
        { error: 'Client has not enabled push notifications' },
        { status: 422 }
      );
    }

    // ── Get agent info for notification metadata ─────────────────────
    const agentDoc = await db.doc(`agents/${agentId}`).get();
    const agentData = agentDoc.data();
    const agentName = (agentData?.name as string) || 'Your Agent';
    const notificationTitle = title || `Message from ${agentName}`;

    // ── Build the push notification payload ──────────────────────────
    const pushData: Record<string, unknown> = {
      type: 'message',
      agentId,
      clientId,
    };

    // If the agent wants to include a booking link, fetch their scheduling URL
    if (includeBookingLink) {
      const schedulingUrl = agentData?.schedulingUrl as string | undefined;
      if (schedulingUrl) {
        pushData.schedulingUrl = schedulingUrl;
        pushData.includeBookingLink = true;
      }
    }

    const pushMessage: ExpoPushMessage = {
      to: pushToken,
      title: notificationTitle,
      body: messageBody,
      sound: 'default',
      data: pushData,
    };

    // ── Send via Expo Push API ───────────────────────────────────────
    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(pushMessage),
    });

    const expoResult = await expoResponse.json();

    // Check for Expo-level errors
    const pushStatus = expoResult?.data?.status === 'ok' ? 'sent' : 'failed';
    if (pushStatus === 'failed') {
      console.error('Expo push error:', expoResult?.data?.message || expoResult);
    }

    // ── Store notification record in Firestore ───────────────────────
    const notificationsRef = clientRef.collection('notifications');
    const notificationRecord = {
      type: 'message' as const,
      title: notificationTitle,
      body: messageBody,
      includeBookingLink: includeBookingLink || false,
      sentAt: FieldValue.serverTimestamp(),
      readAt: null,
      status: pushStatus,
    };

    const docRef = await notificationsRef.add(notificationRecord);

    return NextResponse.json({
      success: true,
      notificationId: docRef.id,
      pushStatus,
    });
  } catch (error) {
    console.error('Error sending notification:', error);

    // Handle auth errors specifically
    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}
