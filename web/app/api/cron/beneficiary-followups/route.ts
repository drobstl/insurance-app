import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { createChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

async function sendWithFallback(params: {
  message: string;
  phone?: string;
  email?: string;
  language?: string;
}): Promise<'sms' | 'email' | 'email_fallback'> {
  const rawPhone = (params.phone || '').trim();
  const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : '';
  const validPhone = normalizedPhone && isValidE164(normalizedPhone);
  const email = (params.email || '').trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!validPhone && !validEmail) {
    throw new Error('No valid phone or email available.');
  }

  if (validPhone) {
    try {
      await createChat({ to: normalizedPhone, text: params.message });
      return 'sms';
    } catch (err) {
      if (!validEmail) throw err;
    }
  }

  const resend = getResend();
  await resend.emails.send({
    from: 'AgentForLife™ <support@agentforlife.app>',
    to: [email],
    subject:
      params.language === 'es'
        ? 'Seguimiento de tu acceso de beneficiario'
        : 'Follow-up on your beneficiary access',
    text: params.message,
  });
  return validPhone ? 'email_fallback' : 'email';
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    const nowIso = new Date().toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    const agentsSnap = await db.collection('agents').get();
    for (const agentDoc of agentsSnap.docs) {
      const agentData = agentDoc.data();
      if (agentData.beneficiaryAIFollowupsEnabled !== true) continue;
      const maxTouches = Math.min(10, Math.max(1, Number(agentData.beneficiaryMaxTouchesPer30Days || 3)));

      const queuedSnap = await db
        .collection('agents')
        .doc(agentDoc.id)
        .collection('beneficiaryFollowups')
        .where('status', '==', 'queued')
        .get();

      for (const followupDoc of queuedSnap.docs) {
        const data = followupDoc.data() as Record<string, unknown>;
        const sendAt = typeof data.sendAt === 'string' ? data.sendAt : '';
        if (!sendAt || sendAt > nowIso) continue;

        const beneficiaryCode = typeof data.beneficiaryCode === 'string' ? data.beneficiaryCode : '';
        const campaignType = typeof data.campaignType === 'string' ? data.campaignType : 'beneficiary_followup';
        if (!beneficiaryCode) {
          await followupDoc.ref.set({
            status: 'failed',
            error: 'missing_beneficiary_code',
            campaignType,
            processedAt: nowIso,
          }, { merge: true });
          failed += 1;
          continue;
        }

        const eventsSnap = await db
          .collection('agents')
          .doc(agentDoc.id)
          .collection('beneficiaryOutreachByCode')
          .doc(beneficiaryCode)
          .collection('events')
          .where('status', '==', 'sent')
          .where('sentAt', '>=', thirtyDaysAgo)
          .get();

        if (eventsSnap.size >= maxTouches) {
          await followupDoc.ref.set({
            status: 'skipped',
            reason: 'touch_cap_reached',
            campaignType,
            processedAt: nowIso,
          }, { merge: true });
          skipped += 1;
          continue;
        }

        const message = typeof data.message === 'string' ? data.message.trim() : '';
        if (!message) {
          await followupDoc.ref.set({
            status: 'failed',
            error: 'missing_message',
            campaignType,
            processedAt: nowIso,
          }, { merge: true });
          failed += 1;
          continue;
        }

        try {
          const channel = await sendWithFallback({
            message,
            phone: typeof data.beneficiaryPhone === 'string' ? data.beneficiaryPhone : '',
            email: typeof data.beneficiaryEmail === 'string' ? data.beneficiaryEmail : '',
            language: typeof data.preferredLanguage === 'string' ? data.preferredLanguage : 'en',
          });
          await followupDoc.ref.set({
            status: 'sent',
            campaignType,
            channel,
            processedAt: nowIso,
          }, { merge: true });
          await db
            .collection('agents')
            .doc(agentDoc.id)
            .collection('beneficiaryOutreachByCode')
            .doc(beneficiaryCode)
            .collection('events')
            .add({
              category: 'followup',
              campaignType,
              channel,
              status: 'sent',
              sentAt: nowIso,
            });
          sent += 1;
        } catch (error) {
          await followupDoc.ref.set(
            {
              status: 'failed',
              campaignType,
              error: error instanceof Error ? error.message : 'send_failed',
              processedAt: nowIso,
            },
            { merge: true },
          );
          failed += 1;
        }
      }
    }

    console.log('[beneficiary-followups] complete', { sent, skipped, failed });
    return NextResponse.json({ success: true, sent, skipped, failed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
