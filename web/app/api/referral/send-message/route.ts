import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { sendOrCreateChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { FieldValue } from 'firebase-admin/firestore';
import { upsertThreadFromOutbound } from '../../../../lib/conversation-thread-registry';

/**
 * POST /api/referral/send-message
 *
 * Sends a manual text from the agent's dashboard via Linq.
 * Uses the referral's directChatId for the 1-on-1 thread.
 * Records the message in Firestore and marks the referral as
 * agent-managed (aiEnabled = false) so the webhook won't auto-respond.
 *
 * Body: { agentId, referralId, body }
 */
export async function POST(req: NextRequest) {
  try {
    const { agentId, referralId, body } = await req.json();

    if (!agentId || !referralId || !body?.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields: agentId, referralId, body' },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();

    const agentDoc = await db.collection('agents').doc(agentId).get();
    if (!agentDoc.exists) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const referralRef = db
      .collection('agents')
      .doc(agentId)
      .collection('referrals')
      .doc(referralId);

    const referralDoc = await referralRef.get();
    if (!referralDoc.exists) {
      return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
    }
    const referralData = referralDoc.data() as Record<string, unknown>;
    const referralPhone = normalizePhone((referralData.referralPhone as string) || '');

    if (!isValidE164(referralPhone)) {
      return NextResponse.json(
        { error: 'Invalid referral phone number' },
        { status: 422 },
      );
    }

    const directChatId = (referralData.directChatId as string) || null;

    const result = await sendOrCreateChat({
      to: referralPhone,
      chatId: directChatId,
      text: body.trim(),
    });

    const message = {
      role: 'agent-manual',
      body: body.trim(),
      timestamp: new Date().toISOString(),
    };

    try {
      const update: Record<string, unknown> = {
        conversation: FieldValue.arrayUnion(message),
        aiEnabled: false,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!directChatId) {
        update.directChatId = result.chatId;
      }
      await referralRef.update(update);

      await upsertThreadFromOutbound({
        db,
        agentId,
        providerThreadId: result.chatId,
        providerType: 'sms_direct',
        lane: 'referral',
        purpose: 'referral_outreach',
        linkedEntityType: 'referral',
        linkedEntityId: referralId,
        participantPhonesE164: [referralPhone],
        allowAutoReply: false,
        allowedResponder: 'manual_only',
      });
    } catch (dbError) {
      console.error(
        'Linq send succeeded but Firestore update failed for referral',
        referralId,
        dbError,
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending manual message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 },
    );
  }
}
