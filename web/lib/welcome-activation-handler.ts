import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import { ensureAgentVCardAttachment } from './agent-vcard-store';
import {
  actionItemIdempotencyKey,
  completeActionItem,
} from './action-item-store';
import { resolveClientLanguage, type SupportedLanguage } from './client-language';
import { upsertThreadFromOutbound } from './conversation-thread-registry';
import { createChat, LinqOutboundDisabledError } from './linq';
import { isValidE164 } from './phone';
import { ReactivationFenceError } from './reactivation-fence';
import {
  isWelcomeActivationPlaceholderThreadId,
  welcomeActivationPlaceholderThreadId,
} from './welcome-action-item-writer';

/**
 * Welcome-activation lane handler for the Linq inbound webhook.
 *
 * SOURCE OF TRUTH: `docs/AFL_Messaging_Operating_Model_v3.1.md` §3.3 +
 * `CONTEXT.md > Channel Rules > The two-step welcome flow`.
 *
 * The flow:
 * 1. Agent texts the client from their personal phone via the welcome
 *    action item one-tap (Commit 6 builds that UI). The text contains
 *    the app download link + login code + "tap Activate" instruction.
 * 2. Client downloads the AFL mobile app, enters the login code, lands
 *    on the in-app activation screen, and taps Activate. The Activate
 *    button uses the `sms:` URL scheme to compose a pre-filled outbound
 *    FROM the client TO the Linq line, e.g. "Hi [Agent], it's
 *    [Client] — I'm set up on the app!"
 * 3. Linq receives the inbound on the agent's pooled line. The webhook
 *    (this file's caller) detects it's a welcome activation inbound
 *    via the `welcome_pending_{clientId}` placeholder thread the
 *    Commit 2 writer pre-registered against the client's phone, then
 *    optionally verifies via clientCode regex match in the body.
 * 4. Server marks the client `clientActivatedAt`, fires
 *    `client_activated` telemetry, and sends Linq's first response
 *    back: "Hey [Client]! You're all set..." + vCard MMS attachment +
 *    thumbs-up ask. The placeholder thread is upgraded to the real
 *    Linq threadId so subsequent inbounds in the same conversation
 *    route normally (lane upgrades from `welcome_activation` to
 *    `manual` after the first round-trip — once activation succeeds
 *    the conversation is a regular 1:1 thread).
 *
 * Thumbs-up reciprocity (`docs/AFL_Messaging_Operating_Model_v3.1.md`
 * §3.4): if the client's NEXT inbound after our first response is a
 * thumbs-up, we stamp `welcomeThumbsUpReceivedAt` on the client doc.
 * That logic lives in {@link handlePostActivationInbound} below and is
 * called by the webhook for inbounds on threads matching
 * `lane === 'welcome_activation'` whose `purpose` has been upgraded to
 * `welcome_activation_response`.
 *
 * IMPORTANT: this handler is independent of `THREAD_ROUTER_ENABLED`.
 * The byPhone resolver entry is written by the Commit 2 queue route
 * regardless of the flag state, and we run the lookup BEFORE the
 * THREAD_ROUTER_ENABLED branch in the webhook.
 */

const FIRST_RESPONSE_LANG_BY_LINK: Readonly<Record<SupportedLanguage, string>> = {
  en: '',
  es: '',
};
// Copy is composed inline below; the table above is reserved for future
// localized variants of the activation reply when Spanish copy is signed
// off. Keeping the literal here avoids a trailing import path that the
// type system would otherwise flag as unused.
void FIRST_RESPONSE_LANG_BY_LINK;

function buildLinqFirstResponse(params: {
  clientFirstName: string;
  agentName: string;
  language: SupportedLanguage;
}): string {
  const firstName = params.clientFirstName || 'there';
  const agentName = params.agentName || 'your agent';
  if (params.language === 'es') {
    return (
      `Hola ${firstName}! Vamos a activarte:\n` +
      `• Mándame un thumbs up 👍 o responde "Gracias" para saber que estamos conectados\n` +
      `• Guarda mi contacto abajo\n` +
      `• Regresa a la app, ya está personalizada para ti ✅\n` +
      `Hablamos pronto!\n` +
      `— ${agentName}`
    );
  }
  return (
    `Hey ${firstName}! Let's get you activated:\n` +
    `• Send back a thumbs up 👍 or reply "Thanks" so I know we're connected\n` +
    `• Save my contact below\n` +
    `• Head back to the app, it's been personalized for you ✅\n` +
    `Talk soon!\n` +
    `— ${agentName}`
  );
}

