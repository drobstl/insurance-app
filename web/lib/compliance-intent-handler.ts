import 'server-only';

import {
  detectComplianceIntent,
  HELP_REPLY,
  OPT_OUT_CONFIRMATION_REPLY,
  RESUBSCRIBE_CONFIRMATION_REPLY,
  type ComplianceIntent,
} from './inbound-opt-out-detection';
import {
  isSuppressed,
  recordConsentEvent,
  resubscribeNumber,
  suppressNumber,
  type SuppressionTrigger,
} from './suppression';
import { sendOrCreateChat, LinqOutboundDisabledError, SuppressedRecipientError } from './linq';
import { ReactivationFenceError } from './reactivation-fence';
import {
  writeOptOutActionItems,
  writeReEngagementActionItems,
} from './compliance-action-item-writer';

/**
 * Webhook-side handler for the AFL compliance layer.
 *
 * Called at the TOP of `handleDirectMessage` and `handleGroupMessage` in
 * `web/app/api/linq/webhook/route.ts`, BEFORE any lane routing. When the
 * inbound carries a compliance intent (STOP / natural-language opt-out /
 * START / HELP), this function:
 *
 *   - writes the suppression / resubscribe state transition,
 *   - records the `consent_events` ledger entry,
 *   - sends the canonical confirmation reply (per spec — one gracious
 *     reply, never looped), and
 *   - tells the caller to short-circuit (`handled: true`).
 *
 * For an already-suppressed sender whose inbound is neither a
 * resubscribe nor HELP, the caller should NOT auto-engage the AI. That
 * branch is handled by `handleSuppressedSenderInbound` below — it
 * returns `handled: true` so lane routing is skipped, but does NOT
 * send any reply (the action-item surface in Phase 4 picks it up).
 *
 * Confirmation reply ordering: the suppression doc is written FIRST
 * (transactional, returns wasAlreadySuppressed), and only then is the
 * confirmation reply sent with `bypassSuppression: true` so the gate
 * we just installed doesn't refuse to deliver the opt-out ack to the
 * number we just suppressed. Race scenario: duplicate STOPs land
 * concurrently → suppressNumber's transaction lets only one through,
 * the other returns wasAlreadySuppressed=true and stays silent — so a
 * burst of STOPs produces exactly one confirmation reply.
 */

interface DispatchParams {
  db: FirebaseFirestore.Firestore;
  /** E.164 phone of the inbound sender. */
  phoneE164: string;
  /** Linq chat the inbound arrived on. May be a group or 1:1 chat. */
  chatId: string;
  /** Raw inbound message body (used for the ledger `raw` field). */
  rawMessage: string;
  /**
   * True when the inbound arrived on a group chat. For groups we send
   * the opt-out / resubscribe / help confirmation REPLY 1:1 to the
   * sender's own phone (creating a new chat if needed) rather than
   * into the group, so other participants don't see the ack.
   */
  isGroup: boolean;
  /**
   * Agent attribution for the ledger. May be null at the pre-routing
   * point — webhook hasn't matched the inbound to a referral / alert
   * / client yet, and the spec is fine with that (the consent event
   * still captures the lane = `inbound_webhook` and the phone).
   */
  agentId?: string | null;
}

export interface DispatchResult {
  /** True when the caller should return immediately (lane routing skipped). */
  handled: boolean;
  /** Why — for telemetry / logs. */
  reason?:
    | 'opt_out'
    | 'opt_out_duplicate'
    | 'resubscribe'
    | 'resubscribe_noop'
    | 'help'
    | 'suppressed_sender_no_intent';
  intent?: ComplianceIntent | null;
}

/**
 * Entry point — call this with the inbound's raw text. Returns
 * `{ handled: true }` when the message matched a compliance intent OR
 * the sender is currently suppressed (in which case lane routing must
 * be skipped). Caller propagates the short-circuit by `return`ing.
 */
