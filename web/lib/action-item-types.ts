/**
 * Agent action item surface — type definitions.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > `Channel Rules` > `Agent action item
 * surface`. The schema below is forward-compatible across all four lanes
 * (welcome / anniversary / retention / referral). Phase 1 Track B writes
 * ONLY welcome entries. Phase 2 adds the anniversary, retention, and
 * referral writers against this same shape — do not break the contract
 * without coordinating with that work.
 *
 * Where a lane diverges (suggested actions, expiration window, completion
 * action vocabulary), keep the divergence in the per-lane lookup tables
 * below rather than in branching code at every call site.
 */
export type ActionItemLane = 'welcome' | 'anniversary' | 'retention' | 'referral';

/**
 * Why this action item was created. Phase 1 only emits `welcome_pending`;
 * Phase 2 writers (anniversary, retention, referral) add the rest. Listed
 * up front so the analytics-events registry can reference them by literal
 * type without waiting for Phase 2 code to land.
 */
export type ActionItemTriggerReason =
  // Welcome lane (Phase 1 Track B)
  | 'welcome_pending'
  // Anniversary lane (Phase 2 — placeholder)
  | 'anniversary_push_unavailable'
  | 'anniversary_push_revoked'
  | 'anniversary_push_send_failed'
  // Retention lane (Phase 2 — placeholder)
  | 'retention_first_sms_unanswered_48h'
  | 'retention_first_sms_unresolved_5d'
  // Referral lane (Phase 2 — placeholder)
  | 'referral_24h_followup_unanswered';

/**
 * Concrete actions an agent can take from an action item card. Each lane
 * exposes a subset (see {@link ACTION_ITEM_SUGGESTED_ACTIONS_BY_LANE}).
 *
 * - `text_personally` — opens an `sms:` URL with a pre-filled body from the
 *   agent's personal phone. Universal across lanes.
 * - `call` — opens a `tel:` URL on the agent's phone.
 * - `send_templated_email` — fires a server-side templated email
 *   (retention only; not a one-tap surface in Phase 1).
 * - `toggle_ai_back_on` — re-enables AI on the linked entity (retention
 *   only; lets automated chain resume per the Phase 2 retention spec).
 * - `skip` — explicitly closes the item without taking action. NOT
 *   surfaced for the welcome lane per the locked Phase 1 Q2 decision
 *   ("agents must send all welcomes; no skip, no dismiss").
 */
export type ActionItemSuggestedAction =
  | 'text_personally'
  | 'call'
  | 'send_templated_email'
  | 'toggle_ai_back_on'
  | 'skip';

export type ActionItemStatus = 'pending' | 'completed' | 'expired';

/**
 * What ultimately closed the item. `expired_unhandled` is server-set by
 * the expiration cron when the lane's expiration window elapses with no
 * agent action; everything else is agent-initiated.
 */
export type ActionItemCompletionAction =
  | ActionItemSuggestedAction
  | 'expired_unhandled';

/**
 * Per-lane expiration windows in days. Source: CONTEXT.md > Channel Rules
 * > Agent action item surface > Implementation contract.
 *
 * Welcome 30d is locked by the May 5, 2026 Daniel decision — a welcome
 * sent 30+ days after signup is worse than no welcome (signals "this agent
 * forgot about me"). Treat the value as protective, not just hygiene.
 */
export const ACTION_ITEM_EXPIRATION_DAYS: Readonly<Record<ActionItemLane, number>> = {
  welcome: 30,
  anniversary: 30,
  retention: 7,
  referral: 14,
};

/**
 * Per-lane action vocabulary. Welcome intentionally omits `skip` per the
 * locked Phase 1 Q2 decision — surfacing skip would violate the "agents
 * must send all welcomes" contract.
 */
export const ACTION_ITEM_SUGGESTED_ACTIONS_BY_LANE: Readonly<
  Record<ActionItemLane, readonly ActionItemSuggestedAction[]>
