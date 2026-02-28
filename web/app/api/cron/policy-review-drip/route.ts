import 'server-only';

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { generateDripMessage, type PolicyReviewDripContext } from '../../../../lib/policy-review-ai';
import { sendOrCreateChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * Cron: runs every 4 hours.
 * Sends follow-up drip messages for policy review campaigns.
 *
 * outreach-sent → 2 days → drip-1 (follow-up #1, different angle)
 * drip-1         → 3 days → drip-2 (final gracious follow-up)
 * drip-2         → auto   → drip-complete
 *
 * Only sends drips if the client hasn't replied (no 'client' role in conversation).
 */

const DRIP_STATUSES = ['outreach-sent', 'drip-1'] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DRIP_DELAYS: Record<string, number> = {
  'outreach-sent': 2 * MS_PER_DAY,
  'drip-1': 3 * MS_PER_DAY,
};

const NEXT_STATUS: Record<string, string> = {
  'outreach-sent': 'drip-1',
  'drip-1': 'drip-2',
};

const DRIP_NUMBER: Record<string, number> = {
  'outreach-sent': 1,
  'drip-1': 2,
};

export async function GET() {
  try {
    const db = getAdminFirestore();
    const now = Date.now();
    let sent = 0;

    const agentsSnap = await db.collection('agents').get();

    for (const agentDoc of agentsSnap.docs) {
      const agentData = agentDoc.data();
      const agentName = (agentData.name as string) || 'Your agent';
      const agentFirstName = agentName.split(' ')[0];
      const schedulingUrl = (agentData.schedulingUrl as string) || null;

      for (const status of DRIP_STATUSES) {
        const reviewsSnap = await db
          .collection('agents').doc(agentDoc.id)
          .collection('policyReviews')
          .where('status', '==', status)
          .get();

        for (const reviewDoc of reviewsSnap.docs) {
          const data = reviewDoc.data();

          // Skip if client has replied (conversation-active should be handled by webhook, not drip)
          const conversation = (data.conversation as Array<{ role: string }>) || [];
          const clientReplied = conversation.some((m) => m.role === 'client');
          if (clientReplied) continue;

          if (data.aiEnabled === false) continue;

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

          const clientPhone = data.clientPhone ? normalizePhone(data.clientPhone as string) : null;
          if (!clientPhone || !isValidE164(clientPhone)) continue;

          const dripCtx: PolicyReviewDripContext = {
            agentName,
            agentFirstName,
            clientName: (data.clientName as string) || 'Client',
            clientFirstName: (data.clientFirstName as string) || 'Client',
            policyType: (data.policyType as string) || 'Policy',
            carrier: (data.carrier as string) || '',
            schedulingUrl,
            dripNumber: DRIP_NUMBER[status],
          };

          try {
            const message = await generateDripMessage(dripCtx);
            if (!message) continue;

            const chatId = (data.chatId as string) || null;
            const idempotencyKey = `policy-review-drip-${reviewDoc.id}-${NEXT_STATUS[status]}`;

            const result = await sendOrCreateChat({
              to: clientPhone,
              chatId,
              text: message,
              idempotencyKey,
            });

            const dripMessage = {
              role: 'agent-ai',
              body: message,
              timestamp: new Date().toISOString(),
            };

            const nextStatus = NEXT_STATUS[status];

            const update: Record<string, unknown> = {
              conversation: FieldValue.arrayUnion(dripMessage),
              status: nextStatus === 'drip-2' ? 'drip-complete' : nextStatus,
              dripCount: (data.dripCount || 0) + 1,
              lastDripAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            };

            if (!chatId) {
              update.chatId = result.chatId;
            }

            await reviewDoc.ref.update(update);
            sent++;
          } catch (err) {
            console.error(`Policy review drip failed for ${data.clientName}:`, err);
          }
        }
      }
    }

    return NextResponse.json({ success: true, dripsSent: sent });
  } catch (error) {
    console.error('Policy review drip cron error:', error);
    return NextResponse.json({ error: 'Drip cron failed' }, { status: 500 });
  }
}
