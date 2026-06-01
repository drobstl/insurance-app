import 'server-only';

import {
  createActionItem,
} from './action-item-store';
import type { ActionItemDisplayContext } from './action-item-types';
import { normalizePhone, isValidE164 } from './phone';

/**
 * Compliance lane writer (AFL compliance layer Part 1, Phase 4).
 *
 * Two triggers:
 *
 *  1. `writeOptOutActionItem` — fires from the inbound webhook when a
 *     STOP / natural-language opt-out arrives from a phone that
 *     matches an owned client/lead. One action item per (agent, entity)
 *     pair; idempotency key keys on the lifecycle event so a duplicate
 *     STOP doesn't pile up cards. Lane suggested actions are `['call',
 *     'skip']` — texting is intentionally NOT surfaced (the body the
 *     agent would have texted is exactly what was just suppressed).
 *
 *  2. `writeReEngagementActionItem` — fires when an ALREADY-suppressed
 *     number sends an inbound that isn't a resubscribe keyword. Per
 *     spec: "Route it to the owning agent as a human task to decide
 *     whether to re-engage. Someone changing their mind in natural
 *     language is a human judgment call, not an automated one." One
 *     item per (agent, entity); subsequent inbounds within the
 *     pending window refresh the displayContext rather than queue
 *     duplicates.
 *
 * Entity matching: we run a collectionGroup query on `clients` keyed on
 * the sender phone. Every matched (agentId, clientId) pair gets an item
 * — on the shared line model an opt-out can be relevant to multiple
 * owning agents (rare, but possible if two agents have the same person
 * as a client).
 *
 * Cards: rendered by `web/components/ComplianceActionItemCard.tsx`. The
 * existing dashboard switch in `web/app/dashboard/action-items/page.tsx`
 * routes `lane === 'compliance'` to that card.
 */

interface ClientMatch {
  agentId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
}

/**
 * Find owned clients matching the given phone. Returns matches across
 * every agent (collectionGroup query); on the shared-line model an
 * opt-out is relevant to every agent who has this person as a client.
 *
 * Phone normalization on stored values is best-effort — older client
 * docs may not be E.164 — so we query on the original phone string
 * shape AND the normalized E.164 form, dedupe by (agentId, clientId).
 */
