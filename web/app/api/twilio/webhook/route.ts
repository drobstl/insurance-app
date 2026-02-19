import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { getTwilioClient, getTwilioPhoneNumber } from '../../../../lib/twilio';
import { generateReferralResponse, ConversationMessage, ReferralContext } from '../../../../lib/referral-ai';
import { normalizePhone } from '../../../../lib/phone';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/twilio/webhook
 *
 * Twilio calls this endpoint when an SMS is received on an agent's
 * Twilio number (or the platform test number). We look up the sender's
 * phone in our referrals collection, feed the conversation to Claude
 * (NEPQ framework), and reply in the same thread.
 *
 * Twilio sends form-encoded data, not JSON.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string;
    const to = formData.get('To') as string;

    if (!from || !body) {
      return twimlResponse('');
    }

    const normalizedFrom = normalizePhone(from);

    const db = getAdminFirestore();

    const referralResult = await findReferralByPhone(db, normalizedFrom, to);

    if (!referralResult) {
      return twimlResponse('');
    }

    const { agentId, referralId, referralData, agentData } = referralResult;

    const referralRef = db
      .collection('agents')
      .doc(agentId)
      .collection('referrals')
      .doc(referralId);

    const newIncoming: ConversationMessage = {
      role: 'referral',
      body,
      timestamp: new Date().toISOString(),
    };

    // Persist the incoming message IMMEDIATELY so it's never lost,
    // even if the AI call or Twilio send fails downstream.
    const incomingUpdate: Record<string, unknown> = {
      conversation: FieldValue.arrayUnion(newIncoming),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (['pending', 'outreach-sent', 'drip-1', 'drip-2'].includes(referralData.status as string)) {
      incomingUpdate.status = 'active';
    }

    await referralRef.update(incomingUpdate);

    if (referralData.aiEnabled === false) {
      return twimlResponse('');
    }

    // Build conversation history and AI context
    const conversation: ConversationMessage[] = (referralData.conversation as ConversationMessage[]) || [];
    const agentName = (agentData.name as string) || 'Your agent';
    const agentFirstName = agentName.split(' ')[0];
    const schedulingUrl = (agentData.schedulingUrl as string) || null;
    const agentPhone = (agentData.phoneNumber as string) || null;

    const ctx: ReferralContext = {
      agentName,
      agentFirstName,
      clientName: (referralData.clientName as string) || 'A friend',
      referralName: (referralData.referralName as string) || 'Friend',
      schedulingUrl,
      agentPhone,
      conversation,
    };

    let aiResponse: string | null = null;
    try {
      aiResponse = await generateReferralResponse(ctx, body);
    } catch (aiError) {
      console.error('AI generation failed for referral', referralId, aiError);
      // Incoming message is already saved — agent can respond manually from dashboard
      return twimlResponse('');
    }

    if (aiResponse) {
      const newOutgoing: ConversationMessage = {
        role: 'agent-ai',
        body: aiResponse,
        timestamp: new Date().toISOString(),
      };

      const aiUpdate: Record<string, unknown> = {
        conversation: FieldValue.arrayUnion(newOutgoing),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (schedulingUrl && aiResponse.includes(schedulingUrl)) {
        aiUpdate.status = 'booking-sent';
      }

      const twilioClient = getTwilioClient();
      const twilioNumber = (agentData.twilioPhoneNumber as string) || getTwilioPhoneNumber();

      await twilioClient.messages.create({
        body: aiResponse,
        from: twilioNumber,
        to: normalizedFrom,
      });

      await referralRef.update(aiUpdate);
    }

    return twimlResponse('');
  } catch (error) {
    console.error('Error in Twilio webhook:', error);
    return twimlResponse('');
  }
}

/**
 * Find a referral record by the sender's phone number.
 * Checks the agent who owns the Twilio number first (fast path),
 * then falls back to searching all agents.
 */
async function findReferralByPhone(
  db: FirebaseFirestore.Firestore,
  phone: string,
  twilioNumber: string,
) {
  // First, find which agent owns this Twilio number
  const agentsSnapshot = await db
    .collection('agents')
    .where('twilioPhoneNumber', '==', twilioNumber)
    .limit(1)
    .get();

  let agentIds: string[] = [];

  if (!agentsSnapshot.empty) {
    agentIds = [agentsSnapshot.docs[0].id];
  } else {
    // Fallback: the platform test number — search all agents
    const allAgents = await db.collection('agents').get();
    agentIds = allAgents.docs.map((d) => d.id);
  }

  for (const agentId of agentIds) {
    // Query referrals by phone, most recent first
    const referralsSnapshot = await db
      .collection('agents')
      .doc(agentId)
      .collection('referrals')
      .where('referralPhone', '==', phone)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (!referralsSnapshot.empty) {
      const referralDoc = referralsSnapshot.docs[0];
      const agentDoc = await db.collection('agents').doc(agentId).get();

      return {
        agentId,
        referralId: referralDoc.id,
        referralData: referralDoc.data() as Record<string, unknown>,
        agentData: agentDoc.data() as Record<string, unknown>,
      };
    }
  }

  return null;
}

/**
 * Return a TwiML-formatted response (Twilio expects XML).
 */
function twimlResponse(message: string) {
  const xml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