/**
 * Conservative "we're connected" reply detector.
 *
 * Matches: thumbs-up emoji variants, "thumbs up", "thanks"/"thank you"
 * (English) and "gracias" (Spanish) — the activation reply now explicitly
 * invites "Thanks"/"Gracias" so we need to accept it, plus common
 * abbreviations (ty, thx) and the legacy ack vocabulary (yes, got it,
 * received, confirmed, +1, tu).
 */
const THUMBS_UP_REGEX = /^(?:\s*(?:👍|👍🏻|👍🏼|👍🏽|👍🏾|👍🏿|thumbs?\s*up|tu|\+1|y(es)?|got\s*it|received|confirmed|thanks?|thank\s*you|ty|thx|gracias)\s*[!.]*\s*)$/i;

export function isThumbsUpReply(text: string): boolean {
  if (!text) return false;
  return THUMBS_UP_REGEX.test(text.trim());
}

interface ResolvedWelcomeContext {
  agentId: string;
  clientId: string;
  clientPhoneE164: string;
  clientCode: string | null;
  agentData: Record<string, unknown>;
  clientData: Record<string, unknown>;
  placeholderThreadId: string;
  /** True when we matched via the byPhone resolver placeholder. */
  matchedByPlaceholder: boolean;
  /** True when the inbound body contained the client's login code (verification signal). */
  matchedByCodeInBody: boolean;
}

/**
 * Look up an active welcome-activation candidate for an inbound. Returns
 * null if no welcome action item is pending for this phone — the caller
 * should then continue to other lane handlers (referral, conservation,
 * policy_review) or fall through to lead inbox.
 *
 * The lookup runs the byPhone resolver across ALL agents (collectionGroup)
 * because we don't yet know the agent at the inbound layer. The
 * placeholder threadId convention (`welcome_pending_{clientId}`) lets us
 * filter to only welcome-activation candidates without scanning every
 * thread.
 */
