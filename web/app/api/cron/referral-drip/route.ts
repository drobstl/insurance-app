import 'server-only';

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { getTwilioClient, getTwilioPhoneNumber } from '../../../../lib/twilio';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const DRIP_STATUSES = ['outreach-sent', 'drip-1', 'drip-2'] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Minimum time that must pass before each drip fires. */
const DRIP_DELAYS: Record<string, number> = {
  'outreach-sent': 2 * MS_PER_DAY, // Day 2
  'drip-1': 3 * MS_PER_DAY,        // Day 5 (2 + 3)
  'drip-2': 3 * MS_PER_DAY,        // Day 8 (5 + 3)
};

/** Next status after sending each drip. */
const NEXT_STATUS: Record<string, string> = {
  'outreach-sent': 'drip-1',
  'drip-1': 'drip-2',
  'drip-2': 'drip-complete',
};

function buildDripMessage(
  status: string,
  referralName: string,
  clientName: string,
  agentFirstName: string,
): string {
  switch (status) {
    case 'outreach-sent':
      return `Hey ${referralName}, just following up — ${clientName} spoke really highly of you and I wanted to make sure you got my message. No worries if now isn't the right time.`;
    case 'drip-1':
      return `Hey ${referralName}, quick question — if something unexpected happened tomorrow, how would your family handle the mortgage and bills? Most people don't think about that until it's too late. Happy to chat whenever you're ready.`;
    case 'drip-2':
      return `Hey ${referralName}, just wanted to leave the door open. If you ever want to look into getting your family protected, ${agentFirstName === referralName ? 'I' : "I'm"} a text away. Take care!`;
    default:
      return '';
  }
}

/**
 * GET /api/cron/referral-drip
 *
 * Vercel Cron — runs every 4 hours.
 * Checks for referrals that haven't responded and sends
 * follow-up drip messages on Day 2, 5, and 8.
 */
export async function GET() {
  try {
    const db = getAdminFirestore();
    const twilioClient = getTwilioClient();
    const now = Date.now();

    const agentsSnap = await db.collection('agents').get();
    let sent = 0;

    for (const agentDoc of agentsSnap.docs) {
      const agentData = agentDoc.data();
      const agentName = (agentData.name as string) || 'Your agent';
      const agentFirstName = agentName.split(' ')[0];
      const twilioNumber = (agentData.twilioPhoneNumber as string) || getTwilioPhoneNumber();

      for (const status of DRIP_STATUSES) {
        const referralsSnap = await db
          .collection('agents')
          .doc(agentDoc.id)
          .collection('referrals')
          .where('status', '==', status)
          .get();

        for (const referralDoc of referralsSnap.docs) {
          const data = referralDoc.data();

          // Determine when the last outreach was sent
          let lastDripMs: number;
          if (data.lastDripAt instanceof Timestamp) {
            lastDripMs = data.lastDripAt.toMillis();
          } else if (data.createdAt instanceof Timestamp) {
            lastDripMs = data.createdAt.toMillis();
          } else {
            continue;
          }

          const delay = DRIP_DELAYS[status];
          if (now - lastDripMs < delay) continue;

          const referralName = (data.referralName as string) || 'Friend';
          const clientName = (data.clientName as string) || 'A friend';
          const referralPhone = normalizePhone((data.referralPhone as string) || '');

          const message = buildDripMessage(status, referralName, clientName, agentFirstName);
          if (!message || !isValidE164(referralPhone)) continue;

          try {
            await twilioClient.messages.create({
              body: message,
              from: twilioNumber,
              to: referralPhone,
            });

            const dripMessage = {
              role: 'agent-ai',
              body: message,
              timestamp: new Date().toISOString(),
            };

            await referralDoc.ref.update({
              conversation: FieldValue.arrayUnion(dripMessage),
              status: NEXT_STATUS[status],
              dripCount: (data.dripCount || 0) + 1,
              lastDripAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });

            sent++;
          } catch (err) {
            console.error(`Failed to send drip to ${referralPhone}:`, err);
          }
        }
      }
    }

    return NextResponse.json({ success: true, dripsSent: sent });
  } catch (error) {
    console.error('Referral drip cron error:', error);
    return NextResponse.json({ error: 'Drip cron failed' }, { status: 500 });
  }
}