export async function findClientMatchesForPhone(params: {
  db: FirebaseFirestore.Firestore;
  rawPhone: string;
}): Promise<ClientMatch[]> {
  const normalized = normalizePhone(params.rawPhone);
  if (!isValidE164(normalized)) return [];

  const seen = new Set<string>();
  const matches: ClientMatch[] = [];

  const queryShapes = Array.from(new Set([normalized, params.rawPhone].filter(Boolean)));
  for (const phoneShape of queryShapes) {
    let snap: FirebaseFirestore.QuerySnapshot;
    try {
      snap = await params.db
        .collectionGroup('clients')
        .where('phone', '==', phoneShape)
        .limit(10)
        .get();
    } catch (err) {
      console.warn('[compliance-writer] client lookup failed (non-blocking)', {
        phoneShape,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    for (const doc of snap.docs) {
      const agentId = doc.ref.parent.parent?.id;
      if (!agentId) continue;
      const key = `${agentId}/${doc.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const data = doc.data() as { name?: unknown; phone?: unknown };
      matches.push({
        agentId,
        clientId: doc.id,
        clientName: typeof data.name === 'string' ? data.name : '',
        clientPhone: typeof data.phone === 'string' ? data.phone : normalized,
      });
    }
  }
  return matches;
}

function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, Math.max(0, maxChars - 1))}…`;
}

interface OptOutCardParams {
  db: FirebaseFirestore.Firestore;
  phoneE164: string;
  /** The exact inbound text — surfaced on the card and recorded for audit. */
  rawMessage: string;
  /** "keyword:STOP" / "phrase:natural_language" etc. — for telemetry only. */
  trigger: string;
}

/**
 * Write a `compliance_client_opted_out` action item for every owned
 * client that matches the sender's phone. Idempotent on the
 * `compliance_opt_out_{clientId}` key — the same opt-out event only
 * ever creates one card per agent/client. A second opt-out after a
 * resubscribe will collide with the previous (completed) doc; that's
 * intentional — the lifecycle event is the first opt-out, not the
 * second.
 */
export async function writeOptOutActionItems(params: OptOutCardParams): Promise<{
  matchesFound: number;
  itemsCreated: number;
}> {
  const matches = await findClientMatchesForPhone({
    db: params.db,
    rawPhone: params.phoneE164,
  });

  if (matches.length === 0) {
    return { matchesFound: 0, itemsCreated: 0 };
  }

  let itemsCreated = 0;
  for (const match of matches) {
    const displayContext = buildDisplayContext(match, params.rawMessage);
    const idempotencyKey = `compliance_opt_out_${match.clientId}`;
    try {
      const result = await createActionItem({
        db: params.db,
        agentId: match.agentId,
        lane: 'compliance',
        triggerReason: 'compliance_client_opted_out',
        clientId: match.clientId,
        prospectId: null,
        linkedEntityType: 'client',
        linkedEntityId: match.clientId,
        displayContext,
        idempotencyKey,
      });
      if (result.created) {
        itemsCreated += 1;
        console.log('[compliance-writer] opt_out_item_created', {
          agentId: match.agentId,
          clientId: match.clientId,
          trigger: params.trigger,
        });
      }
    } catch (err) {
      console.warn('[compliance-writer] opt_out_item_failed (non-blocking)', {
        agentId: match.agentId,
        clientId: match.clientId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { matchesFound: matches.length, itemsCreated };
}

interface ReEngagementParams {
  db: FirebaseFirestore.Firestore;
  phoneE164: string;
  rawMessage: string;
}

/**
 * Write a `compliance_re_engagement_attempt` action item for every
 * owned client matching this phone. Idempotency key includes the day,
 * so multiple "I'm thinking it over" messages on the same day collapse
 * into one card but a fresh attempt the next day creates a new one
 * (the agent likely wants the up-to-date message in front of them).
 */
export async function writeReEngagementActionItems(params: ReEngagementParams): Promise<{
  matchesFound: number;
  itemsCreated: number;
}> {
  const matches = await findClientMatchesForPhone({
    db: params.db,
    rawPhone: params.phoneE164,
  });

  if (matches.length === 0) {
    return { matchesFound: 0, itemsCreated: 0 };
  }

  const today = new Date().toISOString().slice(0, 10);
  let itemsCreated = 0;
  for (const match of matches) {
    const displayContext = buildDisplayContext(match, params.rawMessage);
    const idempotencyKey = `compliance_re_engagement_${match.clientId}_${today}`;
    try {
      const result = await createActionItem({
        db: params.db,
        agentId: match.agentId,
        lane: 'compliance',
        triggerReason: 'compliance_re_engagement_attempt',
        clientId: match.clientId,
        prospectId: null,
        linkedEntityType: 'client',
        linkedEntityId: match.clientId,
        displayContext,
        idempotencyKey,
      });
      if (result.created) {
        itemsCreated += 1;
        console.log('[compliance-writer] re_engagement_item_created', {
          agentId: match.agentId,
          clientId: match.clientId,
        });
      }
    } catch (err) {
      console.warn('[compliance-writer] re_engagement_item_failed (non-blocking)', {
        agentId: match.agentId,
        clientId: match.clientId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { matchesFound: matches.length, itemsCreated };
}

function buildDisplayContext(match: ClientMatch, rawMessage: string): ActionItemDisplayContext {
  const fullName = (match.clientName || '').trim();
  const subjectFirstName = fullName.split(' ')[0] || null;
  return {
    subjectName: fullName || null,
    subjectFirstName,
    subjectPhoneE164: match.clientPhone,
    prefilledSmsBody: null,
    welcomeMessageBody: null,
    agentName: null,
    preferredLanguage: null,
    appointmentScheduledAt: null,
    appointmentScheduledTzShort: null,
    inboundExcerpt: rawMessage ? truncate(rawMessage, 280) : null,
  };
}
