import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { createChat, getLinqPhoneNumber } from '../../../../lib/linq';
import { getLinqAttachmentId } from '../../../../lib/business-card-url';
import { generateFirstMessage, filterConversationToGroupOnly, ReferralContext } from '../../../../lib/referral-ai';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { FieldValue } from 'firebase-admin/firestore';
import { upsertThreadFromOutbound } from '../../../../lib/conversation-thread-registry';

export const maxDuration = 90;

const DELAY_MS = 75_000; // ~75 seconds before the 1-on-1 opener

/**
 * POST /api/referral/first-message
 *
 * Fired non-blocking by the /api/referral/notify route.
 * Waits ~75 seconds, then sends the 1-on-1 NEPQ permission-based
 * opener to the referral and records it in Firestore.
 *
 * Body: { agentId, referralId }
 */
export async function POST(req: NextRequest) {
  try {
    const { agentId, referralId } = await req.json();

    if (!agentId || !referralId) {
      return NextResponse.json(
        { error: 'Missing required fields: agentId, referralId' },
        { status: 400 },
      );
    }

    // Wait before sending the 1-on-1 opener so it feels natural
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));

    const db = getAdminFirestore();

    // Fetch the referral doc
    const referralRef = db
      .collection('agents')
      .doc(agentId)
      .collection('referrals')
      .doc(referralId);

    const referralSnap = await referralRef.get();
    if (!referralSnap.exists) {
      return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
    }

    const referralData = referralSnap.data() as Record<string, unknown>;

    // If the referral already replied (status changed to active), skip
    if (referralData.status === 'active') {
      return NextResponse.json({ skipped: true, reason: 'Referral already active' });
    }

    // Fetch agent profile
    const agentDoc = await db.collection('agents').doc(agentId).get();
    const agentData = agentDoc.exists ? (agentDoc.data() as Record<string, unknown>) : {};
    const agentName = (agentData.name as string) || 'Your agent';
    const agentFirstName = agentName.split(' ')[0];
    const agentPhone = (agentData.linqPhoneNumber as string) || getLinqPhoneNumber();
    const schedulingUrl = (agentData.schedulingUrl as string) || null;

    const clientName = (referralData.clientName as string) || 'A friend';
    const rawConversation = (referralData.conversation as ReferralContext['conversation']) || [];
    const ctx: ReferralContext = {
      agentName,
      agentFirstName,
      clientName,
      clientFirstName: clientName.split(' ')[0],
      referralName: (referralData.referralName as string) || 'Friend',
      schedulingUrl,
      agentPhone,
      conversation: filterConversationToGroupOnly(rawConversation),
    };

    // Generate the 1-on-1 NEPQ opener
    const opener = await generateFirstMessage(ctx);

    if (!opener) {
      return NextResponse.json({ error: 'Failed to generate opener' }, { status: 500 });
    }

    const referralPhone = normalizePhone((referralData.referralPhone as string) || '');
    if (!isValidE164(referralPhone)) {
      return NextResponse.json({ error: 'Invalid referral phone number' }, { status: 422 });
    }

    const businessCardAttachmentId = await getLinqAttachmentId(agentId);
    const dmResult = await createChat({
      to: referralPhone,
      text: opener,
      attachmentIds: businessCardAttachmentId ? [businessCardAttachmentId] : undefined,
    });

    const openerMessage = {
      role: 'agent-ai',
      body: opener,
      timestamp: new Date().toISOString(),
    };

    await referralRef.update({
      conversation: FieldValue.arrayUnion(openerMessage),
      directChatId: dmResult.chatId,
      status: 'outreach-sent',
      lastDripAt: FieldValue.serverTimestamp(),
      dripCount: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await upsertThreadFromOutbound({
      db,
      agentId,
      providerThreadId: dmResult.chatId,
      providerType: 'sms_direct',
      lane: 'referral',
      purpose: 'referral_outreach',
      linkedEntityType: 'referral',
      linkedEntityId: referralId,
      participantPhonesE164: [referralPhone],
      allowAutoReply: true,
      allowedResponder: 'referral',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending first message:', error);
    return NextResponse.json(
      { error: 'Failed to send first message' },
      { status: 500 },
    );
  }
}
