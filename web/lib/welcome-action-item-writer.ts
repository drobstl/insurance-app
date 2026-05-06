import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import {
  actionItemIdempotencyKey,
  createActionItem,
  getActionItemByKey,
  refreshActionItemDisplayContext,
  type CreateActionItemResult,
} from './action-item-store';
import type { ActionItemDisplayContext } from './action-item-types';
import { buildWelcomeMessage, resolveClientLanguage, type SupportedLanguage } from './client-language';
import { isValidE164, normalizePhone } from './phone';

/**
 * Welcome lane writer for the agent action item surface.
 *
 * Phase 1 Track B (welcome flow). The trigger contract is locked by Daniel
 * (May 5, 2026 morning):
 *
 *   "A welcome action item is queued at the moment the agent confirms PDF
 *    extraction and creates the client profile. NOT at PDF auto-extract
 *    completion. The 'create profile' UI action is the trigger.... If the
 *    agent edits the client profile after creation in a way that changes
 *    name or code, the welcome action item updates in place (it does not
 *    duplicate or regenerate)."
 *
 * Two callers exist:
 * - {@link queueOrRefreshWelcomeActionItem} from
 *   /api/agent/action-items/welcome/queue, called from the dashboard
 *   right after `createClientFromAddFlow` resolves AND from
 *   `handleInlineUpdateClient` so a name/code edit refreshes the
 *   displayContext in place.
 * - The expiration cron does NOT live here — see
 *   /api/cron/welcome-action-item-expiry. Lane-agnostic by design so
 *   Phase 2 lanes get the same hygiene for free.
 *
 * Forward-compat note: the schema is shared across welcome / anniversary
 * / retention / referral lanes (see `web/lib/action-item-types.ts`).
 * Phase 2 will add anniversary/retention/referral writers — they should
 * NOT extend this file; build a sibling `<lane>-action-item-writer.ts`
 * instead so the per-lane invariants stay localized.
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app').replace(/\/$/, '');
const APP_DOWNLOAD_URL = `${APP_URL}/app`;

interface ClientLikeDoc {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  clientCode?: unknown;
  preferredLanguage?: unknown;
}

interface AgentLikeDoc {
  name?: unknown;
  email?: unknown;
}

function readString(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

function firstNameFrom(fullName: string): string {
  return fullName.split(/\s+/)[0]?.trim() || '';
}

/**
 * Build the welcome SMS body the agent will send from their personal
 * phone via the `sms:` URL scheme. Contains app download link, login
 * code, and the locked instruction copy from `docs/AFL_Messaging_Operating_Model_v3.1.md` §3.3.
 *
 * Spanish copy reuses `buildWelcomeMessage` from web/lib/client-language.ts;
 * English copy mirrors v3.1 §3.3's recommended template (slightly tightened
 * for the SMS one-tap context — the locked Phase 1 message is "Open it
 * up and tap Activate so we're all connected — and turn on notifications
 * so I can reach you when it matters.").
 */
export function buildPhase1WelcomeBody(params: {
  clientFirstName: string;
  agentName: string;
  clientCode: string;
  language: SupportedLanguage;
}): string {
  if (params.language === 'es') {
    // Reuse existing Spanish welcome composer for translation parity with
    // the legacy welcome path until a Phase 1 Spanish copy is signed off.
    return buildWelcomeMessage({
      firstName: params.clientFirstName,
      agentName: params.agentName,
      code: params.clientCode,
      appUrl: APP_DOWNLOAD_URL,
      language: 'es',
    });
  }
  const firstName = params.clientFirstName || 'there';
  const agentName = params.agentName || 'your agent';
  return (
    `Hey ${firstName}! ${agentName} here. Welcome to the family. ` +
    `Download the app: ${APP_DOWNLOAD_URL} ` +
    `Code: ${params.clientCode}. ` +
    `Open it up and tap Activate so we're all connected — and turn on notifications so I can reach you when it matters.`
  );
}

/**
 * Build the displayContext snapshot an action item carries. Pure function
 * over (client doc, agent doc) so refresh-in-place can re-derive without
 * touching the persisted item's lifecycle fields.
 */
