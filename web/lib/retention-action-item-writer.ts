import 'server-only';

import {
  actionItemIdempotencyKey,
  createActionItem,
  type CreateActionItemResult,
} from './action-item-store';
import type {
  ActionItemDisplayContext,
  ActionItemTriggerReason,
} from './action-item-types';
import { extractFirstName } from './name-utils';
import { isValidE164, normalizePhone } from './phone';

/**
 * Retention lane writers for the agent action item surface.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > `Channel Rules` > Lapse / Retention,
 * with the May 9, 2026 cadence rewrite locked by Daniel:
 *
 *   Push-eligible:   stage_push → stage_sms → stage_call → stage_text → stage_email
 *   Not-eligible:                  stage_sms → stage_call → stage_text → stage_email
 *
 * Two writers — one per agent-facing stage:
 *
 *   - {@link queueRetentionCallActionItem}: invoked when the cron
 *     advances into `stage_call`. Surfaces a card with one big
 *     `📞 Call` CTA (tel: link) plus a small `Skip`.
 *
 *   - {@link queueRetentionTextActionItem}: invoked when the cron
 *     advances into `stage_text`. Surfaces a card with one big
 *     `💬 Text personally` CTA that opens an `sms:` URL with a
 *     STATIC pre-filled body (per Daniel's call — not
 *     settings-customizable). Same Send/Copy/QR pattern as the
 *     welcome card.
 *
 * Both writers are idempotent per (alertId, stage). The previous
 * stage's item is expired by the cron at advance time via
 * `expireActionItem` — these writers do NOT chain.
 *
 * The toggle-AI-back-on and templated-email actions from the prior
 * spec were dropped May 9 — both removed from
 * `ACTION_ITEM_SUGGESTED_ACTIONS_BY_LANE.retention`.
 */

interface AlertLikeDoc {
  clientName?: unknown;
  policyType?: unknown;
}

interface ClientLikeDoc {
  name?: unknown;
  phone?: unknown;
  preferredLanguage?: unknown;
}

interface AgentLikeDoc {
  name?: unknown;
}

