import 'server-only';

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { generateDripMessage, type PolicyReviewDripContext } from '../../../../lib/policy-review-ai';
import { sendOrCreateChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { resolveClientLanguage } from '../../../../lib/client-language';
import { Resend } from 'resend';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  type ConservationChannel,
  type ReviewTouchStage,
  REVIEW_STAGE_TO_STATUS,
  REVIEW_STATUS_TO_STAGE,
  REVIEW_STAGE_DRIP_NUMBER,
  NEXT_REVIEW_STAGE,
  REVIEW_STAGE_DELAY,
  REVIEW_STAGE_FALLBACK_ORDER,
  REVIEW_STAGE_COMPLEMENT_EMAIL,
} from '../../../../lib/conservation-types';
import { upsertThreadFromOutbound } from '../../../../lib/conversation-thread-registry';

/**
 * Cron: runs every 4 hours.
 * Staged follow-up for policy review campaigns.
 *
 * initial (outreach-sent)  → 3 days  → followup_3d  (drip-1)
 * followup_3d (drip-1)     → 7 days  → followup_7d  (drip-2)
 * followup_7d (drip-2)     → 14 days → followup_14d (drip-complete) + email complement
 *
 * Stops when the client replies (lastClientReplyAt is set).
 */

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

async function sendPush(
  pushToken: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: pushToken,
        title,
        body,
        sound: 'default',
        badge: 1,
        priority: 'high',
        data,
      }),
    });
    const result = await res.json();
    return result?.data?.status === 'ok';
  } catch {
    return false;
  }
}

function resolveReviewStage(data: FirebaseFirestore.DocumentData): { stage: ReviewTouchStage; nextTouchAt: string | null } | null {
  const explicit = data.touchStage as ReviewTouchStage | null | undefined;
  if (explicit) {
    return { stage: explicit, nextTouchAt: (data.nextTouchAt as string) || null };
  }

  const status = data.status as string;
  const mapped = REVIEW_STATUS_TO_STAGE[status as keyof typeof REVIEW_STATUS_TO_STAGE];
  if (!mapped) return null;

  const lastDripAt = data.lastDripAt as string | Timestamp | null;
  const baseTime = lastDripAt instanceof Timestamp
    ? new Date(lastDripAt.toMillis()).toISOString()
    : (lastDripAt as string | null);

  const nextStage = NEXT_REVIEW_STAGE[mapped];
  let nextTouchAt: string | null = null;
  if (nextStage && baseTime) {
    nextTouchAt = new Date(new Date(baseTime).getTime() + REVIEW_STAGE_DELAY[nextStage]).toISOString();
  }

  return { stage: mapped, nextTouchAt };
}

const ACTIVE_STATUSES = ['outreach-sent', 'drip-1', 'drip-2'] as const;

