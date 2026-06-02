import 'server-only';

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { isFreeTier } from '../../../../lib/tier-gating';
import { sendOrCreateChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { buildReferralDripMessage, resolveClientLanguage } from '../../../../lib/client-language';
import { queueReferralActionItem } from '../../../../lib/referral-action-item-writer';

// May 8, 2026 line-health discipline: cap the referral chain at 2 Linq
// SMS max (initial outreach Day 0 + drip 1 Day 2). Drip 2 and drip 3
// were dropped per Daniel's call — too many unanswered outbound SMS to
// strangers is risky for line reputation. After drip 1, AI is done;
// 24h later the system creates an action item ("call this referral")
// for the agent to take over personally.
const DRIP_STATUSES = ['outreach-sent'] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DRIP_DELAYS: Record<string, number> = {
  'outreach-sent': 2 * MS_PER_DAY,
};

const NEXT_STATUS: Record<string, string> = {
  'outreach-sent': 'drip-1',
};

/**
 * GET /api/cron/referral-drip
 *
 * Vercel Cron — runs every 4 hours.
 * Sends ONE follow-up drip message on Day 2 via Linq (drip 1). After
 * that, the AI side is done — referrals with status='drip-1' that go
 * 24h+ without a client reply surface as agent action items so the
 * agent can call personally. Total Linq outbound per referral chain:
 * 2 SMS max (initial + drip 1).
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
      // Free tier is engine-paused: skip client-facing automated outreach.
      if (isFreeTier(agentData.membershipTier as string | undefined)) continue;
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

    // ── Phase 2: surface action items for stalled drip-1 referrals ──
    // Trigger: status=drip-1 AND >=24h since lastDripAt AND no client
    // reply since lastDripAt. Per the May 8 line-health cap, drip-1 is
    // the terminal AI-sent status (drip 2 + drip 3 dropped). 24h after
    // drip 1 with no reply, the lead transitions to agent-personal
    // action: action item created saying "call this referral."
    // Idempotent per referral via the writer's idempotencyKey.
    let actionItemsCreated = 0;
    try {
      const completeMs = 24 * 60 * 60 * 1000;
      for (const agentDoc of agentsSnap.docs) {
        const agentData = agentDoc.data();
        const completeSnap = await db
          .collection('agents')
          .doc(agentDoc.id)
          .collection('referrals')
          .where('status', '==', 'drip-1')
          .get();
        for (const referralDoc of completeSnap.docs) {
          const data = referralDoc.data();
          // Skip if already had an action item lifecycle on this
          // referral (writer is idempotent, so this is belt-and-
          // suspenders telemetry — the create call would just no-op).
          if (data.actionItemQueuedAt) continue;
          let lastDripMs: number | null = null;
          if (data.lastDripAt instanceof Timestamp) lastDripMs = data.lastDripAt.toMillis();
          if (!lastDripMs) continue;
          if (now - lastDripMs < completeMs) continue;
          // No client reply since the last drip. Use the conversation
          // array — last message authored by 'client' must be older
          // than lastDripAt for "no reply since" to hold.
          const conversation = Array.isArray(data.conversation) ? data.conversation : [];
          const lastClientMsgTs = conversation
            .filter((m: { role?: string; timestamp?: string }) => m?.role === 'client')
            .map((m: { timestamp?: string }) => (m.timestamp ? Date.parse(m.timestamp) : 0))
            .reduce((max: number, ts: number) => (ts > max ? ts : max), 0);
          if (lastClientMsgTs > lastDripMs) continue;
          try {
            const queueResult = await queueReferralActionItem({
              db,
              agentId: agentDoc.id,
              referralId: referralDoc.id,
              referralDoc: {
                referralName: data.referralName,
                referralPhone: data.referralPhone,
                clientName: data.clientName,
              },
              agentDoc: { name: agentData.name },
            });
            if (queueResult.outcome === 'created') {
              actionItemsCreated++;
              await referralDoc.ref.update({ actionItemQueuedAt: new Date().toISOString() });
            }
          } catch (queueErr) {
            console.warn('[referral-drip] action item queue failed (non-blocking)', {
              agentId: agentDoc.id,
              referralId: referralDoc.id,
              error: queueErr instanceof Error ? queueErr.message : String(queueErr),
            });
          }
        }
      }
    } catch (scanErr) {
      console.error('Referral drip action item scan failed (non-blocking):', scanErr);
    }

    return NextResponse.json({ success: true, dripsSent: sent, actionItemsCreated });
  } catch (error) {
    console.error('Referral drip cron error:', error);
    return NextResponse.json({ error: 'Drip cron failed' }, { status: 500 });
  }
}
