import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { validateTwilioRequest } from '../../../../lib/twilio';

/**
 * POST /api/twilio/voice-forward
 *
 * When someone calls an agent's Twilio number, Twilio hits this endpoint.
 * We look up the agent who owns the number and return TwiML that forwards
 * the call to their personal phone.
 */
export async function POST(req: NextRequest) {
  try {
    const isValid = await validateTwilioRequest(req);
    if (!isValid) {
      console.warn('Rejected voice-forward request: invalid Twilio signature');
      return new NextResponse('Forbidden', { status: 403 });
    }

    const formData = await req.formData();
    const to = formData.get('To') as string;

    if (!to) {
      return twimlResponse('<Say>Sorry, this number is not available.</Say>');
    }

    const db = getAdminFirestore();

    // Find the agent who owns this Twilio number
    const agentsSnapshot = await db
      .collection('agents')
      .where('twilioPhoneNumber', '==', to)
      .limit(1)
      .get();

    if (agentsSnapshot.empty) {
      return twimlResponse('<Say>Sorry, this number is not available.</Say>');
    }

    const agentData = agentsSnapshot.docs[0].data();
    const personalPhone = agentData.phoneNumber as string | undefined;

    if (!personalPhone) {
      return twimlResponse(
        '<Say>The agent is not available right now. Please try again later.</Say>',
      );
    }

    // Forward the call to the agent's personal phone
    // Ring for 30 seconds, then go to voicemail message
    return twimlResponse(
      `<Dial timeout="30" callerId="${to}">` +
        `<Number>${personalPhone}</Number>` +
        `</Dial>` +
        `<Say>The agent is not available right now. Please leave a message after the tone.</Say>` +
        `<Record maxLength="120" transcribe="true" />`,
    );
  } catch (error) {
    console.error('Error in voice forward:', error);
    return twimlResponse('<Say>An error occurred. Please try again later.</Say>');
  }
}

function twimlResponse(innerXml: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${innerXml}</Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
