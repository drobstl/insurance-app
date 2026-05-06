import 'server-only';

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { sendOrCreateChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { buildReferralDripMessage, resolveClientLanguage } from '../../../../lib/client-language';

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

/**
 * GET /api/cron/referral-drip
 *
 * Vercel Cron — runs every 4 hours.
 * Sends follow-up drip messages on Day 2, 5, and 8 via Linq
 * to the referral's 1-on-1 directChatId.
 */
export async function GET() {
  if (process.env.LINQ_OUTBOUND_DISABLED === 'true') {
    // ── Drain mode ──────────────────────────────────────────────────────
    // Linq outbound is paused. Mark any referral whose next drip would
    // have fired during the pause as `linqPausedSkippedAt` so it never
    // gets queued for replay when the switch is flipped off.
    try {
      const db = getAdminFirestore();
      const now = Date.now();
      const nowIso = new Date().toISOString();
      let drained = 0;
      const agentsSnap = await db.collection('agents').get();
      for (const agentDoc of agentsSnap.docs) {
        for (const status of DRIP_STATUSES) {
          const referralsSnap = await db
            .collection('agents')
            .doc(agentDoc.id)
            .collection('referrals')
            .where('status', '==', status)
            .get();
          for (const referralDoc of referralsSnap.docs) {
            const data = referralDoc.data();
            if (data.linqPausedSkippedAt) continue;
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
            await referralDoc.ref.update({
              linqPausedSkippedAt: nowIso,
              linqPausedSkippedReason: 'linq-outbound-disabled',
            });
            drained++;
          }
        }
      }
      console.warn('[linq:outbound-skipped]', JSON.stringify({ fn: 'cron:referral-drip', mode: 'drain', drained }));
      return NextResponse.json({ success: true, mode: 'paused-drain', drained });
    } catch (error) {
      console.error('Referral drip drain mode error:', error);
      return NextResponse.json({ error: 'Drain failed' }, { status: 500 });
    }
  }

  try {
    const db = getAdminFirestore();
    const now = Date.now();

    const agentsSnap = await db.collection('agents').get();
    let sent = 0;

    for (const agentDoc of agentsSnap.docs) {
      const agentData = agentDoc.data();
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

          if (data.linqPausedSkippedAt) continue;

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

          const message = buildReferralDripMessage({
            status,
            referralName,
            clientName,
            schedulingUrl,
            language: resolveClientLanguage(data.preferredLanguage),
          });
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
