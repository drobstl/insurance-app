import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { getTwilioClient, getTwilioPhoneNumber } from '../../../../lib/twilio';
import { generateReferralResponse, ConversationMessage, ReferralContext } from '../../../../lib/referral-ai';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/twilio/webhook
 *
 * Twilio calls this endpoint when an SMS is received on an agent's
 * Twilio number (or the platform test number). We look up the sender's
 * phone in our referrals collection, feed the conversation to OpenAI,
 * and reply in the same thread.
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

    // Normalize the sender's phone
    let normalizedFrom = from.replace(/[^0-9+]/g, '');
    if (!normalizedFrom.startsWith('+')) {
      if (normalizedFrom.startsWith('1') && normalizedFrom.length === 11) {
        normalizedFrom = '+' + normalizedFrom;
      } else if (normalizedFrom.length === 10) {
        normalizedFrom = '+1' + normalizedFrom;
      }
    }

    const db = getAdminFirestore();

    // Find the referral record by phone number.
    // We search across all agents' referrals subcollections.
    // For the Twilio number receiving the message, we check which agent it belongs to.
    const referralResult = await findReferralByPhone(db, normalizedFrom, to);

    if (!referralResult) {
      // Unknown sender — could be a client in the group text, or spam. Ignore.
      return twimlResponse('');
    }

    const { agentId, referralId, referralData, agentData } = referralResult;

    // Build conversation history
    const conversation: ConversationMessage[] = (referralData.conversation as ConversationMessage[]) || [];

    // Build context for the AI
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

    // Generate AI response
    const aiResponse = await generateReferralResponse(ctx, body);

    // Record the incoming message
    const newIncoming: ConversationMessage = {
      role: 'referral',
      body,
      timestamp: new Date().toISOString(),
    };

    const updates: Record<string, unknown> = {
      conversation: FieldValue.arrayUnion(newIncoming),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Update status to active on first reply
    if (referralData.status === 'pending') {
      updates.status = 'active';
    }

    if (aiResponse) {
      // Record the AI response
      const newOutgoing: ConversationMessage = {
        role: 'agent-ai',
        body: aiResponse,
        timestamp: new Date().toISOString(),
      };
      updates.conversation = FieldValue.arrayUnion(newIncoming, newOutgoing);

      // Check if the AI included the scheduling link (suggests appointment stage)
      if (schedulingUrl && aiResponse.includes(schedulingUrl)) {
        updates.status = 'booking-sent';
      }

      // Send the reply via Twilio
      const twilioClient = getTwilioClient();
      const twilioNumber = (agentData.twilioPhoneNumber as string) || getTwilioPhoneNumber();

      await twilioClient.messages.create({
        body: aiResponse,
        from: twilioNumber,
        to: normalizedFrom,
      });
    }

    // Update Firestore
    await db
      .collection('agents')
      .doc(agentId)
      .collection('referrals')
      .doc(referralId)
      .update(updates);

    // Return empty TwiML (we already sent the message via the REST API
    // so Twilio doesn't try to send a duplicate)
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
