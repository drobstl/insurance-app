import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../lib/firebase-admin';
import { createChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';

/**
 * POST /api/client/welcome-sms
 *
 * Sends a welcome text to a new client via Linq (iMessage with SMS/RCS fallback).
 *
 * Body: { clientPhone, message }
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
    await adminAuth.verifyIdToken(token);

    const { clientPhone, message } = await req.json();

    if (!clientPhone || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: clientPhone, message' },
        { status: 400 },
      );
    }

    const normalizedPhone = normalizePhone(clientPhone);
    if (!isValidE164(normalizedPhone)) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 422 },
      );
    }

    await createChat({ to: normalizedPhone, text: message });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending welcome SMS:', error);

    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to send welcome SMS' },
      { status: 500 },
    );
  }
}
