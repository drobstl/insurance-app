import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { normalizePhone } from '../../../../lib/phone';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/referral/notify
 *
 * Called by the mobile app after a client sends a personal referral text
 * (now a group iMessage via the native SMS composer with the agent's Linq
 * number included). Creates a referral record in Firestore.
 *
 * The Linq webhook (/api/linq/webhook) detects the inbound group message
 * and triggers the AI flow — no first-message endpoint needed.
 *
 * Body: { agentId, clientId, clientName, referralName, referralPhone }
 */
export async function POST(req: NextRequest) {
  try {
    const { agentId, clientId, clientName, referralName, referralPhone } = await req.json();

    if (!agentId || !referralPhone) {
      return NextResponse.json(
        { error: 'Missing required fields: agentId, referralPhone' },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();

    const normalizedPhone = normalizePhone(referralPhone);

    const agentDoc = await db.collection('agents').doc(agentId).get();
    const agentData = agentDoc.exists ? (agentDoc.data() as Record<string, unknown>) : {};

    const aiEnabled = (agentData.aiAssistantEnabled as boolean) !== false;

    const referralData = {
      referralName: referralName || 'Friend',
      referralPhone: normalizedPhone,
      clientName: clientName || 'A client',
      clientId: clientId || null,
      status: 'pending',
      conversation: [],
      gatheredInfo: {},
      appointmentBooked: false,
      aiEnabled,
      dripCount: 0,
      lastDripAt: null,
      groupChatId: null,
      directChatId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const referralRef = await db
      .collection('agents')
      .doc(agentId)
      .collection('referrals')
      .add(referralData);

    return NextResponse.json({
      success: true,
      referralId: referralRef.id,
    });
  } catch (error) {
    console.error('Error creating referral record:', error);
    return NextResponse.json(
      { error: 'Failed to create referral record' },
      { status: 500 },
    );
  }
}
