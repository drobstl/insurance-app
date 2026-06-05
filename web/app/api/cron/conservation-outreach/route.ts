import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { isClientOutreachPaused } from '../../../../lib/tier-gating';
import { sendOrCreateChat } from '../../../../lib/linq';
import { isWithinQuietHoursWindow } from '../../../../lib/quiet-hours';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { Resend } from 'resend';
import {
  generateOutreachMessage,
  generateConservationEmail,
  enforceOutreachBookingCta,
} from '../../../../lib/conservation-ai';
import { ensureSmsFirstTouchConfirmation } from '../../../../lib/sms-first-touch';
import { getCarrierServicePhone } from '../../../../lib/carriers';
import { ensureAgentBookingSlug, buildBrandedBookingUrl } from '../../../../lib/booking-link';
import type {
  ConservationOutreachContext,
  ConservationChannel,
} from '../../../../lib/conservation-types';
import {
  type TouchStage,
  type ConservationStatus,
  ACTIVE_RETENTION_STATUSES,
  NEXT_RETENTION_STAGE,
  RETENTION_STAGE_INTERVAL_MS,
  pickInitialRetentionStage,
  statusForRetentionDripCount,
} from '../../../../lib/conservation-types';
import { resolveClientLanguage } from '../../../../lib/client-language';
import { upsertThreadFromOutbound } from '../../../../lib/conversation-thread-registry';
import {
  isPushEligible,
  readValidPushToken,
  sendExpoPush,
} from '../../../../lib/push-permission-lifecycle';
import {
  expireActionItem,
} from '../../../../lib/action-item-store';
import {
  queueRetentionCallActionItem,
  queueRetentionTextActionItem,
} from '../../../../lib/retention-action-item-writer';

/**
 * Retention campaign cron — May 9, 2026 rewrite.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > `Channel Rules` > Lapse / Retention,
 * with Daniel's locked May 9 cadence:
 *
 *   Push-eligible:   stage_push → stage_sms → stage_call → stage_text → stage_email
 *   Not-eligible:                  stage_sms → stage_call → stage_text → stage_email
 *
 * Invariant: at most ONE Linq outbound (`stage_sms`) per campaign,
 * regardless of path. The toggle-AI-back-on mechanic and templated
 * email button were dropped May 9 (line-health discipline + reduced
 * complexity).
 *
 * Each stage advances 48h after the prior. Chain stops on
 * `lastClientReplyAt` or `status === 'saved' | 'lost'`. Stage_email
 * fires the closing email and stamps `campaignEndedAt` — the 60-day
 * quiet period gates new alert creation against the same policy from
 * `web/lib/conservation-core.ts > findRecentEndedRetentionCampaign`.
 *
 * The `LINQ_OUTBOUND_DISABLED=true` drain mode preserves campaign
 * state but marks any alert that comes due during the window with
 * `linqPausedSkippedAt` so it does not auto-replay when the kill
 * switch flips off.
 */

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

/**
 * Recipient USPS state for the TCPA quiet-hours gate. Clients created from
 * leads/imports carry `address.state` (2-letter code). Returns null when
 * absent — the quiet-hours check then falls back to a conservative
 * continental-US window.
 */
function clientStateCode(clientData: FirebaseFirestore.DocumentData): string | null {
  const addr = clientData.address as { state?: string | null } | undefined;
  const s = typeof addr?.state === 'string' ? addr.state.trim() : '';
  return s || null;
}

// ---------------------------------------------------------------------------
// Channel availability
// ---------------------------------------------------------------------------

interface ChannelAvailability {
  push: boolean;
  sms: boolean;
  email: boolean;
  pushToken: string | undefined;
  normalizedPhone: string;
  clientEmail: string;
}

function getChannelAvailability(clientData: FirebaseFirestore.DocumentData): ChannelAvailability {
  const pushToken = readValidPushToken(clientData) ?? undefined;
  const clientPhone = (clientData.phone as string) || '';
  const clientEmail = (clientData.email as string) || '';
  const normalizedPhone = normalizePhone(clientPhone);
  return {
    push: isPushEligible(clientData),
    sms: isValidE164(normalizedPhone),
    email: !!clientEmail,
    pushToken,
    normalizedPhone,
    clientEmail,
  };
}

// ---------------------------------------------------------------------------
// Stage senders
// ---------------------------------------------------------------------------

