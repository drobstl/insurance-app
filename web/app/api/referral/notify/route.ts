import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { getTwilioClient, getTwilioPhoneNumber } from '../../../../lib/twilio';
import { generateGroupAck, ReferralContext } from '../../../../lib/referral-ai';
import { normalizePhone } from '../../../../lib/phone';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/referral/notify
 *
 * Called by the mobile app after a client sends a referral SMS.
 * Creates a referral record in Firestore, sends a group text
 * acknowledgment via the AI, and fires off the delayed 1-on-1
 * NEPQ opener via /api/referral/first-message.
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

    // Fetch agent profile for name, Twilio number, scheduling URL
    const agentDoc = await db.collection('agents').doc(agentId).get();
    const agentData = agentDoc.exists ? (agentDoc.data() as Record<string, unknown>) : {};
    const agentName = (agentData.name as string) || 'Your agent';
    const agentFirstName = agentName.split(' ')[0];
    const twilioNumber = (agentData.twilioPhoneNumber as string) || getTwilioPhoneNumber();
    const schedulingUrl = (agentData.schedulingUrl as string) || null;

    const aiEnabled = (agentData.aiAssistantEnabled as boolean) !== false;

    // Create referral record
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
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const referralRef = await db
      .collection('agents')
      .doc(agentId)
      .collection('referrals')
      .add(referralData);

    // If AI is off globally, just create the record — no AI messages
    if (!aiEnabled) {
      return NextResponse.json({
        success: true,
        referralId: referralRef.id,
      });
    }

    // Build context for group acknowledgment
    const ctx: ReferralContext = {
      agentName,
      agentFirstName,
      clientName: clientName || 'A client',
      referralName: referralName || 'Friend',
      schedulingUrl,
      agentPhone: twilioNumber,
      conversation: [],
    };

    // Generate and send group text acknowledgment (Mode A).
    // Wrapped so an AI/Twilio failure doesn't prevent the first-message trigger.
    try {
      const groupAck = await generateGroupAck(ctx);

      if (groupAck) {
        const twilioClient = getTwilioClient();
        await twilioClient.messages.create({
          body: groupAck,
          from: twilioNumber,
          to: normalizedPhone,
        });

        const ackMessage = {
          role: 'agent-ai',
          body: groupAck,
          timestamp: new Date().toISOString(),
        };

        await referralRef.update({
          conversation: FieldValue.arrayUnion(ackMessage),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } catch (ackError) {
      console.error('Group ack failed (referral still created):', ackError);
    }

    // Fire non-blocking request to send the delayed 1-on-1 NEPQ opener
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${appUrl}/api/referral/first-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, referralId: referralRef.id }),
    }).catch((err) => {
      console.error('Failed to trigger first-message endpoint:', err);
    });

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
