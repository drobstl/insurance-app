import 'server-only';

import {
  actionItemIdempotencyKey,
  createActionItem,
  type CreateActionItemResult,
} from './action-item-store';
import type { ActionItemDisplayContext, ActionItemTriggerReason } from './action-item-types';
import { extractFirstName } from './name-utils';
import { isValidE164, normalizePhone } from './phone';

/**
 * Anniversary lane writer for the agent action item surface.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > `Channel Rules` > `Agent action item
 * surface`. Trigger contract:
 *
 *   "Anniversary policy review | Push send fails or push is unavailable
 *    → action item created. Silent-end stays as automation's exit. The
 *    action item is the only continuation path."
 *
 * The anniversary lane is push-only-no-fallback per the May 4, 2026
 * Phase 0 hotfix (commit `ac4144d`). When a client doesn't have push
 * eligibility, the cycle ends silently. This writer creates the agent
 * action item that surfaces the unhandled anniversary so the agent can
 * text or call personally.
 *
 * Suggested actions (per `ACTION_ITEM_SUGGESTED_ACTIONS_BY_LANE`):
 * `text_personally`, `call`, `skip`. Expiration: 30 days.
 *
 * Idempotency: one action item per (client, anniversary cycle year).
 * Both initial-outreach push-fail (in `/api/cron/policy-review`) and
 * drip-stage push-fail (in `/api/cron/policy-review-drip`) call this
 * writer; subsequent calls within the same anniversary cycle are
 * no-ops because the key collides.
 */

interface ClientLikeDoc {
  name?: unknown;
  phone?: unknown;
}

interface AgentLikeDoc {
  name?: unknown;
}

function readString(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

/**
 * Build the idempotency key. One action item per client per
 * anniversary cycle year. The cycle year is derived from `now` because
 * the cron fires once per anniversary; the year stamp prevents the
 * same item from blocking next year's cycle.
 */
export function anniversaryActionItemIdempotencyKey(
  clientId: string,
  cycleYear: number,
): string {
  return `${actionItemIdempotencyKey.anniversary(clientId)}_y${cycleYear}`;
}

interface QueueAnniversaryParams {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  clientId: string;
  /** Identifier of the entity that triggered creation. Stored on the
   *  doc so the dashboard card can drill in if needed. Use the
   *  policyReview id if one exists; otherwise the policy id. */
  linkedEntityType: 'policyReview' | 'client';
  linkedEntityId: string;
  triggerReason: ActionItemTriggerReason;
  clientDoc: ClientLikeDoc;
  agentDoc: AgentLikeDoc;
  /** Optional override of the cycle year — defaults to the current
   *  year. Allows tests + replay tooling to reproduce a specific cycle. */
  cycleYear?: number;
}

export interface QueueAnniversaryResult {
  itemId: string;
  outcome: 'created' | 'skipped_no_phone' | 'skipped_already_exists';
  result?: CreateActionItemResult;
}

export async function queueAnniversaryActionItem(
  params: QueueAnniversaryParams,
): Promise<QueueAnniversaryResult> {
  const cycleYear = params.cycleYear ?? new Date().getUTCFullYear();
  const itemId = anniversaryActionItemIdempotencyKey(params.clientId, cycleYear);

  const subjectName = readString(params.clientDoc.name) || null;
  const subjectFirstName = subjectName ? extractFirstName(subjectName) : null;
  const rawPhone = readString(params.clientDoc.phone);
  const normalized = rawPhone ? normalizePhone(rawPhone) : '';
  const subjectPhoneE164 = normalized && isValidE164(normalized) ? normalized : null;
  const agentName = readString(params.agentDoc.name) || null;

  if (!subjectPhoneE164) {
    // No reachable phone for the action item's `text_personally` /
    // `call` paths — surfacing it would just clutter the queue with
    // unactionable items. Skip silently; the cron's existing
    // policyReviewSkippedReason marker still records the missed cycle.
    return { itemId, outcome: 'skipped_no_phone' };
  }

  const displayContext: ActionItemDisplayContext = {
    subjectName,
    subjectFirstName,
    subjectPhoneE164,
    subjectClientCode: null,
    welcomeMessageBody: null,
    agentName,
    preferredLanguage: null,
  };

  const result = await createActionItem({
    db: params.db,
    agentId: params.agentId,
    lane: 'anniversary',
    triggerReason: params.triggerReason,
    clientId: params.clientId,
    prospectId: null,
    linkedEntityType: params.linkedEntityType,
    linkedEntityId: params.linkedEntityId,
    displayContext,
    idempotencyKey: itemId,
  });

  return {
    itemId,
    outcome: result.created ? 'created' : 'skipped_already_exists',
    result,
  };
}