function readString(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

function readLanguage(raw: unknown): 'en' | 'es' | null {
  if (raw === 'es') return 'es';
  if (raw === 'en') return 'en';
  return null;
}

/**
 * Static SMS body for the Stage 3 (push-eligible: Stage 4) text card.
 * Sent from the agent's personal phone via `sms:` URL — no Linq
 * involvement, no booking link, no AI generation. Personal warmth
 * vibe. Daniel signs off in code review.
 */
export function buildRetentionTextSmsBody(params: {
  clientFirstName: string | null;
  agentFirstName: string | null;
  policyType: string | null;
}): string {
  const first = params.clientFirstName?.trim() || 'there';
  const agent = params.agentFirstName?.trim() || 'me';
  const product = params.policyType?.trim() || 'policy';
  return (
    `Hey ${first}, it's ${agent}. I noticed your ${product} needs some attention `
    + 'and wanted to reach out personally. Got a minute to chat? Happy to '
    + 'work through whatever’s going on.'
  );
}

interface CommonQueueParams {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  clientId: string;
  alertId: string;
  alertDoc: AlertLikeDoc;
  clientDoc: ClientLikeDoc;
  agentDoc: AgentLikeDoc;
}

export interface QueueRetentionResult {
  itemId: string;
  outcome: 'created' | 'skipped_no_phone' | 'skipped_already_exists';
  result?: CreateActionItemResult;
}

function buildBaseDisplayContext(params: CommonQueueParams): {
  subjectName: string | null;
  subjectFirstName: string | null;
  subjectPhoneE164: string | null;
  agentName: string | null;
  agentFirstName: string | null;
  preferredLanguage: 'en' | 'es' | null;
  policyType: string | null;
} {
  const subjectName =
    readString(params.clientDoc.name) ||
    readString(params.alertDoc.clientName) ||
    null;
  const subjectFirstName = subjectName ? extractFirstName(subjectName) : null;

  const rawPhone = readString(params.clientDoc.phone);
  const normalized = rawPhone ? normalizePhone(rawPhone) : '';
  const subjectPhoneE164 = normalized && isValidE164(normalized) ? normalized : null;

  const agentName = readString(params.agentDoc.name) || null;
  const agentFirstName = agentName ? extractFirstName(agentName) : null;

  const preferredLanguage = readLanguage(params.clientDoc.preferredLanguage);
  const policyType = readString(params.alertDoc.policyType) || null;

  return {
    subjectName,
    subjectFirstName,
    subjectPhoneE164,
    agentName,
    agentFirstName,
    preferredLanguage,
    policyType,
  };
}

/**
 * Stage `stage_call` — surfaces a "📞 Call from your personal phone"
 * card. No pre-filled SMS body (the card opens `tel:`, not `sms:`),
 * but `subjectPhoneE164` is required for the tel link to work, so
 * we skip when the client has no usable phone.
 */
export async function queueRetentionCallActionItem(
  params: CommonQueueParams,
): Promise<QueueRetentionResult> {
  const itemId = actionItemIdempotencyKey.retentionCall(params.alertId);
  const base = buildBaseDisplayContext(params);

  if (!base.subjectPhoneE164) {
    return { itemId, outcome: 'skipped_no_phone' };
  }

  const displayContext: ActionItemDisplayContext = {
    subjectName: base.subjectName,
    subjectFirstName: base.subjectFirstName,
    subjectPhoneE164: base.subjectPhoneE164,
    subjectClientCode: null,
    prefilledSmsBody: null,
    agentName: base.agentName,
    preferredLanguage: base.preferredLanguage,
  };

  const triggerReason: ActionItemTriggerReason = 'retention_first_sms_unanswered_48h';

  const result = await createActionItem({
    db: params.db,
    agentId: params.agentId,
    lane: 'retention',
    triggerReason,
    clientId: params.clientId,
    prospectId: null,
    linkedEntityType: 'conservationAlert',
    linkedEntityId: params.alertId,
    displayContext,
    idempotencyKey: itemId,
  });

  return {
    itemId,
    outcome: result.created ? 'created' : 'skipped_already_exists',
    result,
  };
}

/**
 * Stage `stage_text` — surfaces a "💬 Text personally" card with a
 * static pre-filled body. Same Send/Copy/QR pattern the welcome card
 * uses on desktop + mobile.
 */
export async function queueRetentionTextActionItem(
  params: CommonQueueParams,
): Promise<QueueRetentionResult> {
  const itemId = actionItemIdempotencyKey.retentionText(params.alertId);
  const base = buildBaseDisplayContext(params);

  if (!base.subjectPhoneE164) {
    return { itemId, outcome: 'skipped_no_phone' };
  }

  const prefilledSmsBody = buildRetentionTextSmsBody({
    clientFirstName: base.subjectFirstName,
    agentFirstName: base.agentFirstName,
    policyType: base.policyType,
  });

  const displayContext: ActionItemDisplayContext = {
    subjectName: base.subjectName,
    subjectFirstName: base.subjectFirstName,
    subjectPhoneE164: base.subjectPhoneE164,
    subjectClientCode: null,
    prefilledSmsBody,
    agentName: base.agentName,
    preferredLanguage: base.preferredLanguage,
  };

  // Pick the trigger reason based on which gate condition fires
  // first. The cron passes through whichever it computed; the writer
  // doesn't try to re-derive it.
  const triggerReason: ActionItemTriggerReason = 'retention_first_sms_unresolved_5d';

  const result = await createActionItem({
    db: params.db,
    agentId: params.agentId,
    lane: 'retention',
    triggerReason,
    clientId: params.clientId,
    prospectId: null,
    linkedEntityType: 'conservationAlert',
    linkedEntityId: params.alertId,
    displayContext,
    idempotencyKey: itemId,
  });

  return {
    itemId,
    outcome: result.created ? 'created' : 'skipped_already_exists',
    result,
  };
}
