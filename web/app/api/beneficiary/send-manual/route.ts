import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { createChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { resolveClientLanguage } from '../../../../lib/client-language';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

async function sendWithFallback(params: {
  message: string;
  phone?: string;
  email?: string;
  language: 'en' | 'es';
}): Promise<'sms' | 'email' | 'email_fallback'> {
  const rawPhone = (params.phone || '').trim();
  const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : '';
  const validPhone = normalizedPhone && isValidE164(normalizedPhone);
  const email = (params.email || '').trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!validPhone && !validEmail) {
    throw new Error('Beneficiary needs a valid phone or email before sending.');
  }

  if (validPhone) {
    try {
      await createChat({ to: normalizedPhone, text: params.message });
      return 'sms';
    } catch (error) {
      if (!validEmail) throw error;
    }
  }

  const resend = getResend();
  await resend.emails.send({
    from: 'AgentForLife™ <support@agentforlife.app>',
    to: [email],
    subject: params.language === 'es' ? 'Mensaje de tu agente' : 'A message from your agent',
    text: params.message,
  });
  return validPhone ? 'email_fallback' : 'email';
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const {
      beneficiaryCode,
      beneficiaryName,
      beneficiaryPhone,
      beneficiaryEmail,
      preferredLanguage,
      message,
    } = await req.json();

    const code = typeof beneficiaryCode === 'string' ? beneficiaryCode.trim().toUpperCase() : '';
    const body = typeof message === 'string' ? message.trim() : '';
    if (!code) {
      return NextResponse.json({ error: 'Beneficiary code is required.' }, { status: 400 });
    }
    if (!body) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    }

    const language = resolveClientLanguage(preferredLanguage);
    const channel = await sendWithFallback({
      message: body,
      phone: typeof beneficiaryPhone === 'string' ? beneficiaryPhone : '',
      email: typeof beneficiaryEmail === 'string' ? beneficiaryEmail : '',
      language,
    });

    const db = getAdminFirestore();
    await db
      .collection('agents')
      .doc(uid)
      .collection('beneficiaryOutreachByCode')
      .doc(code)
      .collection('events')
      .add({
        category: 'manual',
        campaignType: 'beneficiary_manual',
        channel,
        status: 'sent',
        messagePreview: body.slice(0, 180),
        beneficiaryName: typeof beneficiaryName === 'string' ? beneficiaryName : '',
        sentAt: new Date().toISOString(),
      });

    return NextResponse.json({ success: true, channel });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to send beneficiary message.';
    if (msg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
