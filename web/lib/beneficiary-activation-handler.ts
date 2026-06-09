import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import {
  createChat,
  LinqOutboundDisabledError,
  ReactivationFenceError,
} from './linq';
import { isValidE164 } from './phone';
import { recordConsentEvent } from './suppression';
import { upsertThreadFromOutbound } from './conversation-thread-registry';
import { ensureAgentVCardAttachment } from './agent-vcard-store';

/**
 * Beneficiary activation handler — May 10, 2026.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > `Channel Rules` > Beneficiary
 * invite mechanic. Architecturally identical to the welcome
 * activation handler, with the policyholder taking the role the
 * agent plays in the welcome flow:
 *
 * 1. Each adult beneficiary on a policy has an Invite button in the
 *    policyholder's app.
 * 2. Policyholder taps Invite → `sms:` URL pre-fills with the
 *    beneficiary's access code, sent from the policyholder's phone.
 * 3. Beneficiary downloads the app, taps Activate → `sms:` URL
 *    composes a pre-filled outbound to the Linq line.
 * 4. THIS HANDLER fires on the Linq webhook inbound: stamps
 *    `beneficiaryActivatedAt`, sends the agent's vCard MMS reply
 *    with thumbs-up ask + claim-time note, upgrades the placeholder
 *    thread to the real Linq threadId.
 *
 * Hard rule (CONTEXT.md): no cold beneficiary outreach via any
 * channel. Beneficiaries enter the AFL contact graph only via
 * policyholder-initiated invite + activation.
 *
 * Detection mechanism: `beneficiary_pending_{policyId}_{idx}`
 * placeholder threads are pre-registered against the beneficiary's
 * phone when the policyholder taps Invite (see
 * `/api/beneficiary/queue-invite`). The webhook's byPhone resolver
 * surfaces the placeholder, the inbound is recognized as a
 * beneficiary activation, and we route here BEFORE the
 * welcome-activation handler in the webhook.
 */

const BENEFICIARY_ACTIVATION_PLACEHOLDER_PREFIX = 'beneficiary_pending_' as const;

export function beneficiaryActivationPlaceholderThreadId(
  policyId: string,
  beneficiaryIndex: number,
): string {
  return `${BENEFICIARY_ACTIVATION_PLACEHOLDER_PREFIX}${policyId}_${beneficiaryIndex}`;
}

export function isBeneficiaryActivationPlaceholderThreadId(
  threadId: string,
): boolean {
  return (
    typeof threadId === 'string' &&
    threadId.startsWith(BENEFICIARY_ACTIVATION_PLACEHOLDER_PREFIX)
  );
}

interface ResolvedBeneficiaryContext {
  agentId: string;
  clientId: string;
  policyId: string;
  beneficiaryIndex: number;
  beneficiaryPhoneE164: string;
  beneficiaryName: string | null;
  policyholderName: string | null;
  policyType: string | null;
  agentData: Record<string, unknown>;
  clientData: Record<string, unknown>;
  policyData: Record<string, unknown>;
  beneficiaryDoc: Record<string, unknown>;
  placeholderThreadId: string;
}

/**
 * Lookup an active beneficiary-activation candidate for an inbound.
 * Returns null if no beneficiary invite is pending for this phone.
 *
 * Mirrors `findWelcomeActivationCandidate` in
 * `welcome-activation-handler.ts`. Runs the byPhone collectionGroup
 * resolver, filters to entries whose latest threadId is a
 * `beneficiary_pending_*` placeholder, and resolves the
 * (agent, client, policy, beneficiaryIndex) tuple.
 */