export async function findWelcomeActivationCandidate(params: {
  db: FirebaseFirestore.Firestore;
  fromPhoneE164: string;
  inboundBody: string;
}): Promise<ResolvedWelcomeContext | null> {
  if (!params.fromPhoneE164 || !isValidE164(params.fromPhoneE164)) return null;

  // Phase 1 lookup — match the client's phone against any agent's
  // welcome-activation placeholder thread. We use a collectionGroup
  // query against the byPhone resolver entries.
  const phoneEntries = await params.db
    .collectionGroup('entries')
    .where('phoneE164', '==', params.fromPhoneE164)
    .limit(10)
    .get();

  let resolved: ResolvedWelcomeContext | null = null;
  for (const phoneDoc of phoneEntries.docs) {
    const data = phoneDoc.data() as { latestThreadId?: unknown; threadIdCandidates?: unknown };
    const latestThreadId = typeof data.latestThreadId === 'string' ? data.latestThreadId : '';
    const candidates = Array.isArray(data.threadIdCandidates)
      ? (data.threadIdCandidates as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    const allCandidates = [latestThreadId, ...candidates].filter(Boolean);
    const placeholder = allCandidates.find(isWelcomeActivationPlaceholderThreadId);
    if (!placeholder) continue;

    // Locate the agent owning this resolver doc.
    const segments = phoneDoc.ref.path.split('/');
    const agentIndex = segments.indexOf('agents');
    if (agentIndex < 0 || !segments[agentIndex + 1]) continue;
    const agentId = segments[agentIndex + 1];
    const clientId = placeholder.replace('welcome_pending_', '');
    if (!clientId) continue;

    const [agentSnap, clientSnap] = await Promise.all([
      params.db.collection('agents').doc(agentId).get(),
      params.db.collection('agents').doc(agentId).collection('clients').doc(clientId).get(),
    ]);
    if (!clientSnap.exists) continue;

    const agentData = (agentSnap.exists ? agentSnap.data() : {}) as Record<string, unknown>;
    const clientData = (clientSnap.data() ?? {}) as Record<string, unknown>;
    const clientCode = typeof clientData.clientCode === 'string' ? clientData.clientCode : null;

    const matchedByCodeInBody = !!clientCode && new RegExp(escapeRegex(clientCode), 'i').test(params.inboundBody);

    resolved = {
      agentId,
      clientId,
      clientPhoneE164: params.fromPhoneE164,
      clientCode,
      agentData,
      clientData,
      placeholderThreadId: placeholder,
      matchedByPlaceholder: true,
      matchedByCodeInBody,
    };
    break;
  }

  if (!resolved) return null;

  // Skip if the client doc is already activated — second inbound
  // shouldn't re-trigger the first response. The post-activation
  // handler (thumbs-up tracking) is wired separately by the webhook.
  if (resolved.clientData.clientActivatedAt) {
    return null;
  }

  return resolved;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface HandleResult {
  ok: boolean;
  outcome:
    | 'sent_first_response'
    | 'no_phone'
    | 'duplicate_skip'
    | 'first_response_failed'
    | 'first_response_suppressed_by_kill_switch'
    | 'no_vcard_attachment_using_text_only';
  realThreadId?: string;
  vcardAttached?: boolean;
}

/**
 * Process a confirmed welcome-activation inbound: stamp the client doc,
 * generate the vCard attachment (cache-hit fast path), send the
 * thumbs-up-asking first response via Linq, and upgrade the placeholder
 * conversation thread to the real Linq threadId.
 *
 * Idempotent: if `clientActivatedAt` is already set, returns
 * 'duplicate_skip'. The candidate finder above also short-circuits on
 * that field but a transactional re-check inside the handler protects
 * against concurrent webhook deliveries.
 */
export async function handleWelcomeActivationInbound(params: {
  db: FirebaseFirestore.Firestore;
  ctx: ResolvedWelcomeContext;
  realLinqChatId: string;
  inboundBody: string;
}): Promise<HandleResult> {
  const { ctx, db } = params;

  if (!isValidE164(ctx.clientPhoneE164)) {
    return { ok: false, outcome: 'no_phone' };
  }

  const clientRef = db
    .collection('agents')
    .doc(ctx.agentId)
    .collection('clients')
    .doc(ctx.clientId);

  // Atomic activation claim: only one webhook delivery wins.
  const claimResult = await db.runTransaction(async (tx) => {
    const snap = await tx.get(clientRef);
    if (!snap.exists) return { claimed: false } as const;
    const data = snap.data() as Record<string, unknown>;
    if (data.clientActivatedAt) return { claimed: false } as const;
    tx.update(clientRef, {
      clientActivatedAt: FieldValue.serverTimestamp(),
      welcomeActivationInboundAt: FieldValue.serverTimestamp(),
      welcomeActivationProviderThreadId: params.realLinqChatId,
      welcomeActivationMatchedByCodeInBody: ctx.matchedByCodeInBody,
    });
    return { claimed: true } as const;
  });

  if (!claimResult.claimed) {
    return { ok: true, outcome: 'duplicate_skip' };
  }

  const language: SupportedLanguage = resolveClientLanguage(ctx.clientData.preferredLanguage);
  const clientName =
    typeof ctx.clientData.name === 'string' ? ctx.clientData.name : '';
  const clientFirstName = clientName.split(/\s+/)[0] || '';
  const agentName = typeof ctx.agentData.name === 'string' ? ctx.agentData.name : '';

  const firstResponseBody = buildLinqFirstResponse({
    clientFirstName,
    agentName,
    language,
  });

  // Fetch (or generate) the vCard attachment id. If the agent has no
  // photo yet we still ship the vCard with name + Linq line, because
  // saving the contact is more important than the photo.
  let vcardAttachmentId: string | null = null;
  try {
    const vcardResult = await ensureAgentVCardAttachment(ctx.agentId);
    vcardAttachmentId = vcardResult.attachmentId;
  } catch (vcardErr) {
    console.error('[welcome-activation] vcard ensure failed; sending text-only first response', {
      agentId: ctx.agentId,
      clientId: ctx.clientId,
      error: vcardErr instanceof Error ? vcardErr.message : String(vcardErr),
    });
  }

  // Two failure modes for the first-response send:
  //   1. Suppressed by kill switch / fence (LinqOutboundDisabledError or
  //      ReactivationFenceError). The platform is intentionally not
  //      sending right now. The client's activation IS still real — we
  //      keep the activation stamps, mark the first-response as
  //      suppressed for forensics, and fall through to action item
  //      completion. The vCard MMS reply is the only thing that's lost.
  //   2. Genuine transient failure (network, Linq 5xx, etc.). Roll back
  //      the activation claim so a future inbound can retry the whole
  //      flow cleanly.
  //
  // Pre-amendment behavior was to roll back unconditionally, which
  // contradicted the locked Option D contract (May 7, 2026) where
  // client activation is the highest-fidelity completion signal —
  // independent of whether our own outbound reply succeeded.
  let realThreadId: string | null = null;
  let suppressedReason: string | null = null;
  try {
    const result = await createChat({
      to: ctx.clientPhoneE164,
      text: firstResponseBody,
      attachmentIds: vcardAttachmentId ? [vcardAttachmentId] : undefined,
    });
    realThreadId = result.chatId;
  } catch (sendErr) {
    const isSuppressed =
      sendErr instanceof LinqOutboundDisabledError ||
      sendErr instanceof ReactivationFenceError;
    if (isSuppressed) {
      suppressedReason = sendErr.name;
      console.warn(
        '[welcome-activation] first response suppressed; keeping activation',
        {
          agentId: ctx.agentId,
          clientId: ctx.clientId,
          reason: sendErr.name,
        },
      );
    } else {
      console.error('[welcome-activation] first response send failed', {
        agentId: ctx.agentId,
        clientId: ctx.clientId,
        error: sendErr instanceof Error ? sendErr.message : String(sendErr),
      });
      // Genuine transient failure: roll back the activation claim so a
      // future inbound can retry. We intentionally clear ONLY the fields
      // we set in the claim — this does not erase any earlier state.
      await clientRef.update({
        clientActivatedAt: FieldValue.delete(),
        welcomeActivationInboundAt: FieldValue.delete(),
        welcomeActivationProviderThreadId: FieldValue.delete(),
        welcomeActivationMatchedByCodeInBody: FieldValue.delete(),
      });
      return { ok: false, outcome: 'first_response_failed' };
    }
  }

  // Stamp the resolution markers. Different fields depending on whether
  // we actually sent a first response or were suppressed.
  const resolutionUpdate: Record<string, unknown> = {
    welcomeActivationFirstResponseAt: FieldValue.serverTimestamp(),
    welcomeActivationVCardAttached: realThreadId ? !!vcardAttachmentId : false,
  };
  if (realThreadId) {
    resolutionUpdate.welcomeActivationProviderThreadId = realThreadId;
  } else {
    resolutionUpdate.welcomeActivationFirstResponseSuppressed = true;
    resolutionUpdate.welcomeActivationFirstResponseSuppressedReason = suppressedReason;
  }
  await clientRef.update(resolutionUpdate);

  if (realThreadId) {
    // Upgrade the placeholder thread to the real Linq threadId. The
    // welcome-activation lane / response purpose lives ONLY for this
    // first round-trip; the handler for subsequent inbounds (thumbs-up
    // detection) consumes this thread, then the lane upgrades to
    // `manual` once thumbs-up is received OR after a short window.
    await upsertThreadFromOutbound({
      db,
      agentId: ctx.agentId,
      providerThreadId: realThreadId,
      providerType: 'sms_direct',
      lane: 'welcome_activation',
      purpose: 'welcome_activation_response',
      linkedEntityType: 'client',
      linkedEntityId: ctx.clientId,
      participantPhonesE164: [ctx.clientPhoneE164],
      primaryPersonId: ctx.clientId,
      allowAutoReply: true,
      allowedResponder: 'welcome_activation',
      confidence: 'high',
      assignmentSource: 'inbound_match',
    });
  }

  // Archive the placeholder so subsequent byPhone resolutions skip it
  // and route through the regular handlers. When suppressed there is
  // no real thread to upgrade to; the placeholder is still archived
  // (with `suppressedReason`) so a second inbound from this client
  // does not re-enter the activation flow as if it were the first.
  const placeholderArchive: Record<string, unknown> = {
    lifecycleStatus: 'archived',
    updatedAt: new Date().toISOString(),
  };
  if (realThreadId) {
    placeholderArchive.upgradedToProviderThreadId = realThreadId;
  } else {
    placeholderArchive.suppressedReason = suppressedReason;
  }
  await db
    .collection('agents')
    .doc(ctx.agentId)
    .collection('conversationThreads')
    .doc(ctx.placeholderThreadId)
    .set(placeholderArchive, { merge: true });

  // Auto-complete the welcome action item on client activation per
  // docs/AFL_Welcome_Flow_Amendment_2026-05-07.md Option D (May 7, 2026):
  // client activation is the highest-fidelity completion signal — when
  // the client taps Activate, we know the welcome was received and
  // acted on. Idempotent: if the agent already completed via the
  // inline compose surface's Send / Copy path, completeActionItem
  // returns { completed: false } without erroring. We also stamp the
  // firstWelcomeSent onboarding milestone (matches the /complete API
  // route's behavior on the agent-initiated path).
  try {
    const completeResult = await completeActionItem({
      db,
      agentId: ctx.agentId,
      itemId: actionItemIdempotencyKey.welcome(ctx.clientId),
      completedBy: 'system:welcome_activation',
      completionAction: 'text_personally',
      completionNote: 'Auto-completed on client activation inbound.',
    });
    if (completeResult.completed) {
      console.log('[welcome-activation] action_item_completed_on_activation', {
        agentId: ctx.agentId,
        clientId: ctx.clientId,
      });
      try {
        await db.collection('agents').doc(ctx.agentId).update({
          'onboarding.requiredMilestones.firstWelcomeSent': true,
        });
      } catch (markErr) {
        console.warn('[welcome-activation] firstWelcomeSent mark failed (non-blocking)', {
          agentId: ctx.agentId,
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
    }
  } catch (completeErr) {
    console.warn('[welcome-activation] action item complete failed (non-blocking)', {
      agentId: ctx.agentId,
      clientId: ctx.clientId,
      error: completeErr instanceof Error ? completeErr.message : String(completeErr),
    });
  }

  const wasSuppressed = realThreadId === null;
  const vcardAttached = !!vcardAttachmentId && !wasSuppressed;
  console.log('[welcome-activation] activated', {
    agentId: ctx.agentId,
    clientId: ctx.clientId,
    realThreadId,
    matchedByCodeInBody: ctx.matchedByCodeInBody,
    vcardAttached,
    suppressedReason,
  });

  let outcome: HandleResult['outcome'];
  if (wasSuppressed) {
    outcome = 'first_response_suppressed_by_kill_switch';
  } else if (vcardAttachmentId) {
    outcome = 'sent_first_response';
  } else {
    outcome = 'no_vcard_attachment_using_text_only';
  }

  return {
    ok: true,
    outcome,
    realThreadId: realThreadId ?? undefined,
    vcardAttached,
  };
}

/**
 * Post-activation inbound handler: detects a thumbs-up reply on the
 * welcome-activation thread within a reasonable window after our first
 * response. Stamps `welcomeThumbsUpReceivedAt` on the client doc and
 * upgrades the thread lane to `manual` so subsequent inbounds route
 * through the lead/manual path rather than re-running activation logic.
 *
 * Returns true if a thumbs-up was recognized; returns false otherwise
 * (the caller should fall through to whatever generic handler covers
 * the thread's lane after upgrade).
 */
export async function handlePostActivationInbound(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  clientId: string;
  inboundBody: string;
  realLinqChatId: string;
}): Promise<{ thumbsUpRecognized: boolean }> {
  if (!isThumbsUpReply(params.inboundBody)) {
    return { thumbsUpRecognized: false };
  }

  const clientRef = params.db
    .collection('agents')
    .doc(params.agentId)
    .collection('clients')
    .doc(params.clientId);

  await clientRef.update({
    welcomeThumbsUpReceivedAt: FieldValue.serverTimestamp(),
  });

  // Upgrade the conversation thread lane to `manual` so subsequent
  // inbounds don't re-run welcome-activation logic. Lane stays as a
  // real conversation under agent control.
  await upsertThreadFromOutbound({
    db: params.db,
    agentId: params.agentId,
    providerThreadId: params.realLinqChatId,
    providerType: 'sms_direct',
    lane: 'manual',
    purpose: 'manual_general',
    linkedEntityType: 'client',
    linkedEntityId: params.clientId,
    allowAutoReply: false,
    allowedResponder: 'manual_only',
    confidence: 'high',
    assignmentSource: 'inbound_match',
  });

  console.log('[welcome-activation] thumbs_up_received', {
    agentId: params.agentId,
    clientId: params.clientId,
  });

  return { thumbsUpRecognized: true };
}

/** Re-export so the webhook caller can construct the placeholder id during edge-case lookups. */
export { welcomeActivationPlaceholderThreadId };
