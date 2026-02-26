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
      console.error('[welcome-sms] No auth header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    await adminAuth.verifyIdToken(token);

    const { clientPhone, message } = await req.json();

    console.log('[welcome-sms] Received request:', { clientPhone, messageLength: message?.length });

    if (!clientPhone || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: clientPhone, message' },
        { status: 400 },
      );
    }

    const normalizedPhone = normalizePhone(clientPhone);
    const isValid = isValidE164(normalizedPhone);

    console.log('[welcome-sms] Phone normalization:', { clientPhone, normalizedPhone, isValid });

    if (!isValid) {
      return NextResponse.json(
        { error: `Invalid phone number: ${clientPhone} → ${normalizedPhone}` },
        { status: 422 },
      );
    }

    const result = await createChat({ to: normalizedPhone, text: message });

    console.log('[welcome-sms] Linq createChat success:', { chatId: result.chatId, service: result.service });

    return NextResponse.json({ success: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[welcome-sms] Error:', errMsg);

    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: errMsg },
      { status: 500 },
    );
  }
}