interface StageSendContext {
  agentId: string;
  agentName: string;
  agentFirstName: string;
  agentEmail: string | null;
  agentPhone: string | null;
  schedulingUrl: string | null;
  bookingSlugSource: { agentId: string; agentName: string; agencyName: string | null; existingSlug: string | null };
  bookingSlugCache: string | null;
}

async function buildBookingUrl(
  ctx: StageSendContext,
  alertData: FirebaseFirestore.DocumentData,
  stageLabel: 'initial' | 'followup_24h' | 'followup_day3' | 'followup_day7',
): Promise<string | null> {
  if (!ctx.schedulingUrl) return null;
  if (!ctx.bookingSlugCache) {
    ctx.bookingSlugCache = await ensureAgentBookingSlug(ctx.bookingSlugSource);
  }
  if (!ctx.bookingSlugCache) return null;
  void alertData;
  return buildBrandedBookingUrl({
    bookingSlug: ctx.bookingSlugCache,
    source: 'conservation',
    stage: stageLabel,
  });
}

function buildOutreachContext(
  alertData: FirebaseFirestore.DocumentData,
  clientData: FirebaseFirestore.DocumentData,
  ctx: StageSendContext,
  dripNumber: number,
): ConservationOutreachContext {
  const carrierName = (alertData.carrier as string) || '';
  const clientName = (alertData.clientName as string) || 'Client';
  return {
    clientFirstName: clientName.split(' ')[0],
    clientName,
    agentName: ctx.agentName,
    agentFirstName: ctx.agentFirstName,
    policyType: (alertData.policyType as string) || null,
    policyAge: (alertData.policyAge as number) || null,
    reason: (alertData.reason as 'lapsed_payment' | 'cancellation' | 'other') || 'other',
    schedulingUrl: ctx.schedulingUrl,
    dripNumber,
    premiumAmount: (alertData.premiumAmount as number) || null,
    coverageAmount: (alertData.coverageAmount as number) || null,
    availableChannels: (alertData.availableChannels as ConservationChannel[]) || [],
    carrier: carrierName || null,
    carrierServicePhone: getCarrierServicePhone(carrierName),
    preferredLanguage: resolveClientLanguage(alertData.preferredLanguage ?? clientData.preferredLanguage),
  };
}

interface StageSendResult {
  ok: boolean;
  channel: ConservationChannel | null;
  body: string | null;
  chatId: string | null;
}

async function sendStagePush(
  ctx: StageSendContext,
  alertData: FirebaseFirestore.DocumentData,
  clientData: FirebaseFirestore.DocumentData,
  clientId: string,
  message: string,
): Promise<StageSendResult> {
  const avail = getChannelAvailability(clientData);
  if (!avail.pushToken) return { ok: false, channel: null, body: null, chatId: null };
  const db = getAdminFirestore();
  const pushData: Record<string, unknown> = {
    type: 'conservation',
    agentId: ctx.agentId,
    clientId,
  };
  if (ctx.schedulingUrl) {
    pushData.schedulingUrl = ctx.schedulingUrl;
    pushData.includeBookingLink = true;
  }
  const outcome = await sendExpoPush(
    {
      to: avail.pushToken,
      title: `Message from ${ctx.agentName}`,
      body: message,
      sound: 'default',
      badge: 1,
      priority: 'high',
      data: pushData,
      ...(ctx.schedulingUrl ? { categoryId: 'BOOK_APPOINTMENT' } : {}),
    },
    {
      ref: db.doc(`agents/${ctx.agentId}/clients/${clientId}`),
      agentId: ctx.agentId,
      clientId,
    },
  );
  void alertData;
  return outcome.status === 'ok'
    ? { ok: true, channel: 'push', body: message, chatId: null }
    : { ok: false, channel: 'push', body: null, chatId: null };
}

async function sendStageSms(
  ctx: StageSendContext,
  alertData: FirebaseFirestore.DocumentData,
  clientData: FirebaseFirestore.DocumentData,
  message: string,
  isFirstTouch: boolean,
): Promise<StageSendResult> {
  const avail = getChannelAvailability(clientData);
  if (!avail.sms) return { ok: false, channel: null, body: null, chatId: null };
  try {
    const smsBody = isFirstTouch
      ? ensureSmsFirstTouchConfirmation(
        message,
        resolveClientLanguage(alertData.preferredLanguage ?? clientData.preferredLanguage),
      )
      : message;
    const existingChatId = (alertData.chatId as string) || null;
    const result = await sendOrCreateChat({
      to: avail.normalizedPhone,
      chatId: existingChatId,
      text: smsBody,
    });
    return { ok: true, channel: 'sms', body: smsBody, chatId: result.chatId };
  } catch (e) {
    console.error('[conservation-cron] linq sms failed', e);
    return { ok: false, channel: 'sms', body: null, chatId: null };
  }
}

