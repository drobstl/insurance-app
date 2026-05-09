import { Timestamp } from 'firebase-admin/firestore';
import type { SupportedLanguage } from './client-language';

export type ConservationReason = 'lapsed_payment' | 'cancellation' | 'other';

export type ConservationStatus =
  | 'new'
  | 'outreach_scheduled'
  | 'outreach_sent'
  | 'drip_1'
  | 'drip_2'
  | 'drip_3'
  // Stage 4 (or 5 in push-eligible path) email auto-fired; campaign ended
  // without explicit save/lost. The alert remains queryable for the
  // 60-day quiet window so re-trigger checks work, and the conversation
  // surface stays open in case the client replies later.
  | 'drip_complete'
  | 'saved'
  | 'lost';

export type ConservationSource = 'email_forward' | 'paste' | 'manual_flag';

export type ConservationChannel = 'sms' | 'push' | 'email';

/**
 * Retention campaign state machine — May 2026 rewrite.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > `Channel Rules` > Lapse / Retention.
 * Daniel's locked May 9, 2026 cadence revision (supersedes the legacy
 * 4-stage push/sms/push/sms drip):
 *
 *   Push-eligible path (5 stages):
 *     stage_push → stage_sms → stage_call → stage_text → stage_email
 *
 *   Not-eligible path (4 stages — skip stage_push):
 *     stage_sms → stage_call → stage_text → stage_email
 *
 * Invariant: at most ONE Linq outbound (`stage_sms`) per campaign,
 * regardless of path. The toggle-AI-back-on mechanic from the prior
 * spec is intentionally dropped — the agent's path forward at the gate
 * is to take the personal action (call or text), not to re-engage AI.
 *
 * Each stage advances 48h after the prior stage's send (or
 * action-item-creation time, for the agent stages). Chain stops on
 * `lastClientReplyAt` or `status === 'saved' | 'lost'`. Stage advance
 * is timer-driven: completing a call or text action item ≠ campaign
 * over; only client engagement or explicit agent resolution stops it.
 */
export type TouchStage =
  | 'stage_push'
  | 'stage_sms'
  | 'stage_call'
  | 'stage_text'
  | 'stage_email';

export const NEXT_RETENTION_STAGE: Partial<Record<TouchStage, TouchStage>> = {
  stage_push: 'stage_sms',
  stage_sms: 'stage_call',
  stage_call: 'stage_text',
  stage_text: 'stage_email',
};

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** 48h between every stage advance, per Daniel's May 9 lock. */
export const RETENTION_STAGE_INTERVAL_MS = 48 * MS_PER_HOUR;

/** 60-day quiet period after `campaignEndedAt`. New retention alerts
 *  for the same (clientId, policyNumber) are skipped within this window. */
export const RETENTION_QUIET_PERIOD_MS = 60 * MS_PER_DAY;

/**
 * The starting stage of a fresh retention campaign. Push-eligible
 * clients begin at `stage_push`; everyone else jumps straight to
 * `stage_sms` (the single permitted Linq outbound).
 */
export function pickInitialRetentionStage(pushEligible: boolean): TouchStage {
  return pushEligible ? 'stage_push' : 'stage_sms';
}

/**
 * Map the canonical `touchStage` + `dripCount` pair down to the legacy
 * `status` enum so existing dashboard / webhook queries that filter on
 * `status` continue to work without UI surgery.
 *
 * Status is "Nth touch in the campaign," not "which kind of touch":
 *   1st touch → 'outreach_sent'
 *   2nd       → 'drip_1'
 *   3rd       → 'drip_2'
 *   4th       → 'drip_3'
 *   5th (email auto-fire) → 'drip_complete'
 *
 * This means push-eligible's stage_text lands at status='drip_3' while
 * not-eligible's stage_text lands at status='drip_2'. That's correct —
 * both are "campaign still active, third or fourth automated touch
 * fired" and the dashboard already groups them in the active bucket.
 */
export function statusForRetentionDripCount(count: number): ConservationStatus {
  if (count <= 1) return 'outreach_sent';
  if (count === 2) return 'drip_1';
  if (count === 3) return 'drip_2';
  if (count === 4) return 'drip_3';
  return 'drip_complete';
}

/** Statuses that represent an active (non-terminal, non-ended) campaign. */
export const ACTIVE_RETENTION_STATUSES: ConservationStatus[] = [
  'outreach_sent',
  'drip_1',
  'drip_2',
  'drip_3',
];

// ─── Policy Review (Rewrite) Staged Outreach ────────────────────────────────

export type ReviewTouchStage =
  | 'initial'
  | 'followup_3d'
  | 'followup_7d'
  | 'followup_14d';

export type ReviewStatus =
  | 'outreach-sent'
  | 'drip-1'
  | 'drip-2'
  | 'drip-complete'
  | 'conversation-active'
  | 'booking-sent'
  | 'booked'
  | 'closed'
  | 'opted-out';

export const REVIEW_STAGE_TO_STATUS: Record<ReviewTouchStage, ReviewStatus> = {
  initial: 'outreach-sent',
  followup_3d: 'drip-1',
  followup_7d: 'drip-2',
  followup_14d: 'drip-complete',
};

export const REVIEW_STATUS_TO_STAGE: Partial<Record<ReviewStatus, ReviewTouchStage>> = {
  'outreach-sent': 'initial',
  'drip-1': 'followup_3d',
  'drip-2': 'followup_7d',
  'drip-complete': 'followup_14d',
};

