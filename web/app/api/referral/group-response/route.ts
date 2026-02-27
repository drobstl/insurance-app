import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import {
  sendMessage,
  createChat,
  startTypingIndicator,
  stopTypingIndicator,
} from '../../../../lib/linq';
import {
  generateGroupIntroResponse,
  generateFirstMessage,
  type ReferralContext,
} from '../../../../lib/referral-ai';
import { getLinqAttachmentId } from '../../../../lib/business-card-url';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { FieldValue } from 'firebase-admin/firestore';

export const maxDuration = 120;

const GROUP_DELAY_MS = 35_000; // 30-45s before group intro
const DM_DELAY_MS = 12_000;   // 10-15s before 1-on-1 opener

/**
 * POST /api/referral/group-response
 *
 * Triggered internally by the Linq webhook after a group chat is detected.
 *
 * Flow:
 *   1. Wait 30-45s (let the group settle)
 *   2. Send a warm group intro via AI into the group chat
 *   3. Wait 10-15s
 *   4. Create a 1-on-1 chat with the referral: NEPQ opener + business card
 *
 * Body: { agentId, referralId, groupChatId }
 */
export async function POST(req: NextRequest) {
  try {
    const { agentId, referralId, groupChatId } = await req.json();

    if (!agentId || !referralId || !groupChatId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();

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

    if (referralData.status === 'active' || referralData.status === 'outreach-sent') {
      return NextResponse.json({ skipped: true, reason: 'Already processed' });
    }

    const agentDoc = await db.collection('agents').doc(agentId).get();
    const agentData = agentDoc.exists ? (agentDoc.data() as Record<string, unknown>) : {};
    const agentName = (agentData.name as string) || 'Your agent';
    const agentFirstName = agentName.split(' ')[0];
    const schedulingUrl = (agentData.schedulingUrl as string) || null;
    const clientName = (referralData.clientName as string) || 'A friend';
    const clientFirstName = clientName.split(' ')[0];
    const referralName = (referralData.referralName as string) || 'Friend';
    const referralPhone = normalizePhone((referralData.referralPhone as string) || '');

    // -----------------------------------------------------------------------
    // Step 1: Wait ~35s for the group chat to settle
    // -----------------------------------------------------------------------
    await new Promise((resolve) => setTimeout(resolve, GROUP_DELAY_MS));

    // Re-check in case the referral was already handled
    const freshSnap = await referralRef.get();
    if (!freshSnap.exists) return NextResponse.json({ skipped: true });
    const freshData = freshSnap.data() as Record<string, unknown>;
    if (freshData.status === 'active' || freshData.status === 'outreach-sent') {
      return NextResponse.json({ skipped: true, reason: 'Already processed' });
    }

    // -----------------------------------------------------------------------
    // Step 2: Send group intro message
    // -----------------------------------------------------------------------
    const groupIntro = await generateGroupIntroResponse({
      agentName,
      agentFirstName,
      clientName,
      clientFirstName,
      referralName,
    });

    if (groupIntro) {
      try {
        await startTypingIndicator(groupChatId);
        await new Promise((r) => setTimeout(r, 3000));
        await stopTypingIndicator(groupChatId);
      } catch { /* non-critical */ }

      await sendMessage({
        chatId: groupChatId,
        text: groupIntro,
      });

      const groupMsg = {
        role: 'agent-ai',
        body: `[Group]: ${groupIntro}`,
        timestamp: new Date().toISOString(),
      };

      await referralRef.update({
        conversation: FieldValue.arrayUnion(groupMsg),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // -----------------------------------------------------------------------
    // Step 3: Wait ~12s before the 1-on-1 opener
    // -----------------------------------------------------------------------
    await new Promise((resolve) => setTimeout(resolve, DM_DELAY_MS));

    // -----------------------------------------------------------------------
    // Step 4: Create 1-on-1 chat with NEPQ opener + business card
    // -----------------------------------------------------------------------
    if (!isValidE164(referralPhone)) {
      console.warn('Referral phone invalid, skipping 1-on-1 opener:', referralPhone);
      return NextResponse.json({ success: true, groupOnly: true });
    }

    const ctx: ReferralContext = {
      agentName,
      agentFirstName,
      clientName,
      clientFirstName,
      referralName,
      schedulingUrl,
      agentPhone: (agentData.phoneNumber as string) || null,
      conversation: (referralData.conversation as ReferralContext['conversation']) || [],
    };

    const opener = await generateFirstMessage(ctx);

    if (!opener) {
      return NextResponse.json({ error: 'Failed to generate opener' }, { status: 500 });
    }

    const businessCardAttachmentId = await getLinqAttachmentId(agentId);

    const dmResult = await createChat({
      to: referralPhone,
      text: opener,
      attachmentIds: businessCardAttachmentId ? [businessCardAttachmentId] : undefined,
    });

    const openerMsg = {
      role: 'agent-ai',
      body: opener,
      timestamp: new Date().toISOString(),
    };

    await referralRef.update({
      conversation: FieldValue.arrayUnion(openerMsg),
      directChatId: dmResult.chatId,
      status: 'outreach-sent',
      lastDripAt: FieldValue.serverTimestamp(),
      dripCount: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in group-response flow:', error);
    return NextResponse.json(
      { error: 'Failed to process group response' },
      { status: 500 },
    );
  }
}