export function buildWelcomeDisplayContext(params: {
  clientDoc: ClientLikeDoc;
  agentDoc: AgentLikeDoc;
}): ActionItemDisplayContext {
  const subjectName = readString(params.clientDoc.name) || null;
  const subjectFirstName = subjectName ? firstNameFrom(subjectName) : null;
  const rawPhone = readString(params.clientDoc.phone);
  const normalized = rawPhone ? normalizePhone(rawPhone) : '';
  const subjectPhoneE164 = normalized && isValidE164(normalized) ? normalized : null;
  const subjectClientCode = readString(params.clientDoc.clientCode) || null;
  const language = resolveClientLanguage(params.clientDoc.preferredLanguage);
  const agentName = readString(params.agentDoc.name) || null;

  const welcomeMessageBody =
    subjectClientCode && subjectFirstName
      ? buildPhase1WelcomeBody({
          clientFirstName: subjectFirstName,
          agentName: agentName || '',
          clientCode: subjectClientCode,
          language,
        })
      : null;

  return {
    subjectName,
    subjectFirstName,
    subjectPhoneE164,
    subjectClientCode,
    welcomeMessageBody,
    agentName,
    preferredLanguage: language,
  };
}

interface QueueOrRefreshParams {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  clientId: string;
}

export interface QueueOrRefreshResult {
  itemId: string;
  outcome:
    | 'created'
    | 'refreshed'
    | 'unchanged'
    | 'skipped_no_phone'
    | 'skipped_already_completed';
  result?: CreateActionItemResult;
}

/**
 * Idempotent queue-or-refresh entry point. First call creates the welcome
 * action item; subsequent calls (after the agent edits the client
 * profile) refresh the displayContext in place per Daniel's Q1 lock.
 *
 * Returns `skipped_no_phone` when the client doc has no usable phone — a
 * welcome we can't text from `sms:` is not actionable in the welcome lane
 * and would just sit in the queue blocking compliance metrics. Once the
 * agent adds a phone via the inline edit flow, the same call from
 * `handleInlineUpdateClient` will succeed and queue the item.
 */
export async function queueOrRefreshWelcomeActionItem(
  params: QueueOrRefreshParams,
): Promise<QueueOrRefreshResult> {
  const itemId = actionItemIdempotencyKey.welcome(params.clientId);
  const clientRef = params.db
    .collection('agents')
    .doc(params.agentId)
    .collection('clients')
    .doc(params.clientId);
  const agentRef = params.db.collection('agents').doc(params.agentId);

  const [clientSnap, agentSnap] = await Promise.all([clientRef.get(), agentRef.get()]);
  if (!clientSnap.exists) {
    throw new Error(`client ${params.clientId} not found under agent ${params.agentId}`);
  }
  const clientData = (clientSnap.data() ?? {}) as ClientLikeDoc;
  const agentData = (agentSnap.exists ? agentSnap.data() : {}) as AgentLikeDoc;
  const displayContext = buildWelcomeDisplayContext({ clientDoc: clientData, agentDoc: agentData });

  if (!displayContext.subjectPhoneE164) {
    return { itemId, outcome: 'skipped_no_phone' };
  }

  // No-op if the action item already completed (or expired) — we must
  // NOT resurrect a finished welcome via an inline client edit, and we
  // must NOT re-stamp the byPhone resolver to the welcome_activation
  // placeholder for a phone that's now in a regular conversation thread.
  const existingAny = await getActionItemByKey({
    db: params.db,
    agentId: params.agentId,
    itemId,
  });
  if (existingAny && existingAny.status !== 'pending') {
    return { itemId, outcome: 'skipped_already_completed' };
  }

  const existing = existingAny;
  if (existing) {
    const before = existing.displayContext;
    const same =
      before.subjectName === displayContext.subjectName &&
      before.subjectPhoneE164 === displayContext.subjectPhoneE164 &&
      before.subjectClientCode === displayContext.subjectClientCode &&
      before.welcomeMessageBody === displayContext.welcomeMessageBody &&
      before.agentName === displayContext.agentName &&
      before.preferredLanguage === displayContext.preferredLanguage;
    if (same) {
      return { itemId, outcome: 'unchanged' };
    }
    await refreshActionItemDisplayContext({
      db: params.db,
      agentId: params.agentId,
      itemId,
      displayContext,
    });
    await upsertWelcomeActivationThreadHint({
      db: params.db,
      agentId: params.agentId,
      clientId: params.clientId,
      clientPhoneE164: displayContext.subjectPhoneE164,
    });
    return { itemId, outcome: 'refreshed' };
  }

  const result = await createActionItem({
    db: params.db,
    agentId: params.agentId,
    lane: 'welcome',
    triggerReason: 'welcome_pending',
    clientId: params.clientId,
    prospectId: null,
    linkedEntityType: 'client',
    linkedEntityId: params.clientId,
    displayContext,
    idempotencyKey: itemId,
  });

  await upsertWelcomeActivationThreadHint({
    db: params.db,
    agentId: params.agentId,
    clientId: params.clientId,
    clientPhoneE164: displayContext.subjectPhoneE164,
  });

  return {
    itemId,
    outcome: result.created ? 'created' : 'unchanged',
    result,
  };
}

