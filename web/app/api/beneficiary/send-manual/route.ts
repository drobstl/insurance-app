import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { createChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { resolveClientLanguage } from '../../../../lib/client-language';
import { upsertThreadFromOutbound } from '../../../../lib/conversation-thread-registry';

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
}): Promise<{ channel: 'sms' | 'email' | 'email_fallback'; chatId: string | null; normalizedPhone: string | null }> {
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
      const result = await createChat({ to: normalizedPhone, text: params.message });
      return { channel: 'sms', chatId: result.chatId, normalizedPhone };
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
  return { channel: validPhone ? 'email_fallback' : 'email', chatId: null, normalizedPhone: validPhone ? normalizedPhone : null };
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
    const delivery = await sendWithFallback({
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
        channel: delivery.channel,
        status: 'sent',
        messagePreview: body.slice(0, 180),
        beneficiaryName: typeof beneficiaryName === 'string' ? beneficiaryName : '',
        sentAt: new Date().toISOString(),
      });

    if (delivery.chatId && delivery.normalizedPhone) {
      await upsertThreadFromOutbound({
        db,
        agentId: uid,
        providerThreadId: delivery.chatId,
        providerType: 'sms_direct',
        lane: 'beneficiary',
        purpose: 'beneficiary_manual',
        linkedEntityType: 'beneficiary',
        linkedEntityId: code,
        participantPhonesE164: [delivery.normalizedPhone],
        allowAutoReply: false,
        allowedResponder: 'none',
      });
    }

    return NextResponse.json({ success: true, channel: delivery.channel });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to send beneficiary message.';
    if (msg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
