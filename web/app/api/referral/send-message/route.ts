import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { getTwilioClient, getTwilioPhoneNumber } from '../../../../lib/twilio';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/referral/send-message
 *
 * Sends a manual text from the agent's dashboard through their Twilio
 * business line. Records the message in Firestore and marks the referral
 * as agent-managed (aiEnabled = false) so the webhook won't auto-respond.
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
    const agentData = agentDoc.data() as Record<string, unknown>;
    const twilioNumber = (agentData.twilioPhoneNumber as string) || getTwilioPhoneNumber();

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
    const referralPhone = referralData.referralPhone as string;

    // Send via Twilio
    const twilioClient = getTwilioClient();
    await twilioClient.messages.create({
      body: body.trim(),
      from: twilioNumber,
      to: referralPhone,
    });

    // Record in conversation with role agent-manual
    const message = {
      role: 'agent-manual',
      body: body.trim(),
      timestamp: new Date().toISOString(),
    };

    await referralRef.update({
      conversation: FieldValue.arrayUnion(message),
      aiEnabled: false,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending manual message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 },
    );
  }
}