/**
 * Pre-register a welcome_activation thread keyed on the client's phone.
 * The Linq webhook (Commit 4) resolves inbound by phone, finds this hint,
 * and recognizes the activation event without depending on the
 * `THREAD_ROUTER_ENABLED` flag being on (the resolver-by-phone path runs
 * regardless once the registry has an entry).
 *
 * IMPORTANT: at queue-time we do NOT yet know the Linq-side
 * `providerThreadId` (the client's first inbound creates the chat). We
 * use a synthetic placeholder doc id `welcome_pending_{clientId}` for the
 * conversationThreads doc; the webhook handler in Commit 4 will upgrade
 * the entry to the real Linq threadId once the inbound arrives, by
 * upserting a fresh entry under the real id and marking this placeholder
 * lifecycleStatus='archived'.
 */
const WELCOME_ACTIVATION_PLACEHOLDER_PREFIX = 'welcome_pending_' as const;

export function welcomeActivationPlaceholderThreadId(clientId: string): string {
  return `${WELCOME_ACTIVATION_PLACEHOLDER_PREFIX}${clientId}`;
}

export function isWelcomeActivationPlaceholderThreadId(threadId: string): boolean {
  return typeof threadId === 'string' && threadId.startsWith(WELCOME_ACTIVATION_PLACEHOLDER_PREFIX);
}

interface UpsertHintParams {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  clientId: string;
  clientPhoneE164: string;
}

async function upsertWelcomeActivationThreadHint(params: UpsertHintParams): Promise<void> {
  const placeholderThreadId = welcomeActivationPlaceholderThreadId(params.clientId);
  const now = new Date().toISOString();

  const threadRef = params.db
    .collection('agents')
    .doc(params.agentId)
    .collection('conversationThreads')
    .doc(placeholderThreadId);

  await threadRef.set(
    {
      threadId: placeholderThreadId,
      agentId: params.agentId,
      provider: 'linq',
      providerThreadId: placeholderThreadId,
      providerType: 'sms_direct',
      lane: 'welcome_activation',
      purpose: 'welcome_activation_inbound',
      linkedEntityType: 'client',
      linkedEntityId: params.clientId,
      primaryPersonId: null,
      participantPersonIds: [params.clientId],
      participantPhonesE164: [params.clientPhoneE164],
      aiPolicy: {
        allowAutoReply: true,
        allowedResponder: 'welcome_activation',
      },
      lifecycleStatus: 'active',
      confidence: 'medium',
      assignmentSource: 'outbound_create',
      lastInboundAt: null,
      lastOutboundAt: null,
      lastMessageAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: now,
      // Welcome-activation-specific marker so the webhook handler can
      // verify it's a placeholder and upgrade it to the real Linq
      // threadId on first inbound.
      isWelcomeActivationPlaceholder: true,
    },
    { merge: true },
  );

  // byPhone resolver entry — overwrites any prior placeholder for the
  // same phone (an agent re-creating a client from the same number is
  // intentional; the latest placeholder is the one we want to resolve to).
  const byPhoneRef = params.db
    .collection('agents')
    .doc(params.agentId)
    .collection('threadResolvers')
    .doc('byPhone')
    .collection('entries')
    .doc(params.clientPhoneE164);
  await byPhoneRef.set(
    {
      phoneE164: params.clientPhoneE164,
      latestThreadId: placeholderThreadId,
      threadIdCandidates: FieldValue.arrayUnion(placeholderThreadId),
      updatedAt: now,
    },
    { merge: true },
  );
}
