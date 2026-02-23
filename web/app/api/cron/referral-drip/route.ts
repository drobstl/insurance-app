import 'server-only';

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { sendOrCreateChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const DRIP_STATUSES = ['outreach-sent', 'drip-1', 'drip-2'] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DRIP_DELAYS: Record<string, number> = {
  'outreach-sent': 2 * MS_PER_DAY,
  'drip-1': 3 * MS_PER_DAY,
  'drip-2': 3 * MS_PER_DAY,
};

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
  schedulingUrl: string | null,
): string {
  switch (status) {
    case 'outreach-sent':
      return `Hey ${referralName}, ${clientName} mentioned something interesting about you that made me think I could help. Did you get my last message?`;

    case 'drip-1':
      return `Hey ${referralName}, quick thought — most families don't realize how fast things add up if something unexpected happens. The mortgage, bills, kids' expenses. It's one of those things that's easy to put off but hard to fix after the fact. Anyway, just wanted to plant the seed — no pressure at all.`;

    case 'drip-2': {
      const bookingPart = schedulingUrl
        ? ` If you ever want to take 15 minutes to see where you stand, here's my calendar: ${schedulingUrl}`
        : ` If you ever want to chat, I'm a text away.`;
      return `Hey ${referralName}, last thing from me — I don't want to be that person who keeps texting.${bookingPart} Either way, it was great connecting through ${clientName}. Take care!`;
    }

    default:
      return '';
  }
}

/**
 * GET /api/cron/referral-drip
 *
 * Vercel Cron — runs every 4 hours.
 * Sends follow-up drip messages on Day 2, 5, and 8 via Linq
 * to the referral's 1-on-1 directChatId.
 */
export async function GET() {
  try {
    const db = getAdminFirestore();
    const now = Date.now();

    const agentsSnap = await db.collection('agents').get();
    let sent = 0;

    for (const agentDoc of agentsSnap.docs) {
      const agentData = agentDoc.data();
      const agentName = (agentData.name as string) || 'Your agent';
      const agentFirstName = agentName.split(' ')[0];
      const schedulingUrl = (agentData.schedulingUrl as string) || null;

      for (const status of DRIP_STATUSES) {
        const referralsSnap = await db
          .collection('agents')
          .doc(agentDoc.id)
          .collection('referrals')
          .where('status', '==', status)
          .get();

        for (const referralDoc of referralsSnap.docs) {
          const data = referralDoc.data();

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

          const message = buildDripMessage(status, referralName, clientName, agentFirstName, schedulingUrl);
          if (!message || !isValidE164(referralPhone)) continue;

          const directChatId = (data.directChatId as string) || null;
          const idempotencyKey = `drip-${referralDoc.id}-${NEXT_STATUS[status]}`;

          try {
            const result = await sendOrCreateChat({
              to: referralPhone,
              chatId: directChatId,
              text: message,
              idempotencyKey,
            });

            const dripMessage = {
              role: 'agent-ai',
              body: message,
              timestamp: new Date().toISOString(),
            };

            const update: Record<string, unknown> = {
              conversation: FieldValue.arrayUnion(dripMessage),
              status: NEXT_STATUS[status],
              dripCount: (data.dripCount || 0) + 1,
              lastDripAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            };
            if (!directChatId) {
              update.directChatId = result.chatId;
            }

            await referralDoc.ref.update(update);

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