async function sendStageEmail(
  ctx: StageSendContext,
  alertData: FirebaseFirestore.DocumentData,
  clientData: FirebaseFirestore.DocumentData,
): Promise<StageSendResult> {
  const avail = getChannelAvailability(clientData);
  if (!avail.email) return { ok: false, channel: null, body: null, chatId: null };
  const outreachCtx = buildOutreachContext(alertData, clientData, ctx, 4);
  let emailBody: string;
  try {
    emailBody = await generateConservationEmail({
      ...outreachCtx,
      agentEmail: ctx.agentEmail,
      agentPhone: ctx.agentPhone,
      coverageAmount: (alertData.coverageAmount as number) || null,
    });
  } catch (e) {
    console.error('[conservation-cron] email generation failed', e);
    return { ok: false, channel: 'email', body: null, chatId: null };
  }
  try {
    const resend = getResend();
    const policyType = (alertData.policyType as string) || 'insurance';
    await resend.emails.send({
      from: `${ctx.agentName} via AgentForLife™ <support@agentforlife.app>`,
      to: avail.clientEmail,
      subject: `${ctx.agentFirstName} here -- about your ${policyType} policy`,
      text: emailBody,
    });
    return { ok: true, channel: 'email', body: emailBody, chatId: null };
  } catch (e) {
    console.error('[conservation-cron] email send failed', e);
    return { ok: false, channel: 'email', body: null, chatId: null };
  }
}