export async function GET() {
  try {
    const db = getAdminFirestore();
    const now = Date.now();
    const nowIso = new Date().toISOString();
    let sent = 0;
    let skipped = 0;

    const agentsSnap = await db.collection('agents').get();

    for (const agentDoc of agentsSnap.docs) {
      const agentData = agentDoc.data();
      const agentName = (agentData.name as string) || 'Your agent';
      const agentFirstName = agentName.split(' ')[0];
      const schedulingUrl = (agentData.schedulingUrl as string) || null;
      const agentEmail = (agentData.email as string) || null;
      const agentPhone = (agentData.phoneNumber as string) || null;

      for (const statusVal of ACTIVE_STATUSES) {
        const reviewsSnap = await db
          .collection('agents').doc(agentDoc.id)
          .collection('policyReviews')
          .where('status', '==', statusVal)
          .get();

        for (const reviewDoc of reviewsSnap.docs) {
          const data = reviewDoc.data();

          if (data.lastClientReplyAt) continue;
          if (data.aiEnabled === false) continue;

          const stageInfo = resolveReviewStage(data);
          if (!stageInfo) continue;

          const nextStage = NEXT_REVIEW_STAGE[stageInfo.stage];
          if (!nextStage) continue;

          // Check timing
          let dueAt: number;
          if (stageInfo.nextTouchAt) {
            dueAt = new Date(stageInfo.nextTouchAt).getTime();
          } else {
            let baseMs: number;
            if (data.lastDripAt instanceof Timestamp) {
              baseMs = data.lastDripAt.toMillis();
            } else if (data.createdAt instanceof Timestamp) {
              baseMs = data.createdAt.toMillis();
            } else {
              continue;
            }
            dueAt = baseMs + REVIEW_STAGE_DELAY[nextStage];
          }

          if (now < dueAt) continue;

          const clientPhone = data.clientPhone ? normalizePhone(data.clientPhone as string) : null;
          const hasPhone = clientPhone ? isValidE164(clientPhone) : false;

          const dripCtx: PolicyReviewDripContext = {
            agentName,
            agentFirstName,
            clientName: (data.clientName as string) || 'Client',
            clientFirstName: (data.clientFirstName as string) || 'Client',
            policyType: (data.policyType as string) || 'Policy',
            carrier: (data.carrier as string) || '',
            schedulingUrl,
            dripNumber: REVIEW_STAGE_DRIP_NUMBER[nextStage],
            preferredLanguage: resolveClientLanguage(data.preferredLanguage),
          };

          let message: string;
          try {
            message = await generateDripMessage(dripCtx);
            if (!message) continue;
          } catch (err) {
            console.error(`Failed to generate drip for ${data.clientName}:`, err);
            continue;
          }

          // Try channels in fallback order
          let usedChannel: ConservationChannel | null = null;
          let chatId: string | null = (data.chatId as string) || null;
          const clientPushToken = (data.clientPushToken as string) || null;

          // If we don't have the push token on the review doc, fetch from client
          let pushToken = clientPushToken;
          if (!pushToken && data.clientId) {
            try {
              const clientDoc = await db
                .collection('agents').doc(agentDoc.id)
                .collection('clients').doc(data.clientId as string)
                .get();
              if (clientDoc.exists) {
                pushToken = (clientDoc.data()!.pushToken as string) || null;
                dripCtx.preferredLanguage = resolveClientLanguage(
                  data.preferredLanguage ?? clientDoc.data()!.preferredLanguage,
                );
              }
            } catch { /* ignore */ }
          }

          const pushTitle = dripCtx.dripNumber <= 1 ? 'Policy Check-In' : 'Quick Reminder';

          // Anniversary is push-only with no fallback (May 4, 2026
          // architectural rule, see strategy decisions §1/§6 +
          // CONTEXT.md `Channel Rules`). REVIEW_STAGE_FALLBACK_ORDER is
          // ['push'] for every stage. The SMS branch below is dead for
          // anniversary and intentionally retained as shared vocabulary —
          // do not extend it back to SMS for this lane.
          let pushSendAttempted = false;
          for (const ch of REVIEW_STAGE_FALLBACK_ORDER[nextStage]) {
            if (ch === 'push' && pushToken) {
              pushSendAttempted = true;
              const ok = await sendPush(pushToken, pushTitle, message, {
                type: 'policy-review',
                agentId: agentDoc.id,
                clientId: data.clientId,
                ...(schedulingUrl ? { schedulingUrl, includeBookingLink: true } : {}),
              });
              if (ok) { usedChannel = 'push'; break; }
            } else if (ch === 'sms' && hasPhone) {
              try {
                const idempotencyKey = `policy-review-drip-${reviewDoc.id}-${nextStage}`;
                const result = await sendOrCreateChat({
                  to: clientPhone!,
                  chatId,
                  text: message,
                  idempotencyKey,
                });
                chatId = result.chatId;
                usedChannel = 'sms';
                break;
              } catch { /* fall through */ }
            }
          }

          if (!usedChannel) {
            // Push unavailable (no token) or push send failed.
            // Anniversary has no fallback channel — terminate the campaign
            // so the drip cron stops re-attempting every 4 hours.
            const skipReason: 'push_unavailable' | 'push_send_failed' =
              pushSendAttempted ? 'push_send_failed' : 'push_unavailable';
            try {
              await reviewDoc.ref.update({
                status: 'drip-complete',
                touchStage: 'followup_14d',
                nextTouchAt: null,
                pushSkippedAt: FieldValue.serverTimestamp(),
                pushSkippedReason: skipReason,
                updatedAt: FieldValue.serverTimestamp(),
              });
            } catch (markErr) {
              console.error(
                `Failed to mark review ${reviewDoc.id} as skipped:`,
                markErr,
              );
            }
            skipped++;
            console.log('[policy-review-drip] skipped (push unavailable)', {
              agentId: agentDoc.id,
              reviewId: reviewDoc.id,
              clientId: data.clientId,
              stage: nextStage,
              reason: skipReason,
              hasPushToken: !!pushToken,
              lane: 'anniversary',
            });
            continue;
          }

          // Email complement on final stage
          if (REVIEW_STAGE_COMPLEMENT_EMAIL[nextStage]) {
            const clientEmail = data.clientEmail as string | undefined;
            let emailAddr = clientEmail;
            if (!emailAddr && data.clientId) {
              try {
                const clientDoc = await db
                  .collection('agents').doc(agentDoc.id)
                  .collection('clients').doc(data.clientId as string)
                  .get();
                if (clientDoc.exists) emailAddr = (clientDoc.data()!.email as string) || undefined;
              } catch { /* ignore */ }
            }
            if (emailAddr) {
              try {
                const policyType = (data.policyType as string) || 'policy';
                const resend = getResend();
                await resend.emails.send({
                  from: `${agentName} via AgentForLife™ <support@agentforlife.app>`,
                  to: emailAddr,
                  subject: `${agentFirstName} here — your ${policyType} anniversary`,
                  text: message,
                });
              } catch (emailErr) {
                console.error('Policy review complement email failed:', emailErr);
              }
            }
          }

          const conversationEntry = {
            role: 'agent-ai',
            body: message,
            timestamp: nowIso,
            channels: [usedChannel],
          };

          const existingChannelsUsed = (data.channelsUsed as ConservationChannel[]) || [];
          const nextNextStage = NEXT_REVIEW_STAGE[nextStage];
          const nextNextTouchAt = nextNextStage
            ? new Date(now + REVIEW_STAGE_DELAY[nextNextStage]).toISOString()
            : null;

          const update: Record<string, unknown> = {
            conversation: FieldValue.arrayUnion(conversationEntry),
            status: REVIEW_STAGE_TO_STATUS[nextStage],
            touchStage: nextStage,
            nextTouchAt: nextNextTouchAt,
            channelsUsed: [...existingChannelsUsed, usedChannel],
            dripCount: (data.dripCount || 0) + 1,
            lastDripAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          };

          if (chatId && !data.chatId) {
            update.chatId = chatId;
          }

          await reviewDoc.ref.update(update);
          if (chatId) {
            await upsertThreadFromOutbound({
              db,
              agentId: agentDoc.id,
              providerThreadId: chatId,
              providerType: 'sms_direct',
              lane: 'policy_review',
              purpose: 'policy_review',
              linkedEntityType: 'policyReview',
              linkedEntityId: reviewDoc.id,
              participantPhonesE164: hasPhone ? [clientPhone!] : [],
              allowAutoReply: true,
              allowedResponder: 'policy_review',
            });
          }
          sent++;
        }
      }
    }

    return NextResponse.json({ success: true, dripsSent: sent, dripsSkipped: skipped });
  } catch (error) {
    console.error('Policy review drip cron error:', error);
    return NextResponse.json({ error: 'Drip cron failed' }, { status: 500 });
  }
}