export async function findBeneficiaryActivationCandidate(params: {
  db: FirebaseFirestore.Firestore;
  fromPhoneE164: string;
}): Promise<ResolvedBeneficiaryContext | null> {
  if (!params.fromPhoneE164 || !isValidE164(params.fromPhoneE164)) return null;

  const phoneEntries = await params.db
    .collectionGroup('entries')
    .where('phoneE164', '==', params.fromPhoneE164)
    .limit(20)
    .get();

  for (const phoneDoc of phoneEntries.docs) {
    const data = phoneDoc.data() as { latestThreadId?: unknown; threadIdCandidates?: unknown };
    const latestThreadId = typeof data.latestThreadId === 'string' ? data.latestThreadId : '';
    const candidates = Array.isArray(data.threadIdCandidates)
      ? (data.threadIdCandidates as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    const allCandidates = [latestThreadId, ...candidates].filter(Boolean);
    const placeholder = allCandidates.find(isBeneficiaryActivationPlaceholderThreadId);
    if (!placeholder) continue;

    // Locate the agent owning this resolver doc.
    const segments = phoneDoc.ref.path.split('/');
    const agentIndex = segments.indexOf('agents');
    if (agentIndex < 0 || !segments[agentIndex + 1]) continue;
    const agentId = segments[agentIndex + 1];

    // Parse `beneficiary_pending_{policyId}_{idx}`. The policyId is
    // a Firestore doc id which never contains underscores _ in our
    // schema, so the last `_<digits>` segment is unambiguous.
    const remainder = placeholder.replace(BENEFICIARY_ACTIVATION_PLACEHOLDER_PREFIX, '');
    const lastUnderscore = remainder.lastIndexOf('_');
    if (lastUnderscore < 0) continue;
    const policyId = remainder.substring(0, lastUnderscore);
    const beneficiaryIndex = Number.parseInt(remainder.substring(lastUnderscore + 1), 10);
    if (!policyId || Number.isNaN(beneficiaryIndex)) continue;

    // The placeholder thread carries the clientId via linkedEntityId
    // (we set it at queue-invite time).
    const placeholderRef = params.db
      .collection('agents')
      .doc(agentId)
      .collection('conversationThreads')
      .doc(placeholder);
    const placeholderSnap = await placeholderRef.get();
    if (!placeholderSnap.exists) continue;
    const placeholderData = placeholderSnap.data() as Record<string, unknown>;
    const clientId =
      typeof placeholderData.beneficiaryClientId === 'string'
        ? placeholderData.beneficiaryClientId
        : null;
    if (!clientId) continue;

    const [agentSnap, clientSnap, policySnap] = await Promise.all([
      params.db.collection('agents').doc(agentId).get(),
      params.db.collection('agents').doc(agentId).collection('clients').doc(clientId).get(),
      params.db
        .collection('agents')
        .doc(agentId)
        .collection('clients')
        .doc(clientId)
        .collection('policies')
        .doc(policyId)
        .get(),
    ]);
    if (!policySnap.exists) continue;

    const agentData = (agentSnap.exists ? agentSnap.data() : {}) as Record<string, unknown>;
    const clientData = (clientSnap.exists ? clientSnap.data() : {}) as Record<string, unknown>;
    const policyData = (policySnap.data() ?? {}) as Record<string, unknown>;
    const beneficiaries = Array.isArray(policyData.beneficiaries)
      ? (policyData.beneficiaries as Array<Record<string, unknown>>)
      : [];
    const beneficiary = beneficiaries[beneficiaryIndex];
    if (!beneficiary) continue;

    if (beneficiary.beneficiaryActivatedAt) {
      // Already activated — second inbound shouldn't re-trigger the
      // first response. Continue to scan; not a candidate.
      continue;
    }

    const beneficiaryName =
      typeof beneficiary.name === 'string' ? beneficiary.name : null;
    const policyholderName =
      typeof clientData.name === 'string' ? clientData.name : null;
    const policyType =
      typeof policyData.policyType === 'string' ? policyData.policyType : null;

    return {
      agentId,
      clientId,
      policyId,
      beneficiaryIndex,
      beneficiaryPhoneE164: params.fromPhoneE164,
      beneficiaryName,
      policyholderName,
      policyType,
      agentData,
      clientData,
      policyData,
      beneficiaryDoc: beneficiary,
      placeholderThreadId: placeholder,
    };
  }

  return null;
}

interface BeneficiaryHandleResult {
  ok: boolean;
  outcome:
    | 'sent_first_response'
    | 'no_phone'
    | 'duplicate_skip'
    | 'first_response_failed'
    | 'first_response_suppressed_by_kill_switch'
    | 'no_vcard_attachment_using_text_only';
  realThreadId?: string;
}

/** Build the Linq vCard reply body — locked May 10, 2026 (Daniel sign-off). */
export function buildBeneficiaryFirstResponse(params: {
  beneficiaryFirstName: string;
  agentName: string;
  policyholderFirstName: string;
}): string {
  const beneFirst = params.beneficiaryFirstName?.trim() || 'there';
  const agent = params.agentName?.trim() || 'your agent';
  const phFirst = params.policyholderFirstName?.trim() || 'your loved one';
  return (
    `Hey ${beneFirst}! You're all set. I'm ${agent}, ${phFirst}'s insurance agent. `
    + `If anything ever happens to ${phFirst} that would activate the policy, you can reach me here directly — I'll work with you to handle the claim. `
    + 'Can you shoot back a thumbs up or a quick reply so I know you got this?'
  );
}

/**
 * Process a confirmed beneficiary-activation inbound. Atomically
 * stamp `beneficiaryActivatedAt` on the beneficiary entry inside
 * the policy's beneficiaries array, send the vCard MMS reply, and
 * upgrade the placeholder thread to the real Linq threadId.
 *
 * Idempotent: re-entry on already-activated beneficiary returns
 * `duplicate_skip`. Send-failure handling matches the welcome
 * handler exactly — kill-switch suppression keeps the activation
 * stamp; genuine transient errors roll the claim back so a future
 * inbound can retry.
 */
export async function handleBeneficiaryActivationInbound(params: {
  db: FirebaseFirestore.Firestore;
  ctx: ResolvedBeneficiaryContext;
  realLinqChatId: string;
}): Promise<BeneficiaryHandleResult> {
  const { ctx, db } = params;

  if (!isValidE164(ctx.beneficiaryPhoneE164)) {
    return { ok: false, outcome: 'no_phone' };
  }

  const policyRef = db
    .collection('agents')
    .doc(ctx.agentId)
    .collection('clients')
    .doc(ctx.clientId)
    .collection('policies')
    .doc(ctx.policyId);

  // Atomic activation claim — write to the indexed slot in the
  // beneficiaries array. We re-read the array, mutate the slot,
  // then write the whole array back. Concurrent webhooks for the
  // same beneficiary collide on the txn read, second one bails.
  const claimResult = await db.runTransaction(async (tx) => {
    const snap = await tx.get(policyRef);
    if (!snap.exists) return { claimed: false } as const;
    const data = snap.data() as Record<string, unknown>;
    const beneficiaries = Array.isArray(data.beneficiaries)
      ? ([...(data.beneficiaries as Array<Record<string, unknown>>)])
      : [];
    const target = beneficiaries[ctx.beneficiaryIndex];
    if (!target) return { claimed: false } as const;
    if (target.beneficiaryActivatedAt) return { claimed: false } as const;
    beneficiaries[ctx.beneficiaryIndex] = {
      ...target,
      beneficiaryActivatedAt: new Date().toISOString(),
      beneficiaryActivationProviderThreadId: params.realLinqChatId,
    };
    tx.update(policyRef, { beneficiaries });
    return { claimed: true } as const;
  });

  if (!claimResult.claimed) {
    return { ok: true, outcome: 'duplicate_skip' };
  }

  // R3 — affirmative consent record. This inbound won the atomic claim, so
  // it's the genuine first activation (never a replay). The beneficiary
  // affirmatively activated, so write the opt-in to the append-only consent
  // ledger. Best-effort: a ledger failure logs but never rolls back the
  // activation. (Mirrors the welcome-activation opt-in.)
  try {
    await recordConsentEvent({
      type: 'opt_in',
      phoneE164: ctx.beneficiaryPhoneE164,
      agentId: ctx.agentId,
      lane: 'beneficiary',
      meta: {
        source: 'beneficiary_activation',
        clientId: ctx.clientId,
        policyId: ctx.policyId,
        beneficiaryIndex: ctx.beneficiaryIndex,
        chatId: params.realLinqChatId,
      },
    });
  } catch (consentErr) {
    console.error('[beneficiary-activation] consent ledger write failed (non-blocking)', {
      agentId: ctx.agentId,
      clientId: ctx.clientId,
      policyId: ctx.policyId,
      error: consentErr instanceof Error ? consentErr.message : String(consentErr),
    });
  }

  const beneficiaryFirstName =
    (ctx.beneficiaryName ?? '').split(/\s+/)[0] || '';
  const policyholderFirstName =
    (ctx.policyholderName ?? '').split(/\s+/)[0] || '';
  const agentName =
    typeof ctx.agentData.name === 'string' ? ctx.agentData.name : '';

  const firstResponseBody = buildBeneficiaryFirstResponse({
    beneficiaryFirstName,
    agentName,
    policyholderFirstName,
  });

  // vCard attachment — same source as the welcome handler.
  let vcardAttachmentId: string | null = null;
  try {
    const vcardResult = await ensureAgentVCardAttachment(ctx.agentId);
    vcardAttachmentId = vcardResult.attachmentId;
  } catch (vcardErr) {
    console.error('[beneficiary-activation] vcard ensure failed; sending text-only first response', {
      agentId: ctx.agentId,
      clientId: ctx.clientId,
      policyId: ctx.policyId,
      beneficiaryIndex: ctx.beneficiaryIndex,
      error: vcardErr instanceof Error ? vcardErr.message : String(vcardErr),
    });
  }

  // Same dual failure mode as the welcome handler: kill-switch
  // suppression keeps the activation, transient errors roll back.
  let realThreadId: string | null = null;
  let suppressedReason: string | null = null;
  try {
    const result = await createChat({
      to: ctx.beneficiaryPhoneE164,
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
      console.warn('[beneficiary-activation] first response suppressed; keeping activation', {
        agentId: ctx.agentId,
        clientId: ctx.clientId,
        policyId: ctx.policyId,
        beneficiaryIndex: ctx.beneficiaryIndex,
        reason: sendErr.name,
      });
    } else {
      console.error('[beneficiary-activation] first response send failed', {
        agentId: ctx.agentId,
        policyId: ctx.policyId,
        beneficiaryIndex: ctx.beneficiaryIndex,
        error: sendErr instanceof Error ? sendErr.message : String(sendErr),
      });
      // Roll back the activation claim so a future inbound can retry.
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(policyRef);
        if (!snap.exists) return;
        const data = snap.data() as Record<string, unknown>;
        const beneficiaries = Array.isArray(data.beneficiaries)
          ? ([...(data.beneficiaries as Array<Record<string, unknown>>)])
          : [];
        const target = beneficiaries[ctx.beneficiaryIndex];
        if (!target) return;
        const cleaned: Record<string, unknown> = { ...target };
        delete cleaned.beneficiaryActivatedAt;
        delete cleaned.beneficiaryActivationProviderThreadId;
        beneficiaries[ctx.beneficiaryIndex] = cleaned;
        tx.update(policyRef, { beneficiaries });
      });
      return { ok: false, outcome: 'first_response_failed' };
    }
  }

  // Post-send markers, written outside the txn.
  const resolutionUpdate: Record<string, unknown> = {};
  // Stash the markers via a fresh transaction over the array.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(policyRef);
    if (!snap.exists) return;
    const data = snap.data() as Record<string, unknown>;
    const beneficiaries = Array.isArray(data.beneficiaries)
      ? ([...(data.beneficiaries as Array<Record<string, unknown>>)])
      : [];
    const target = beneficiaries[ctx.beneficiaryIndex];
    if (!target) return;
    const updated: Record<string, unknown> = {
      ...target,
      beneficiaryActivationFirstResponseAt: new Date().toISOString(),
      beneficiaryActivationVCardAttached: realThreadId
        ? !!vcardAttachmentId
        : false,
    };
    if (!realThreadId) {
      updated.beneficiaryActivationFirstResponseSuppressed = true;
      updated.beneficiaryActivationFirstResponseSuppressedReason = suppressedReason;
    }
    beneficiaries[ctx.beneficiaryIndex] = updated;
    tx.update(policyRef, { beneficiaries });
  });
  void resolutionUpdate;

  if (realThreadId) {
    await upsertThreadFromOutbound({
      db,
      agentId: ctx.agentId,
      providerThreadId: realThreadId,
      providerType: 'sms_direct',
      lane: 'beneficiary',
      purpose: 'beneficiary_manual',
      linkedEntityType: 'beneficiary',
      linkedEntityId: `${ctx.policyId}:${ctx.beneficiaryIndex}`,
      participantPhonesE164: [ctx.beneficiaryPhoneE164],
      allowAutoReply: false,
      allowedResponder: 'manual_only',
      confidence: 'high',
      assignmentSource: 'inbound_match',
    });
  }

  // Archive the placeholder so subsequent inbounds skip the
  // activation flow and route through normal lane handlers.
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

  void FieldValue; // suppress unused-import warning if FieldValue isn't used elsewhere in this file

  if (!realThreadId) {
    return { ok: true, outcome: 'first_response_suppressed_by_kill_switch' };
  }
  if (!vcardAttachmentId) {
    return { ok: true, outcome: 'no_vcard_attachment_using_text_only', realThreadId };
  }
  return { ok: true, outcome: 'sent_first_response', realThreadId };
}