// ---------------------------------------------------------------------------
// Cron handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const drainMode = process.env.LINQ_OUTBOUND_DISABLED === 'true';

  try {
    const db = getAdminFirestore();
    const now = Date.now();
    const nowIso = new Date().toISOString();

    let stage1Fired = 0;
    let stageAdvanced = 0;
    let drained = 0;
    let legacyForceEnded = 0;

    const agentsSnap = await db.collection('agents').get();

    for (const agentDoc of agentsSnap.docs) {
      const agentData = agentDoc.data();
      // Skip when automated outreach is paused for this agent — Free tier,
      // or an explicit hold (e.g. a freshly-imported, un-reviewed book).
      if (isClientOutreachPaused(agentData)) continue;
      const agentName = (agentData.name as string) || 'Your Agent';
      const agentFirstName = agentName.split(' ')[0];
      const schedulingUrl = (agentData.schedulingUrl as string) || null;
      const agentEmail = (agentData.email as string) || null;
      const agentPhone = (agentData.phoneNumber as string) || null;

      const stageCtx: StageSendContext = {
        agentId: agentDoc.id,
        agentName,
        agentFirstName,
        agentEmail,
        agentPhone,
        schedulingUrl,
        bookingSlugSource: {
          agentId: agentDoc.id,
          agentName,
          agencyName: (agentData.agencyName as string) || null,
          existingSlug: (agentData.bookingSlug as string) || null,
        },
        bookingSlugCache: (agentData.bookingSlug as string) || null,
      };

      const alertsRef = db
        .collection('agents')
        .doc(agentDoc.id)
        .collection('conservationAlerts');

      // ── A) Defensive force-end of legacy alerts ──────────────────────
      // Any alert sitting on the legacy touchStage values
      // ('initial' | 'followup_24h' | 'followup_day3' | 'followup_day7')
      // got there from the pre-May-9 cadence. Force-end them so the
      // legacy drips do not resume in the new cadence.
      const legacyStages = ['initial', 'followup_24h', 'followup_day3', 'followup_day7'];
      const legacyStageQueries = await Promise.all(
        legacyStages.map((s) =>
          alertsRef.where('touchStage', '==', s).get(),
        ),
      );
      for (const snap of legacyStageQueries) {
        for (const alertDoc of snap.docs) {
          const data = alertDoc.data();
          if (data.campaignEndedAt) continue;
          await alertDoc.ref.update({
            touchStage: null,
            status: 'drip_complete' as ConservationStatus,
            campaignEndedAt: nowIso,
            campaignEndedReason: 'legacy_cadence_force_end',
            nextTouchAt: null,
          });
          legacyForceEnded++;
          console.log('[conservation-cron] force-ended legacy alert', {
            agentId: agentDoc.id,
            alertId: alertDoc.id,
            priorTouchStage: data.touchStage,
          });
        }
      }

      // ── B) Fire scheduled initial outreach past grace period ─────────
      const scheduledSnap = await alertsRef
        .where('status', '==', 'outreach_scheduled')
        .get();

      for (const alertDoc of scheduledSnap.docs) {
        const alertData = alertDoc.data();
        if (alertData.linqPausedSkippedAt) continue;
        if (alertData.lastClientReplyAt) continue;
        const scheduledAt = alertData.scheduledOutreachAt as string | null;
        if (!scheduledAt || new Date(scheduledAt).getTime() > now) continue;

        if (drainMode) {
          await alertDoc.ref.update({
            linqPausedSkippedAt: nowIso,
            linqPausedSkippedReason: 'linq-outbound-disabled',
          });
          drained++;
          continue;
        }

        const clientId = alertData.clientId as string | null;
        if (!clientId) continue;

        // Lock against duplicate sends from manual + cron races.
        const locked = await db.runTransaction(async (tx) => {
          const latestSnap = await tx.get(alertDoc.ref);
          const latest = latestSnap.data() || {};
          const latestStatus = (latest.status as string) || '';
          const lockAt = (latest.initialSendLockAt as string | null) || null;
          const lockFresh = lockAt && Date.now() - new Date(lockAt).getTime() < 5 * 60 * 1000;
          if (latestStatus !== 'outreach_scheduled' || lockFresh) return false;
          tx.update(alertDoc.ref, { initialSendLockAt: nowIso });
          return true;
        });
        if (!locked) continue;

        const clientDoc = await db
          .collection('agents')
          .doc(agentDoc.id)
          .collection('clients')
          .doc(clientId)
          .get();
        if (!clientDoc.exists) continue;
        const clientData = clientDoc.data()!;

        const message = (alertData.initialMessage as string) || '';
        if (!message) continue;

        // Stage 1: push if push-eligible at send time, else SMS via
        // Linq. This is the single eligibility decision that locks
        // the campaign onto the 5-stage or 4-stage path.
        const pushEligible = isPushEligible(clientData);
        const stage1: TouchStage = pickInitialRetentionStage(pushEligible);

        // TCPA quiet hours: an automated first-touch SMS must not land in
        // the client's night. Push is exempt (not a telephone
        // solicitation). If the SMS path would fire outside 8am-9pm local,
        // release the lock and defer — the every-30-min cron retries and it
        // goes out at the next polite hour. Nothing is lost or advanced.
        if (stage1 === 'stage_sms' && !isWithinQuietHoursWindow(clientStateCode(clientData))) {
          await alertDoc.ref.update({ initialSendLockAt: FieldValue.delete() });
          continue;
        }

        const bookingUrl = await buildBookingUrl(stageCtx, alertData, 'initial');
        const messageWithBooking = enforceOutreachBookingCta({
          message,
          schedulingUrl,
          bookingUrl,
          dripNumber: 0,
          // Linq line-health gate: SMS first contact = no URL injection
          // (Linq deliverability rule). Push has no such constraint.
          channel: stage1 === 'stage_push' ? 'push' : 'sms',
          clientHasReplied: false,
        });

        let result: StageSendResult;
        if (stage1 === 'stage_push') {
          result = await sendStagePush(stageCtx, alertData, clientData, clientId, messageWithBooking);
        } else {
          result = await sendStageSms(stageCtx, alertData, clientData, messageWithBooking, true);
        }

        // Stage advance even if the send failed — see file header
        // comment. Push failures invalidate the token via
        // `sendExpoPush`, and the next stage (stage_sms) fires 48h
        // later regardless.
        const usedChannel: ConservationChannel = result.channel ?? (stage1 === 'stage_push' ? 'push' : 'sms');
        const sentBody = result.body ?? messageWithBooking;
        const newChatId = result.chatId;

        // Notification log (mobile push receipt or send-attempt record).
        await db
          .collection('agents')
          .doc(agentDoc.id)
          .collection('clients')
          .doc(clientId)
          .collection('notifications')
          .add({
            type: 'conservation',
            title: `Message from ${agentName}`,
            body: sentBody,
            includeBookingLink: !!schedulingUrl,
            schedulingUrl: schedulingUrl || null,
            sentAt: FieldValue.serverTimestamp(),
            readAt: null,
            status: result.ok ? 'sent' : 'failed',
          });

        const conversationEntry = {
          role: 'agent-ai' as const,
          body: sentBody,
          timestamp: nowIso,
          channels: [usedChannel],
        };

        const update: Record<string, unknown> = {
          status: 'outreach_sent' satisfies ConservationStatus,
          touchStage: stage1,
          dripCount: 1,
          lastDripAt: nowIso,
          outreachSentAt: nowIso,
          pushSentAt: stage1 === 'stage_push' ? nowIso : null,
          smsSentAt: stage1 === 'stage_sms' ? nowIso : null,
          channelsUsed: [usedChannel],
          campaignStartPushEligible: pushEligible,
          conversation: FieldValue.arrayUnion(conversationEntry),
          initialSendLockAt: FieldValue.delete(),
          nextTouchAt: new Date(now + RETENTION_STAGE_INTERVAL_MS).toISOString(),
        };
        if (newChatId) update.chatId = newChatId;
        await alertDoc.ref.update(update);

        if (newChatId) {
          await upsertThreadFromOutbound({
            db,
            agentId: agentDoc.id,
            providerThreadId: newChatId,
            providerType: 'sms_direct',
            lane: 'conservation',
            purpose: 'conservation',
            linkedEntityType: 'conservationAlert',
            linkedEntityId: alertDoc.id,
            participantPhonesE164: result.channel === 'sms' ? [getChannelAvailability(clientData).normalizedPhone] : [],
            allowAutoReply: true,
            allowedResponder: 'conservation',
          });
        }

        stage1Fired++;
      }

      // ── C) Stage advances for active campaigns ──────────────────────
      for (const status of ACTIVE_RETENTION_STATUSES) {
        const snap = await alertsRef.where('status', '==', status).get();
        for (const alertDoc of snap.docs) {
          const alertData = alertDoc.data();

          if (alertData.linqPausedSkippedAt) continue;
          if (alertData.lastClientReplyAt) continue;
          if (alertData.campaignEndedAt) continue;

          const currentStage = alertData.touchStage as TouchStage | null;
          if (!currentStage) continue;
          // Defensive: skip anything still on a legacy stage value
          // (the force-end loop above should have caught it; if a
          // race let it slip, skip rather than attempt advance).
          if (!Object.prototype.hasOwnProperty.call(NEXT_RETENTION_STAGE, currentStage) && currentStage !== 'stage_email') {
            continue;
          }

          const nextStage = NEXT_RETENTION_STAGE[currentStage];
          if (!nextStage) continue; // already at terminal stage_email

          const lastDripAt = (alertData.lastDripAt as string) || null;
          if (!lastDripAt) continue;
          const dueAt = new Date(lastDripAt).getTime() + RETENTION_STAGE_INTERVAL_MS;
          if (now < dueAt) continue;

          const clientId = alertData.clientId as string | null;
          if (!clientId) continue;

          if (drainMode && (nextStage === 'stage_sms' || nextStage === 'stage_email')) {
            // Both involve outbound (stage_sms → Linq; stage_email →
            // Resend, but the kill switch is intentionally broad
            // during a maintenance window). Drain.
            await alertDoc.ref.update({
              linqPausedSkippedAt: nowIso,
              linqPausedSkippedReason: 'linq-outbound-disabled',
            });
            drained++;
            continue;
          }

          const clientDoc = await db
            .collection('agents')
            .doc(agentDoc.id)
            .collection('clients')
            .doc(clientId)
            .get();
          if (!clientDoc.exists) continue;
          const clientData = clientDoc.data()!;

          // TCPA quiet hours: defer the single permitted stage_sms outbound
          // if it would land outside 8am-9pm in the client's local time.
          // Skip without expiring the prior item or advancing the stage —
          // the every-30-min cron retries at the next polite hour. Other
          // next-stages (call/text action items, email) are unaffected.
          if (nextStage === 'stage_sms' && !isWithinQuietHoursWindow(clientStateCode(clientData))) {
            continue;
          }

          // Expire the prior stage's action item if one is open.
          // Only stage_call and stage_text leave a pending item; the
          // expire is idempotent on already-completed items.
          const priorActionItemId = (alertData.currentActionItemId as string) || null;
          if (priorActionItemId) {
            try {
              await expireActionItem({
                db,
                agentId: agentDoc.id,
                itemId: priorActionItemId,
              });
            } catch (e) {
              console.warn('[conservation-cron] expire prior action item failed (non-blocking)', {
                agentId: agentDoc.id,
                itemId: priorActionItemId,
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }

          let nextChatId: string | null = (alertData.chatId as string) || null;
          let nextActionItemId: string | null = null;
          let logBody: string | null = null;
          let logChannel: ConservationChannel | null = null;

          if (nextStage === 'stage_sms') {
            // The single permitted Linq outbound. Generate fresh
            // copy via the existing AI helper.
            const outreachCtx = buildOutreachContext(alertData, clientData, stageCtx, 1);
            let smsMessage: string;
            try {
              smsMessage = await generateOutreachMessage(outreachCtx);
            } catch (e) {
              console.error('[conservation-cron] generate stage_sms message failed', e);
              continue;
            }
            const bookingUrl = await buildBookingUrl(stageCtx, alertData, 'followup_24h');
            const withBooking = enforceOutreachBookingCta({
              message: smsMessage,
              schedulingUrl,
              bookingUrl,
              dripNumber: 1,
              // Linq line-health gate: cold SMS first contact = no
              // URL injection. The cron only reaches stage_sms when
              // the client hasn't replied (the cron skips on
              // `lastClientReplyAt`), so this is always cold first
              // contact on the Linq line — `clientHasReplied: false`
              // is unconditional here. Once they reply, the webhook
              // handler's AI response logic owns URL inclusion based
              // on conversation context.
              channel: 'sms',
              clientHasReplied: false,
            });
            const result = await sendStageSms(stageCtx, alertData, clientData, withBooking, false);
            // Always advance — see file header comment on send failures.
            logBody = result.body ?? withBooking;
            logChannel = 'sms';
            if (result.chatId) nextChatId = result.chatId;
          } else if (nextStage === 'stage_call') {
            const queueResult = await queueRetentionCallActionItem({
              db,
              agentId: agentDoc.id,
              clientId,
              alertId: alertDoc.id,
              alertDoc: alertData,
              clientDoc: clientData,
              agentDoc: agentData,
            });
            nextActionItemId = queueResult.itemId;
          } else if (nextStage === 'stage_text') {
            const queueResult = await queueRetentionTextActionItem({
              db,
              agentId: agentDoc.id,
              clientId,
              alertId: alertDoc.id,
              alertDoc: alertData,
              clientDoc: clientData,
              agentDoc: agentData,
            });
            nextActionItemId = queueResult.itemId;
          } else if (nextStage === 'stage_email') {
            const result = await sendStageEmail(stageCtx, alertData, clientData);
            logBody = result.body;
            logChannel = 'email';
            void result;
          }

          const newDripCount = (alertData.dripCount as number ?? 1) + 1;
          const newStatus = statusForRetentionDripCount(newDripCount);

          const update: Record<string, unknown> = {
            touchStage: nextStage,
            status: newStatus,
            dripCount: newDripCount,
            lastDripAt: nowIso,
            channelsUsed: logChannel
              ? FieldValue.arrayUnion(logChannel)
              : (alertData.channelsUsed ?? []),
            currentActionItemId: nextActionItemId,
          };

          if (nextChatId && !alertData.chatId) {
            update.chatId = nextChatId;
          }

          if (logBody && logChannel) {
            update.conversation = FieldValue.arrayUnion({
              role: 'agent-ai' as const,
              body: logBody,
              timestamp: nowIso,
              channels: [logChannel],
            });
          }

          if (nextStage === 'stage_email') {
            update.campaignEndedAt = nowIso;
            update.campaignEndedReason = 'stage_email_terminal';
            update.nextTouchAt = null;
          } else {
            update.nextTouchAt = new Date(now + RETENTION_STAGE_INTERVAL_MS).toISOString();
          }

          await alertDoc.ref.update(update);

          if (nextChatId && nextStage === 'stage_sms') {
            const avail = getChannelAvailability(clientData);
            await upsertThreadFromOutbound({
              db,
              agentId: agentDoc.id,
              providerThreadId: nextChatId,
              providerType: 'sms_direct',
              lane: 'conservation',
              purpose: 'conservation',
              linkedEntityType: 'conservationAlert',
              linkedEntityId: alertDoc.id,
              participantPhonesE164: avail.sms ? [avail.normalizedPhone] : [],
              allowAutoReply: true,
              allowedResponder: 'conservation',
            });
          }

          stageAdvanced++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      mode: drainMode ? 'paused-drain' : 'normal',
      stage1Fired,
      stageAdvanced,
      drained,
      legacyForceEnded,
    });
  } catch (error) {
    console.error('[conservation-cron] handler error', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