export const REVIEW_STAGE_DRIP_NUMBER: Record<ReviewTouchStage, number> = {
  initial: 0,
  followup_3d: 1,
  followup_7d: 2,
  followup_14d: 3,
};

export const NEXT_REVIEW_STAGE: Partial<Record<ReviewTouchStage, ReviewTouchStage>> = {
  initial: 'followup_3d',
  followup_3d: 'followup_7d',
  followup_7d: 'followup_14d',
};

export const REVIEW_STAGE_DELAY: Record<ReviewTouchStage, number> = {
  initial: 0,
  followup_3d: 3 * MS_PER_DAY,
  followup_7d: 7 * MS_PER_DAY,
  followup_14d: 14 * MS_PER_DAY,
};

/**
 * Anniversary (policy review) outreach channels.
 *
 * ARCHITECTURAL RULE — May 4, 2026 (strategy decisions §1, §6 + CONTEXT.md
 * `Channel Rules`): Anniversary is push only, no fallback. If push is
 * unavailable for a client, the cycle ends silently for that client until
 * the next scheduled anniversary. Do NOT add `'sms'` or `'email'` to any
 * stage. Do NOT introduce a feature flag. The rule lives in the docs;
 * implementation must conform.
 *
 * If you believe a fallback is needed, surface the question against
 * `docs/AFL_Strategy_Decisions_2026-05-04.md` rather than editing this
 * constant. Holiday/birthday lanes already operate under the same rule via
 * different code paths and are not affected by changes here.
 */
export const REVIEW_STAGE_FALLBACK_ORDER: Record<ReviewTouchStage, ConservationChannel[]> = {
  initial: ['push'],
  followup_3d: ['push'],
  followup_7d: ['push'],
  followup_14d: ['push'],
};

/**
 * Anniversary email complement is disabled under the May 4, 2026 architectural
 * rule (see `REVIEW_STAGE_FALLBACK_ORDER` above). Intentionally empty — no
 * stage may add an email touch.
 */
export const REVIEW_STAGE_COMPLEMENT_EMAIL: Partial<Record<ReviewTouchStage, boolean>> = {};

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface ConservationMessage {
  role: 'client' | 'agent-ai' | 'agent-manual';
  body: string;
  timestamp: string;
  channels?: ConservationChannel[];
}

export interface ConservationAlert {
  id: string;

  source: ConservationSource;
  rawText: string;

  clientName: string;
  policyNumber: string;
  carrier: string;
  reason: ConservationReason;

  clientId: string | null;
  policyId: string | null;

  policyAge: number | null;
  isChargebackRisk: boolean;
  priority: 'high' | 'low';
  premiumAmount: number | null;
  policyType: string | null;
  clientHasApp: boolean;
  clientPolicyCount: number | null;

  status: ConservationStatus;
  scheduledOutreachAt: string | null;
  outreachSentAt: string | null;
  pushSentAt: string | null;
  smsSentAt: string | null;
  lastDripAt: string | null;
  dripCount: number;

  initialMessage: string | null;
  dripMessages: string[];
  conversation: ConservationMessage[];
  chatId: string | null;
  aiEnabled: boolean;
  availableChannels: ConservationChannel[];
  noContactMethod: boolean;
  saveSuggested: boolean;
  aiInsight: string | null;

  touchStage: TouchStage | null;
  nextTouchAt: string | null;
  channelsUsed: ConservationChannel[];
  lastClientReplyAt: string | null;

  /**
   * Retention campaign extension fields (May 9, 2026 rewrite).
   *
   * `campaignEndedAt` stamps when the campaign concludes — either by
   * stage_email auto-fire, by `saved`/`lost`, or by an in-flight
   * legacy alert force-end on lift. Drives the 60-day quiet check at
   * new alert creation time.
   *
   * `currentActionItemId` back-points to the most recent pending
   * retention action item (call or text) so the cron can expire it
   * cleanly when advancing to the next stage, and the webhook reply
   * handler can expire it when the client replies.
   *
   * `campaignStartPushEligible` snapshots push eligibility at Stage 1
   * send time. Used by the cron to know which path the campaign is on
   * (5-stage vs 4-stage) without re-deriving from later state.
   */
  campaignEndedAt: string | null;
  currentActionItemId: string | null;
  campaignStartPushEligible: boolean | null;

  notes: string | null;
  createdAt: Timestamp;
  resolvedAt: string | null;
}

export interface ExtractedConservationData {
  clientName: string;
  policyNumber: string;
  carrier: string;
  reason: ConservationReason;
  confidence: 'high' | 'medium' | 'low';
}

export interface ConservationOutreachContext {
  clientFirstName: string;
  clientName: string;
  agentName: string;
  agentFirstName: string;
  policyType: string | null;
  policyAge: number | null;
  reason: ConservationReason;
  schedulingUrl: string | null;
  dripNumber: number;
  premiumAmount: number | null;
  coverageAmount?: number | null;
  availableChannels?: ConservationChannel[];
  carrierServicePhone?: string | null;
  carrier?: string | null;
  preferredLanguage?: SupportedLanguage;
}

export interface ConservationConversationContext {
  clientFirstName: string;
  clientName: string;
  agentName: string;
  agentFirstName: string;
  policyType: string | null;
  policyAge: number | null;
  reason: ConservationReason;
  schedulingUrl: string | null;
  premiumAmount: number | null;
  coverageAmount?: number | null;
  conversation: ConservationMessage[];
  preferredLanguage?: SupportedLanguage;
}

export interface SaveSignalResult {
  saved: boolean;
  confidence: 'high' | 'medium' | 'low';
}
