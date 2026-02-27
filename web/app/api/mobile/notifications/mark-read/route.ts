import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../../lib/firebase-admin';
import { checkRateLimit, getClientIp } from '../../../../../lib/rate-limit';

/**
 * POST /api/mobile/notifications/mark-read
 *
 * Marks a notification as read. Authenticates via clientCode.
 * Rate-limited to 30 requests/minute per IP.
 *
 * Body: { agentId, clientId, clientCode, notificationId }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`mark-read:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }
    const { agentId, clientId, clientCode, notificationId } = await req.json();

    if (!agentId || !clientId || !clientCode || !notificationId) {
      return NextResponse.json(
        { error: 'agentId, clientId, clientCode, and notificationId are required' },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();

    const clientDoc = await db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .get();

    if (!clientDoc.exists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const storedCode = clientDoc.data()?.clientCode;
    if (!storedCode || storedCode !== clientCode.trim().toUpperCase()) {
      return NextResponse.json({ error: 'Invalid client code' }, { status: 403 });
    }

    const notifRef = db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .collection('notifications')
      .doc(notificationId);

    await notifRef.update({ readAt: FieldValue.serverTimestamp() });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('mark-read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
