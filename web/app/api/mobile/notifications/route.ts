import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';

/**
 * GET /api/mobile/notifications?agentId=...&clientId=...&clientCode=...
 *
 * Returns recent unread notifications for a client. Authenticates via clientCode.
 * Rate-limited to 30 requests/minute per IP (polled every 30s).
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    const rl = checkRateLimit(`notif:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }
    const { searchParams } = request.nextUrl;
    const agentId = searchParams.get('agentId');
    const clientId = searchParams.get('clientId');
    const clientCode = searchParams.get('clientCode');

    if (!agentId || !clientId || !clientCode) {
      return NextResponse.json(
        { error: 'agentId, clientId, and clientCode are required' },
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

    const snap = await db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .collection('notifications')
      .orderBy('sentAt', 'desc')
      .limit(20)
      .get();

    const notifications = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type ?? 'message',
          title: data.title ?? '',
          body: data.body ?? '',
          holiday: data.holiday ?? undefined,
          includeBookingLink: data.includeBookingLink ?? false,
          sentAt: data.sentAt?.toDate?.()?.toISOString() ?? null,
          readAt: data.readAt?.toDate?.()?.toISOString() ?? null,
          status: data.status ?? 'sent',
        };
      })
      .filter((n) => !n.readAt)
      .slice(0, 10);

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error('mobile notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
