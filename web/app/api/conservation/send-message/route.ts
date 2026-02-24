import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { sendOrCreateChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/conservation/send-message
 *
 * Sends a manual text from the agent in a conservation conversation via Linq.
 * Disables AI auto-responses for this alert (agent is taking over).
 *
 * Body: { alertId: string, body: string }
 * Auth: Bearer <Firebase ID token>
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(token);
    const agentId = decodedToken.uid;

    const { alertId, body } = await req.json();

    if (!alertId || !body?.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields: alertId, body' },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();

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

    if (!clientId) {
      return NextResponse.json(
        { error: 'Alert is not matched to a client' },
        { status: 422 },
      );
    }

    const clientDoc = await db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .get();

    if (!clientDoc.exists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const clientData = clientDoc.data()!;
    const clientPhone = normalizePhone((clientData.phone as string) || '');

    if (!isValidE164(clientPhone)) {
      return NextResponse.json(
        { error: 'Client does not have a valid phone number' },
        { status: 422 },
      );
    }

    const existingChatId = (alertData.chatId as string) || null;

    const result = await sendOrCreateChat({
      to: clientPhone,
      chatId: existingChatId,
      text: body.trim(),
    });

    const message = {
      role: 'agent-manual' as const,
      body: body.trim(),
      timestamp: new Date().toISOString(),
      channels: ['sms' as const],
    };

    const update: Record<string, unknown> = {
      conversation: FieldValue.arrayUnion(message),
      aiEnabled: false,
    };

    if (!existingChatId) {
      update.chatId = result.chatId;
    }

    await alertRef.update(update);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending conservation manual message:', error);

    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 },
    );
  }
}
