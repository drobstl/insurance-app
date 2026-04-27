import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { createChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import {
  buildBeneficiaryFollowupMessage,
  type BeneficiaryRole,
  buildBeneficiaryWelcomeMessage,
  resolveClientLanguage,
  DEFAULT_BENEFICIARY_WELCOME_TEMPLATE_EN,
  DEFAULT_BENEFICIARY_WELCOME_TEMPLATE_ES,
} from '../../../../lib/client-language';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
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
      beneficiaryName,
      beneficiaryPhone,
      beneficiaryEmail,
      beneficiaryCode,
      insuredName,
      preferredLanguage,
      messageTemplate,
      beneficiaryRole,
    } = await req.json();

    const code = typeof beneficiaryCode === 'string' ? beneficiaryCode.trim().toUpperCase() : '';
    if (!code) {
      return NextResponse.json({ error: 'Beneficiary code is required.' }, { status: 400 });
    }

    const language = resolveClientLanguage(preferredLanguage);
    const role: BeneficiaryRole = beneficiaryRole === 'contingent' ? 'contingent' : 'primary';
    const db = getAdminFirestore();
    const agentDoc = await db.collection('agents').doc(uid).get();
    const agentData = agentDoc.data() || {};
    const agentName = (agentData.name as string) || 'your AFL agent';
    const templateFromSettings =
      language === 'es'
        ? (agentData.beneficiaryWelcomeTemplateEs as string | undefined)
        : (agentData.beneficiaryWelcomeTemplateEn as string | undefined);
    const resolvedTemplate =
      (typeof messageTemplate === 'string' && messageTemplate.trim())
      || (templateFromSettings || '').trim()
      || (language === 'es'
        ? DEFAULT_BENEFICIARY_WELCOME_TEMPLATE_ES
        : DEFAULT_BENEFICIARY_WELCOME_TEMPLATE_EN);

    const finalMessage = buildBeneficiaryWelcomeMessage({
      beneficiaryFirstName: (beneficiaryName || 'there').split(' ')[0],
      insuredFirstName: (insuredName || 'your loved one').split(' ')[0],
      agentName,
      beneficiaryCode: code,
      appUrl: 'https://agentforlife.app/app',
      language,
      template: resolvedTemplate,
    });

    const rawPhone = typeof beneficiaryPhone === 'string' ? beneficiaryPhone.trim() : '';
    const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : '';
    const validPhone = normalizedPhone && isValidE164(normalizedPhone);
    const email = typeof beneficiaryEmail === 'string' ? beneficiaryEmail.trim() : '';
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!validPhone && !validEmail) {
      return NextResponse.json(
        { error: 'Beneficiary must have a valid phone or email to send intro.' },
        { status: 422 },
      );
    }

    if (validPhone) {
      try {
        await createChat({ to: normalizedPhone, text: finalMessage });
        await db.collection('agents').doc(uid).collection('beneficiaryOutreachByCode').doc(code).collection('events').add({
          category: 'intro',
          channel: 'sms',
          status: 'sent',
          sentAt: new Date().toISOString(),
        });
        if (agentData.beneficiaryAIFollowupsEnabled === true) {
          const baseRef = db.collection('agents').doc(uid).collection('beneficiaryFollowups');
          const base = {
            beneficiaryCode: code,
            beneficiaryName: beneficiaryName || '',
            beneficiaryRole: role,
            insuredName: insuredName || '',
            beneficiaryPhone: validPhone ? normalizedPhone : '',
            beneficiaryEmail: validEmail ? email : '',
            preferredLanguage: language,
            status: 'queued',
            createdAt: new Date().toISOString(),
          };
          const offsets = [2, 5, 10] as const;
          for (const [idx, dayOffset] of offsets.entries()) {
            const sendAt = new Date();
            sendAt.setUTCDate(sendAt.getUTCDate() + dayOffset);
            await baseRef.doc(`${code}_${idx + 1}`).set({
              ...base,
              step: (idx + 1) as 1 | 2 | 3,
              sendAt: sendAt.toISOString(),
              message: buildBeneficiaryFollowupMessage({
                step: (idx + 1) as 1 | 2 | 3,
                beneficiaryFirstName: (beneficiaryName || 'there').split(' ')[0],
                insuredFirstName: (insuredName || 'your loved one').split(' ')[0],
                agentName,
                beneficiaryCode: code,
                appUrl: 'https://agentforlife.app/app',
                role,
                language,
              }),
            }, { merge: true });
          }
        }
        return NextResponse.json({ success: true, channel: 'sms' });
      } catch (smsError) {
        if (!validEmail) {
          const msg = smsError instanceof Error ? smsError.message : 'Failed to send SMS.';
          return NextResponse.json({ error: msg }, { status: 500 });
        }
        // fallback to email below
      }
    }

    const resend = getResend();
    await resend.emails.send({
      from: 'AgentForLife™ <support@agentforlife.app>',
      to: [email],
      subject:
        language === 'es'
          ? 'Detalles de tu acceso como beneficiario'
          : 'Your Beneficiary Access Details',
      text: finalMessage,
    });
    await db.collection('agents').doc(uid).collection('beneficiaryOutreachByCode').doc(code).collection('events').add({
      category: 'intro',
      channel: validPhone ? 'email_fallback' : 'email',
      status: 'sent',
      sentAt: new Date().toISOString(),
    });
    if (agentData.beneficiaryAIFollowupsEnabled === true) {
      const baseRef = db.collection('agents').doc(uid).collection('beneficiaryFollowups');
      const base = {
        beneficiaryCode: code,
        beneficiaryName: beneficiaryName || '',
        beneficiaryRole: role,
        insuredName: insuredName || '',
        beneficiaryPhone: validPhone ? normalizedPhone : '',
        beneficiaryEmail: validEmail ? email : '',
        preferredLanguage: language,
        status: 'queued',
        createdAt: new Date().toISOString(),
      };
      const offsets = [2, 5, 10] as const;
      for (const [idx, dayOffset] of offsets.entries()) {
        const sendAt = new Date();
        sendAt.setUTCDate(sendAt.getUTCDate() + dayOffset);
        await baseRef.doc(`${code}_${idx + 1}`).set({
          ...base,
          step: (idx + 1) as 1 | 2 | 3,
          sendAt: sendAt.toISOString(),
          message: buildBeneficiaryFollowupMessage({
            step: (idx + 1) as 1 | 2 | 3,
            beneficiaryFirstName: (beneficiaryName || 'there').split(' ')[0],
            insuredFirstName: (insuredName || 'your loved one').split(' ')[0],
            agentName,
            beneficiaryCode: code,
            appUrl: 'https://agentforlife.app/app',
            role,
            language,
          }),
        }, { merge: true });
      }
    }
    return NextResponse.json({ success: true, channel: validPhone ? 'email_fallback' : 'email' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to send beneficiary intro.';
    if (msg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
