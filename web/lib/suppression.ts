import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import { getAdminFirestore } from './firebase-admin';
import { isValidE164, normalizePhone } from './phone';

/**
 * AFL compliance layer — opt-out suppression + consent event ledger.
 *
 * Spec: `docs/afl-compliance-layer-whatwhy.md`. This is Part 1 (F1 + F2 +
 * minimal F3): the suppression gate that all outbound goes through, plus
 * the append-only ledger that records every opt-out, resubscribe,
 * manual override, and suppressed-send-skip.
 *
 * Suppression scope is intentionally global per number across every agent
 * and lane: AFL sends all outbound on a single shared messaging line, so
 * a STOP to one agent must block every other agent's later outreach to
 * that number. Over-suppression is the correct cost of the shared-line
 * model (`Feature 1 — Opt-out suppression` in the spec).
 *
 * Identity consistency: phone numbers are normalized via `normalizePhone`
 * to E.164 before either reading or writing. The `assertNotSuppressed`
 * gate is called from the three send functions in `linq.ts` — `createChat`,
 * `sendMessage`, `sendOrCreateChat` — at the same depth as the existing
 * fence + kill-switch gates so no send path can bypass.
 *
 * For group sends (multiple recipients), if any one participant is
 * suppressed the entire send is blocked. The whole number is suppressed
 * across channels and agents; we cannot reliably deliver to "everyone
 * except the suppressed one" inside a group thread.
 *
 * Storage:
 *   /suppressed_numbers/{phoneE164}     — current suppression status
 *   /consent_events/{auto-id}           — append-only ledger
 *
 * The ledger is append-only by convention: writers in this module only
 * call `add()`, never `update()` or `delete()`. Firestore rules deny
 * client-side writes to either collection.
 */

const SUPPRESSED_NUMBERS_COLLECTION = 'suppressed_numbers' as const;
const CONSENT_EVENTS_COLLECTION = 'consent_events' as const;

/**
 * How the suppression was triggered. Stored on the suppressed_numbers
 * doc + on the consent_events ledger entry. Keep stable — analytics
 * queries downstream filter on this value.
 */
export type SuppressionTrigger =
  // F2 — webhook handler detected a standard SMS opt-out keyword.
  | 'keyword:STOP'
  | 'keyword:CANCEL'
  | 'keyword:UNSUBSCRIBE'
  | 'keyword:QUIT'
  | 'keyword:END'
  // F2 — webhook handler detected a natural-language opt-out phrase.
  | 'phrase:natural_language'
  // F3 — manual agent or admin action (currently unused; reserved for
  // an admin tool that suppresses a number outside the inbound flow).
  | 'manual';

export type ConsentEventType =
  | 'opt_out'
  | 'opt_in'
  | 'resubscribe'
  | 'override'
  | 'suppressed_skip'
  // The lawful basis for a cold lane that has no opt-in (today: the
  // conservation/retention lane, whose basis is the existing agent-client
  // business relationship). Recorded at the first cold touch so the
  // "why this contact was lawful" trail exists even absent consent.
  | 'contact_basis';

/**
 * Lane that originated the event. Reuses the conversation-thread lane
 * vocabulary loosely so downstream auditors can correlate. Free-form
 * because some triggers (webhook STOP) are pre-lane.
 */
export type ConsentLane =
  | 'inbound_webhook'
  | 'manual_send'
  | 'referral'
  | 'conservation'
  | 'policy_review'
  | 'welcome_activation'
  | 'beneficiary'
  | 'manual'
  | 'system';

export class SuppressedRecipientError extends Error {
  readonly phoneE164: string;

  constructor(phoneE164: string) {
    super(`Recipient ${phoneE164} is suppressed; refused outbound send.`);
    this.name = 'SuppressedRecipientError';
    this.phoneE164 = phoneE164;
  }
}

function suppressedRef(
  phoneE164: string,
  db: FirebaseFirestore.Firestore = getAdminFirestore(),
): FirebaseFirestore.DocumentReference {
  return db.collection(SUPPRESSED_NUMBERS_COLLECTION).doc(phoneE164);
}

function consentEventsCollection(
  db: FirebaseFirestore.Firestore = getAdminFirestore(),
): FirebaseFirestore.CollectionReference {
  return db.collection(CONSENT_EVENTS_COLLECTION);
}

/**
 * Per-process micro-cache for `isSuppressed` lookups. Keys on E.164.
 * Cleared on suppress/resubscribe writes through this module so a stale
 * "not suppressed" doesn't outlive a STOP that just arrived on a sibling
 * webhook. Default TTL is short (15s) — long enough to amortize a burst
 * of sends to the same chat, short enough that a STOP racing the burst
 * still wins within seconds.
 */
const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { isSuppressed: boolean; cachedAt: number }>();