export async function dispatchComplianceIntent(params: DispatchParams & { text: string }): Promise<DispatchResult> {
  const intent = detectComplianceIntent(params.text);

  if (intent) {
    return handleIntent({ ...params, intent });
  }

  // No compliance intent in this message. If the sender is currently
  // suppressed, do NOT auto-respond — surface as a re-engagement
  // action item for the owning agent. Per spec: "Someone changing
  // their mind in natural language is a human judgment call, not an
  // automated one." Return handled:true so the caller stops before
  // AI lane routing fires.
  if (await isSuppressed(params.phoneE164)) {
    void recordConsentEvent({
      type: 'suppressed_skip',
      phoneE164: params.phoneE164,
      agentId: params.agentId ?? null,
      lane: 'inbound_webhook',
      raw: params.rawMessage,
      meta: { reason: 'suppressed_sender_replied', chatId: params.chatId },
    }).catch(() => {});
    void writeReEngagementActionItems({
      db: params.db,
      phoneE164: params.phoneE164,
      rawMessage: params.rawMessage,
    }).catch((err) => {
      console.warn('[compliance] writeReEngagementActionItems failed (non-blocking)', {
        phoneE164: params.phoneE164,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return { handled: true, reason: 'suppressed_sender_no_intent', intent: null };
  }

  return { handled: false, intent: null };
}

async function handleIntent(params: DispatchParams & { intent: ComplianceIntent }): Promise<DispatchResult> {
  const { intent } = params;
  switch (intent.type) {
    case 'opt_out_keyword':
    case 'opt_out_natural_language':
      return handleOptOut(params, intent);
    case 'resubscribe':
      return handleResubscribe(params, intent);
    case 'help':
      return handleHelp(params, intent);
  }
}

async function handleOptOut(
  params: DispatchParams,
  intent: Extract<ComplianceIntent, { type: 'opt_out_keyword' | 'opt_out_natural_language' }>,
): Promise<DispatchResult> {
  const trigger: SuppressionTrigger =
    intent.type === 'opt_out_keyword'
      ? (`keyword:${intent.keyword}` as SuppressionTrigger)
      : 'phrase:natural_language';

  const { wasAlreadySuppressed } = await suppressNumber({
    phoneE164: params.phoneE164,
    trigger,
    sourceLane: 'inbound_webhook',
    sourceAgentId: params.agentId ?? null,
    rawMessage: params.rawMessage,
    chatId: params.chatId,
  });

  if (wasAlreadySuppressed) {
    // Duplicate STOP — silent. Per spec: "A duplicate stop doesn't
    // error or create conflicting state."
    console.log('[compliance] opt_out duplicate, no reply sent', {
      phoneE164: params.phoneE164,
      chatId: params.chatId,
    });
    return { handled: true, reason: 'opt_out_duplicate', intent };
  }

  await sendComplianceReply({
    db: params.db,
    phoneE164: params.phoneE164,
    chatId: params.chatId,
    isGroup: params.isGroup,
    body: OPT_OUT_CONFIRMATION_REPLY,
    auditTag: 'opt_out_confirmation',
  });

  // Phase 4 — surface the opt-out to the owning agent as a
  // `compliance_client_opted_out` action item if this phone matches
  // any owned client. Best-effort: writer failures are logged but do
  // not block the inbound flow (the suppression + ledger event are
  // the load-bearing artifacts).
  void writeOptOutActionItems({
    db: params.db,
    phoneE164: params.phoneE164,
    rawMessage: params.rawMessage,
    trigger: trigger,
  }).catch((err) => {
    console.warn('[compliance] writeOptOutActionItems failed (non-blocking)', {
      phoneE164: params.phoneE164,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return { handled: true, reason: 'opt_out', intent };
}

async function handleResubscribe(
  params: DispatchParams,
  intent: Extract<ComplianceIntent, { type: 'resubscribe' }>,
): Promise<DispatchResult> {
  const { wasSuppressed } = await resubscribeNumber({
    phoneE164: params.phoneE164,
    sourceLane: 'inbound_webhook',
    sourceAgentId: params.agentId ?? null,
    rawMessage: params.rawMessage,
    chatId: params.chatId,
  });

  // Per spec — resubscribe ALSO counts as a fresh opt-in for the
  // consent-record purpose. `resubscribeNumber` already wrote the
  // `resubscribe` ledger event; we write the matching `opt_in` event
  // alongside so the audit query can find consent moments by type.
  void recordConsentEvent({
    type: 'opt_in',
    phoneE164: params.phoneE164,
    agentId: params.agentId ?? null,
    lane: 'inbound_webhook',
    raw: params.rawMessage,
    meta: { source: 'resubscribe_keyword', keyword: intent.keyword, chatId: params.chatId },
  }).catch(() => {});

  await sendComplianceReply({
    db: params.db,
    phoneE164: params.phoneE164,
    chatId: params.chatId,
    isGroup: params.isGroup,
    body: RESUBSCRIBE_CONFIRMATION_REPLY,
    auditTag: 'resubscribe_confirmation',
  });

  return {
    handled: true,
    reason: wasSuppressed ? 'resubscribe' : 'resubscribe_noop',
    intent,
  };
}

async function handleHelp(
  params: DispatchParams,
  intent: Extract<ComplianceIntent, { type: 'help' }>,
): Promise<DispatchResult> {
  // HELP does NOT change suppression state, by spec. Record an event
  // so the ledger captures it, then send the canonical reply. We do
  // honor a HELP from a suppressed number — sending the help text back
  // is exactly what the carrier convention expects, and it does not
  // re-enroll the sender into anything.
  void recordConsentEvent({
    type: 'opt_in',
    phoneE164: params.phoneE164,
    agentId: params.agentId ?? null,
    lane: 'inbound_webhook',
    raw: params.rawMessage,
    meta: { source: 'help_keyword', chatId: params.chatId },
  }).catch(() => {});

  await sendComplianceReply({
    db: params.db,
    phoneE164: params.phoneE164,
    chatId: params.chatId,
    isGroup: params.isGroup,
    body: HELP_REPLY,
    auditTag: 'help_reply',
  });

  return { handled: true, reason: 'help', intent };
}

/**
 * Send one of the canonical compliance replies. For 1:1 chats, reply
 * into the same chat; for group chats, reply 1:1 to the sender so
 * other participants don't see the ack. Swallow expected outbound
 * failures (kill switch, fence, even a transient SuppressedRecipient
 * error from a sibling write that beat us) so the inbound state
 * transition is the authoritative artifact — the confirmation reply
 * is best-effort.
 */
async function sendComplianceReply(params: {
  db: FirebaseFirestore.Firestore;
  phoneE164: string;
  chatId: string;
  isGroup: boolean;
  body: string;
  auditTag: string;
}): Promise<void> {
  try {
    if (params.isGroup) {
      // 1:1 reply to the sender's own phone, not into the group.
      await sendOrCreateChat({
        to: params.phoneE164,
        text: params.body,
        suppressionLane: 'inbound_webhook',
        // The opt-out path JUST wrote a suppression doc for this
        // phone; the resubscribe / help paths address phones that may
        // or may not be suppressed. Either way, the confirmation
        // reply is the canonical ack and must NOT be re-blocked by
        // the gate it just installed (or by a pre-existing one).
        bypassSuppression: true,
      });
    } else {
      await sendOrCreateChat({
        to: params.phoneE164,
        chatId: params.chatId,
        text: params.body,
        suppressionLane: 'inbound_webhook',
        bypassSuppression: true,
      });
    }
  } catch (err) {
    if (
      err instanceof LinqOutboundDisabledError ||
      err instanceof ReactivationFenceError ||
      err instanceof SuppressedRecipientError
    ) {
      console.warn('[compliance] reply suppressed by outbound gate', {
        phoneE164: params.phoneE164,
        chatId: params.chatId,
        auditTag: params.auditTag,
        reason: err.name,
      });
      return;
    }
    console.error('[compliance] reply send failed', {
      phoneE164: params.phoneE164,
      chatId: params.chatId,
      auditTag: params.auditTag,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