> = {
  welcome: ['text_personally'],
  anniversary: ['text_personally', 'call', 'skip'],
  retention: ['text_personally', 'call', 'send_templated_email', 'toggle_ai_back_on', 'skip'],
  referral: ['text_personally', 'call', 'skip'],
};

/**
 * Snapshot of subject identity at action item creation time. Welcome
 * lane refreshes this in place when the agent edits the underlying client
 * profile (Daniel's locked Q1 answer). Other lanes may opt out of the
 * refresh behavior depending on their semantics; see the Phase 2 writers
 * when they land.
 *
 * `subjectClientCode` and `welcomeMessageBody` are welcome-specific (the
 * `sms:` URL needs both); keep them optional so anniversary/retention/
 * referral writers don't have to populate them.
 */
export interface ActionItemDisplayContext {
  subjectName: string | null;
  subjectFirstName: string | null;
  subjectPhoneE164: string | null;
  subjectClientCode?: string | null;
  /** Pre-filled SMS body for the `sms:` URL on `text_personally`. */
  welcomeMessageBody?: string | null;
  /** Agent's display name at creation time (for the welcome message body). */
  agentName?: string | null;
  /** Preferred language for the subject — drives Spanish welcome copy. */
  preferredLanguage?: 'en' | 'es' | null;
}

export type ActionItemLinkedEntityType =
  | 'client'
  | 'prospect'
  | 'policyReview'
  | 'conservationAlert'
  | 'referral';

export interface ActionItemDoc {
  itemId: string;
  agentId: string;
  lane: ActionItemLane;
  triggerReason: ActionItemTriggerReason;
  status: ActionItemStatus;

  /**
   * Subject identifiers. For Phase 1 welcome, `clientId` is always set and
   * `prospectId` is null. Phase 2 referral writes can populate
   * `prospectId` instead. Forward-compat: keep both fields, mark the
   * unused one null.
   */
  clientId: string | null;
  prospectId: string | null;

  /**
   * Strongly-typed pointer to whatever entity the item was created from.
   * Phase 1 welcome uses 'client' + the same id as `clientId`. Phase 2
   * lanes use 'policyReview', 'conservationAlert', or 'referral'.
   */
  linkedEntityType: ActionItemLinkedEntityType;
  linkedEntityId: string;

  displayContext: ActionItemDisplayContext;
  suggestedActions: readonly ActionItemSuggestedAction[];

  /** ISO timestamps. createdAt is ALSO a Firestore server-timestamp on write. */
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  completedBy: string | null;
  completionAction: ActionItemCompletionAction | null;
  completionNote: string | null;

  /** Read telemetry — drives the welcome funnel funnel and the dashboard age affordances. */
  viewCount: number;
  firstViewedAt: string | null;
  lastViewedAt: string | null;

  /**
   * Schema version. Bump on incompatible structural changes; readers that
   * don't recognize the version should treat the doc as unknown rather
   * than mis-render. Phase 2 writers MUST start at 1 unless they
   * explicitly need a structural change.
   */
  schemaVersion: 1;
}

/** Resolves the expiration timestamp for a given lane and creation moment. */
export function computeActionItemExpiresAt(lane: ActionItemLane, createdAt: Date): Date {
  const days = ACTION_ITEM_EXPIRATION_DAYS[lane];
  const expires = new Date(createdAt.getTime());
  expires.setUTCDate(expires.getUTCDate() + days);
  return expires;
}

/** True iff the action item has expired as of the given reference time (defaults to now). */
export function isActionItemExpired(item: Pick<ActionItemDoc, 'expiresAt' | 'status'>, now: Date = new Date()): boolean {
  if (item.status !== 'pending') return false;
  const expiresMs = Date.parse(item.expiresAt);
  if (Number.isNaN(expiresMs)) return false;
  return expiresMs <= now.getTime();
}