function getCached(phoneE164: string): boolean | null {
  const entry = cache.get(phoneE164);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(phoneE164);
    return null;
  }
  return entry.isSuppressed;
}

function setCached(phoneE164: string, isSuppressed: boolean): void {
  cache.set(phoneE164, { isSuppressed, cachedAt: Date.now() });
}

function invalidateCache(phoneE164: string): void {
  cache.delete(phoneE164);
}

/**
 * Read suppression state for a single phone. Hits the per-process cache
 * first; misses go to Firestore. Returns false for malformed phones —
 * downstream send paths will fail to deliver on their own; suppression
 * is not the right layer to validate phone shape.
 */
export async function isSuppressed(rawPhone: string): Promise<boolean> {
  const phoneE164 = normalizePhone(rawPhone);
  if (!isValidE164(phoneE164)) return false;

  const cached = getCached(phoneE164);
  if (cached !== null) return cached;

  const snap = await suppressedRef(phoneE164).get();
  const isActive = snap.exists && (snap.data() as { status?: string } | undefined)?.status === 'suppressed';
  setCached(phoneE164, isActive);
  return isActive;
}

/**
 * Throws `SuppressedRecipientError` if the recipient is suppressed. Used
 * by `linq.ts` send functions to gate outbound at the same depth as
 * `assertNotBeforeFence` + `isLinqOutboundDisabled`.
 *
 * Pass either a single phone (1:1 send) or an array (group send). For
 * groups, ANY suppressed participant blocks the entire send: we cannot
 * reliably deliver to "everyone except the opted-out one" inside a
 * single iMessage group.
 *
 * Side effect on block: writes a `suppressed_skip` ledger event so the
 * audit trail captures every send the gate prevented. Fire-and-forget
 * (errors swallowed) so a ledger write failure doesn't double-fail
 * an already-blocked send.
 */
export async function assertNotSuppressed(
  to: string | string[],
  context?: {
    fn?: string;
    lane?: ConsentLane;
    agentId?: string | null;
    chatId?: string | null;
  },
): Promise<void> {
  const phones = (Array.isArray(to) ? to : [to])
    .map(normalizePhone)
    .filter((p) => isValidE164(p));
  if (phones.length === 0) return;

  for (const phoneE164 of phones) {
    if (await isSuppressed(phoneE164)) {
      void recordConsentEvent({
        type: 'suppressed_skip',
        phoneE164,
        agentId: context?.agentId ?? null,
        lane: context?.lane ?? 'system',
        raw: context?.fn ? `gate:${context.fn}` : null,
        meta: context?.chatId ? { chatId: context.chatId } : null,
      }).catch((err) => {
        console.warn('[suppression] ledger write failed (non-blocking)', {
          phoneE164,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      throw new SuppressedRecipientError(phoneE164);
    }
  }
}

/**
 * Suppress a phone and write the matching `opt_out` ledger event. Used by
 * the inbound webhook on STOP/natural-language opt-out detection.
 *
 * Idempotent: a repeat STOP from an already-suppressed number is recorded
 * in the ledger (every event is evidence) but does not error or overwrite
 * the original `suppressedAt`. Cache is invalidated so the gate picks up
 * the change immediately.
 */
export async function suppressNumber(params: {
  phoneE164: string;
  trigger: SuppressionTrigger;
  sourceLane: ConsentLane;
  sourceAgentId?: string | null;
  rawMessage?: string | null;
  chatId?: string | null;
}): Promise<{ wasAlreadySuppressed: boolean }> {
  const phoneE164 = normalizePhone(params.phoneE164);
  if (!isValidE164(phoneE164)) {
    throw new Error(`suppressNumber: invalid phone ${params.phoneE164}`);
  }

  const db = getAdminFirestore();
  const ref = suppressedRef(phoneE164, db);

  const wasAlreadySuppressed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? (snap.data() as { status?: string } | undefined) : undefined;
    const alreadyActive = existing?.status === 'suppressed';
    if (alreadyActive) {
      return true;
    }
    tx.set(
      ref,
      {
        phoneE164,
        status: 'suppressed',
        suppressedAt: FieldValue.serverTimestamp(),
        suppressedVia: params.trigger,
        sourceLane: params.sourceLane,
        sourceAgentId: params.sourceAgentId ?? null,
        rawMessage: params.rawMessage ?? null,
        reactivatedAt: null,
      },
      { merge: true },
    );
    return false;
  });

  invalidateCache(phoneE164);

  await recordConsentEvent({
    type: 'opt_out',
    phoneE164,
    agentId: params.sourceAgentId ?? null,
    lane: params.sourceLane,
    raw: params.rawMessage ?? null,
    meta: {
      trigger: params.trigger,
      ...(params.chatId ? { chatId: params.chatId } : null),
      ...(wasAlreadySuppressed ? { duplicate: true } : null),
    },
  });

  return { wasAlreadySuppressed };
}

/**
 * Resubscribe a phone (clear suppression) and write a `resubscribe`
 * ledger event. Used by the inbound webhook on START/UNSTOP/RESUME.
 *
 * Per spec, "yes" is NOT a resubscribe — that detection lives in the
 * webhook handler. This function trusts the caller already decided.
 */
export async function resubscribeNumber(params: {
  phoneE164: string;
  sourceLane: ConsentLane;
  sourceAgentId?: string | null;
  rawMessage?: string | null;
  chatId?: string | null;
}): Promise<{ wasSuppressed: boolean }> {
  const phoneE164 = normalizePhone(params.phoneE164);
  if (!isValidE164(phoneE164)) {
    throw new Error(`resubscribeNumber: invalid phone ${params.phoneE164}`);
  }

  const db = getAdminFirestore();
  const ref = suppressedRef(phoneE164, db);

  const wasSuppressed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() as { status?: string } | undefined;
    if (data?.status !== 'suppressed') return false;
    tx.update(ref, {
      status: 'reactivated',
      reactivatedAt: FieldValue.serverTimestamp(),
      reactivatedVia: params.sourceLane,
    });
    return true;
  });

  invalidateCache(phoneE164);

  await recordConsentEvent({
    type: 'resubscribe',
    phoneE164,
    agentId: params.sourceAgentId ?? null,
    lane: params.sourceLane,
    raw: params.rawMessage ?? null,
    meta: {
      ...(wasSuppressed ? null : { noopReason: 'not_currently_suppressed' }),
      ...(params.chatId ? { chatId: params.chatId } : null),
    },
  });

  return { wasSuppressed };
}

