import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { getTwilioClient } from '../../../../lib/twilio';

/**
 * POST /api/twilio/provision
 *
 * Auto-provisions a Twilio phone number for an agent.
 * Buys a local US number (matching area code if possible),
 * configures SMS and voice webhooks, and stores the number
 * in the agent's Firestore document.
 *
 * Auth: Bearer <Firebase ID token>
 * Body: { areaCode?: string }
 */
export async function POST(req: NextRequest) {
  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(token);
    const agentId = decodedToken.uid;

    const db = getAdminFirestore();

    // Check if agent already has a Twilio number
    const agentDoc = await db.collection('agents').doc(agentId).get();
    const agentData = agentDoc.data();

    if (agentData?.twilioPhoneNumber) {
      return NextResponse.json({
        success: true,
        phoneNumber: agentData.twilioPhoneNumber,
        message: 'Number already provisioned',
      });
    }

    // Parse optional area code preference
    const body = await req.json().catch(() => ({}));
    const preferredAreaCode = body.areaCode || null;

    const twilioClient = getTwilioClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app';
    const smsWebhookUrl = `${appUrl}/api/twilio/webhook`;
    const voiceWebhookUrl = `${appUrl}/api/twilio/voice-forward`;

    let purchasedNumber: string | null = null;

    // Try to buy a number with the preferred area code
    if (preferredAreaCode) {
      try {
        const available = await twilioClient.availablePhoneNumbers('US')
          .local.list({
            areaCode: parseInt(preferredAreaCode, 10),
            smsEnabled: true,
            voiceEnabled: true,
            limit: 1,
          });

        if (available.length > 0) {
          const bought = await twilioClient.incomingPhoneNumbers.create({
            phoneNumber: available[0].phoneNumber,
            smsUrl: smsWebhookUrl,
            smsMethod: 'POST',
            voiceUrl: voiceWebhookUrl,
            voiceMethod: 'POST',
          });
          purchasedNumber = bought.phoneNumber;
        }
      } catch (err) {
        console.log('Could not buy number with preferred area code, trying any:', err);
      }
    }

    // Fallback: buy any available US local number
    if (!purchasedNumber) {
      const available = await twilioClient.availablePhoneNumbers('US')
        .local.list({
          smsEnabled: true,
          voiceEnabled: true,
          limit: 1,
        });

      if (available.length === 0) {
        return NextResponse.json(
          { error: 'No phone numbers available' },
          { status: 503 },
        );
      }

      const bought = await twilioClient.incomingPhoneNumbers.create({
        phoneNumber: available[0].phoneNumber,
        smsUrl: smsWebhookUrl,
        smsMethod: 'POST',
        voiceUrl: voiceWebhookUrl,
        voiceMethod: 'POST',
      });
      purchasedNumber = bought.phoneNumber;
    }

    // Store the number in the agent's Firestore document
    await db.collection('agents').doc(agentId).update({
      twilioPhoneNumber: purchasedNumber,
    });

    return NextResponse.json({
      success: true,
      phoneNumber: purchasedNumber,
    });
  } catch (error) {
    console.error('Error provisioning Twilio number:', error);

    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to provision phone number' },
      { status: 500 },
    );
  }
}
