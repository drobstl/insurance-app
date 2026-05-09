import 'server-only';

import {
  actionItemIdempotencyKey,
  createActionItem,
  type CreateActionItemResult,
} from './action-item-store';
import type { ActionItemDisplayContext } from './action-item-types';
import { extractFirstName } from './name-utils';
import { isValidE164, normalizePhone } from './phone';

/**
 * Referral lane writer for the agent action item surface.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > `Channel Rules` > `Agent action item
 * surface`. Trigger contract:
 *
 *   "Referral | AI's 24-hour follow-up bump goes unanswered (current
 *    'no further outreach' stopping point in v3.1 §4.4) | Text
 *    personally, call, skip"
 *
 * Pre-Phase-2 the referral-drip cron's stopping point is silent
 * (status flips to 'drip-complete' and the prospect drops off). With
 * this writer, when the cron sees a drip-complete referral with no
 * client reply since the last drip and the 24h cool-off has passed,
 * it surfaces an action item so the agent can text or call personally.
 *
 * Idempotent per referral. Suggested actions: text_personally, call,
 * skip. Expiration: 14 days (warm-lead window decays).
 */

interface ReferralLikeDoc {
  referralName?: unknown;
  referralPhone?: unknown;
  clientName?: unknown;
}

interface AgentLikeDoc {
  name?: unknown;
}

function readString(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

interface QueueReferralParams {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  referralId: string;
  referralDoc: ReferralLikeDoc;
  agentDoc: AgentLikeDoc;
}

export interface QueueReferralResult {
  itemId: string;
  outcome: 'created' | 'skipped_no_phone' | 'skipped_already_exists';
  result?: CreateActionItemResult;
}

export async function queueReferralActionItem(
  params: QueueReferralParams,
): Promise<QueueReferralResult> {
  const itemId = actionItemIdempotencyKey.referral(params.referralId);

  const subjectName = readString(params.referralDoc.referralName) || null;
  const subjectFirstName = subjectName ? extractFirstName(subjectName) : null;
  const rawPhone = readString(params.referralDoc.referralPhone);
  const normalized = rawPhone ? normalizePhone(rawPhone) : '';
  const subjectPhoneE164 = normalized && isValidE164(normalized) ? normalized : null;
  const agentName = readString(params.agentDoc.name) || null;

  if (!subjectPhoneE164) {
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
    lane: 'referral',
    triggerReason: 'referral_24h_followup_unanswered',
    clientId: null,
    prospectId: params.referralId,
    linkedEntityType: 'referral',
    linkedEntityId: params.referralId,
    displayContext,
    idempotencyKey: itemId,
  });

  return {
    itemId,
    outcome: result.created ? 'created' : 'skipped_already_exists',
    result,
  };
}
