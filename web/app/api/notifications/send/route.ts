import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  getPushPermissionStatus,
  readValidPushToken,
  sendExpoPush,
} from '../../../../lib/push-permission-lifecycle';

/**
 * POST /api/notifications/send
 *
 * Sends a push notification to a specific client via the Expo Push API
 * and stores a notification record in Firestore for history / mobile display.
 *
 * Body: {
 *   clientId, title?, body, includeBookingLink?,
 *   type?  — 'message' (default) | 'holiday' | 'birthday'
 *   holiday? — required when type is 'holiday': 'christmas' | 'newyear' | 'valentines' | 'july4th' | 'thanksgiving'
 * }
 * Auth: Bearer <Firebase ID token> — the agent must own the client.
 */

const VALID_TYPES = ['message', 'holiday', 'birthday', 'anniversary'] as const;
const VALID_HOLIDAYS = ['christmas', 'newyear', 'valentines', 'july4th', 'thanksgiving'] as const;

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
    const {
      clientId,
      title,
      body: messageBody,
      includeBookingLink,
      type: rawType,
      holiday: rawHoliday,
    } = await req.json();

    if (!clientId || !messageBody) {
      return NextResponse.json(
        { error: 'Missing required fields: clientId, body' },
        { status: 400 }
      );
    }

    const notifType = (VALID_TYPES as readonly string[]).includes(rawType) ? rawType : 'message';
    const holiday = notifType === 'holiday' && (VALID_HOLIDAYS as readonly string[]).includes(rawHoliday)
      ? rawHoliday
      : undefined;

    if (notifType === 'holiday' && !holiday) {
      return NextResponse.json(
        { error: 'Missing or invalid holiday field. Must be one of: christmas, newyear, valentines, july4th, thanksgiving' },
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
    // Push permission lifecycle (strategy decisions §4): only treat the token
    // as usable when present AND not revoked. Distinguish "never opted in"
    // from "opted in then revoked" so the dashboard can show the right copy.
    const pushToken = readValidPushToken(clientData);
    if (!pushToken) {
      const status = getPushPermissionStatus(clientData);
      return NextResponse.json(
        {
          error: status === 'revoked'
            ? 'Client previously enabled push but has since revoked notification permission.'
            : 'Client has not enabled push notifications',
          pushPermissionStatus: status,
        },
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
      type: notifType,
      agentId,
      clientId,
    };

    if (holiday) {
      pushData.holiday = holiday;
    }

    // Only include booking link for rewrite/conservation-style flows, never for holiday cards
    const shouldIncludeBooking = includeBookingLink && notifType !== 'holiday';
    if (shouldIncludeBooking) {
      const schedulingUrl = agentData?.schedulingUrl as string | undefined;
      if (schedulingUrl) {
        pushData.schedulingUrl = schedulingUrl;
        pushData.includeBookingLink = true;
      }
    }

    // ── Send via push permission lifecycle helper ────────────────────
    const outcome = await sendExpoPush(
      {
        to: pushToken,
        title: notificationTitle,
        body: messageBody,
        sound: 'default',
        badge: 1,
        priority: 'high',
        data: pushData,
        ...(shouldIncludeBooking ? { categoryId: 'BOOK_APPOINTMENT' } : {}),
      },
      {
        ref: clientRef,
        agentId,
        clientId,
      },
    );

    const pushStatus = outcome.status === 'ok' ? 'sent' : 'failed';
    const tokenInvalidated = outcome.status === 'token_invalidated';

    // ── Store notification record in Firestore ───────────────────────
    const notificationsRef = clientRef.collection('notifications');
    const notificationRecord: Record<string, unknown> = {
      type: notifType,
      title: notificationTitle,
      body: messageBody,
      includeBookingLink: notifType === 'holiday' ? false : (includeBookingLink || false),
      sentAt: FieldValue.serverTimestamp(),
      readAt: null,
      status: pushStatus,
    };

    if (holiday) {
      notificationRecord.holiday = holiday;
    }

    const docRef = await notificationsRef.add(notificationRecord);

    return NextResponse.json({
      success: true,
      notificationId: docRef.id,
      pushStatus,
      tokenInvalidated,
    });
  } catch (error) {
    console.error('Error sending notification:', error);

    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}