/**
 * Append-only ledger writer. Every opt-out, opt-in, resubscribe, manual
 * override, and suppressed-send-skip becomes one of these. The doc id is
 * Firestore-generated (auto-id) so writes never collide.
 *
 * Suppression callers above invoke this directly. The agent override
 * endpoint (Phase 3) writes `override` events. Part 2 of the compliance
 * layer will add the genuine `opt_in` writes at the welcome-activation
 * inbound, referral first-reply, and beneficiary first-reply moments.
 */
export async function recordConsentEvent(params: {
  type: ConsentEventType;
  phoneE164: string;
  agentId?: string | null;
  lane: ConsentLane;
  raw?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<{ eventId: string }> {
  const phoneE164 = normalizePhone(params.phoneE164);
  const db = getAdminFirestore();
  const ref = consentEventsCollection(db).doc();
  await ref.set({
    eventId: ref.id,
    type: params.type,
    phoneE164,
    agentId: params.agentId ?? null,
    lane: params.lane,
    raw: params.raw ?? null,
    meta: params.meta ?? null,
    ts: FieldValue.serverTimestamp(),
    tsIso: new Date().toISOString(),
  });
  return { eventId: ref.id };
}

/**
 * Read the latest suppression doc for a phone. Used by the agent UI
 * surfaces (client/lead detail) to render the "Opted out" chip and by
 * the manual-send modal to decide whether to require an override.
 *
 * Returns null when the phone is not in the suppression collection.
 * Returns the full doc when present (status may be `suppressed` or
 * `reactivated`).
 */
export async function getSuppressionStatus(rawPhone: string): Promise<{
  phoneE164: string;
  status: 'suppressed' | 'reactivated';
  suppressedAt: string | null;
  suppressedVia: SuppressionTrigger | null;
  sourceLane: ConsentLane | null;
  sourceAgentId: string | null;
  reactivatedAt: string | null;
} | null> {
  const phoneE164 = normalizePhone(rawPhone);
  if (!isValidE164(phoneE164)) return null;

  const snap = await suppressedRef(phoneE164).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  const status = data.status === 'reactivated' ? 'reactivated' : 'suppressed';
  return {
    phoneE164,
    status,
    suppressedAt:
      typeof data.suppressedAt === 'object' && data.suppressedAt !== null && 'toDate' in (data.suppressedAt as object)
        ? (data.suppressedAt as { toDate(): Date }).toDate().toISOString()
        : (typeof data.suppressedAt === 'string' ? data.suppressedAt : null),
    suppressedVia: (data.suppressedVia as SuppressionTrigger) ?? null,
    sourceLane: (data.sourceLane as ConsentLane) ?? null,
    sourceAgentId: (data.sourceAgentId as string) ?? null,
    reactivatedAt:
      typeof data.reactivatedAt === 'object' && data.reactivatedAt !== null && 'toDate' in (data.reactivatedAt as object)
        ? (data.reactivatedAt as { toDate(): Date }).toDate().toISOString()
        : (typeof data.reactivatedAt === 'string' ? data.reactivatedAt : null),
  };
}

/**
 * Test/dev hook: clear the in-process cache. Production code should not
 * call this — the TTL handles staleness.
 */
export function __clearSuppressionCacheForTests(): void {
  cache.clear();
}
