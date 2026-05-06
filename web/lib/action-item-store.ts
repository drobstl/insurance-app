import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import {
  ACTION_ITEM_EXPIRATION_DAYS,
  ACTION_ITEM_SUGGESTED_ACTIONS_BY_LANE,
  computeActionItemExpiresAt,
  type ActionItemCompletionAction,
  type ActionItemDisplayContext,
  type ActionItemDoc,
  type ActionItemLane,
  type ActionItemLinkedEntityType,
  type ActionItemStatus,
  type ActionItemSuggestedAction,
  type ActionItemTriggerReason,
} from './action-item-types';

/**
 * Server-side store for the `actionItems` collection.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > `Channel Rules` > `Agent action item
 * surface`. Every read/write to `agents/{agentId}/actionItems/{itemId}`
 * goes through this module — call sites must NOT issue raw Firestore
 * writes against the collection so that schema invariants (per-lane
 * suggested actions, expiration windows, trigger reasons) stay enforced
 * in one place.
 *
 * Phase 1 Track B writes ONLY welcome entries. Phase 2 writers
 * (anniversary, retention, referral) plug into the same `createActionItem`
 * surface — do not introduce lane-specific writers; pass the lane in.
 */

const ACTION_ITEMS_COLLECTION = 'actionItems' as const;

interface CreateActionItemParams {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  lane: ActionItemLane;
  triggerReason: ActionItemTriggerReason;
  clientId?: string | null;
  prospectId?: string | null;
  linkedEntityType: ActionItemLinkedEntityType;
  linkedEntityId: string;
  displayContext: ActionItemDisplayContext;
  /**
   * Idempotency key. When provided, the doc id is set to this value so
   * repeated creates from the same trigger collapse into one doc instead
   * of a duplicate. Welcome lane uses `welcome:{clientId}` so the
   * "create profile" action — even if invoked twice — only ever produces
   * one queued welcome.
   */
  idempotencyKey?: string;
}

export interface CreateActionItemResult {
  itemId: string;
  created: boolean;
  doc: ActionItemDoc;
}

function buildSuggestedActions(lane: ActionItemLane): readonly ActionItemSuggestedAction[] {
  return ACTION_ITEM_SUGGESTED_ACTIONS_BY_LANE[lane];
}

function buildActionItemDoc(params: CreateActionItemParams, itemId: string, now: Date): ActionItemDoc {
  return {
    itemId,
    agentId: params.agentId,
    lane: params.lane,
    triggerReason: params.triggerReason,
    status: 'pending' satisfies ActionItemStatus,
    clientId: params.clientId ?? null,
    prospectId: params.prospectId ?? null,
    linkedEntityType: params.linkedEntityType,
    linkedEntityId: params.linkedEntityId,
    displayContext: params.displayContext,
    suggestedActions: buildSuggestedActions(params.lane),
    createdAt: now.toISOString(),
    expiresAt: computeActionItemExpiresAt(params.lane, now).toISOString(),
    completedAt: null,
    completedBy: null,
    completionAction: null,
    completionNote: null,
    viewCount: 0,
    firstViewedAt: null,
    lastViewedAt: null,
    schemaVersion: 1,
  };
}

function actionItemRef(
  db: FirebaseFirestore.Firestore,
  agentId: string,
  itemId: string,
): FirebaseFirestore.DocumentReference {
  return db.collection('agents').doc(agentId).collection(ACTION_ITEMS_COLLECTION).doc(itemId);
}

/**
 * Create an action item, or return the existing one if `idempotencyKey`
 * already maps to a pending/completed doc. Idempotency runs in a Firestore
 * transaction so concurrent triggers from the same lane do not produce
 * duplicates. Returns `{ created: false }` when the doc already existed.
 */
export async function createActionItem(params: CreateActionItemParams): Promise<CreateActionItemResult> {
  const itemId = params.idempotencyKey ?? params.db.collection('agents').doc(params.agentId).collection(ACTION_ITEMS_COLLECTION).doc().id;
  const ref = actionItemRef(params.db, params.agentId, itemId);
  const now = new Date();
  const fresh = buildActionItemDoc(params, itemId, now);

  return params.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      return { itemId, created: false, doc: snap.data() as ActionItemDoc };
    }
    tx.set(ref, {
      ...fresh,
      // Server timestamp on createdAt for sort consistency under clock skew.
      // We keep the ISO string above for type-stability on read, plus this
      // server field for indexing/queries.
      createdAtServer: FieldValue.serverTimestamp(),
    });
    return { itemId, created: true, doc: fresh };
  });
}

/**
 * Patch the displayContext of a pending action item without changing its
 * lifecycle. Used by the welcome lane when the agent edits the underlying
 * client profile (Daniel's locked Q1 — name/code change must update the
 * action item in place rather than queue a duplicate). No-op for items in
 * non-pending status.
 */
export async function refreshActionItemDisplayContext(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  itemId: string;
  displayContext: ActionItemDisplayContext;
}): Promise<{ updated: boolean }> {
  const ref = actionItemRef(params.db, params.agentId, params.itemId);
  return params.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { updated: false };
    const current = snap.data() as ActionItemDoc;
    if (current.status !== 'pending') return { updated: false };
    tx.update(ref, {
      displayContext: params.displayContext,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { updated: true };
  });
}

/**
 * Mark a pending action item completed by an agent action. Idempotent on
 * already-completed items. Returns the latest doc snapshot for telemetry.
 */
export async function completeActionItem(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  itemId: string;
  completedBy: string;
  completionAction: ActionItemCompletionAction;
  completionNote?: string | null;
}): Promise<{ completed: boolean; doc: ActionItemDoc | null }> {
  const ref = actionItemRef(params.db, params.agentId, params.itemId);
  const completedAt = new Date().toISOString();
  return params.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { completed: false, doc: null };
    const current = snap.data() as ActionItemDoc;
    if (current.status !== 'pending') {
      return { completed: false, doc: current };
    }
    const next: Partial<ActionItemDoc> = {
      status: 'completed',
      completedAt,
      completedBy: params.completedBy,
      completionAction: params.completionAction,
      completionNote: params.completionNote ?? null,
    };
    tx.update(ref, {
      ...next,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { completed: true, doc: { ...current, ...next } };
  });
}

/**
 * Mark a pending action item viewed. Server-side increments `viewCount`,
 * stamps `firstViewedAt` once, refreshes `lastViewedAt`. Telemetry is
 * fired by the caller (so PostHog identity context lives in the request
 * lifecycle, not here).
 */
export async function markActionItemViewed(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  itemId: string;
}): Promise<{ viewed: boolean }> {
  const ref = actionItemRef(params.db, params.agentId, params.itemId);
  const now = new Date().toISOString();
  return params.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { viewed: false };
    const current = snap.data() as ActionItemDoc;
    if (current.status !== 'pending') return { viewed: false };
    tx.update(ref, {
      viewCount: FieldValue.increment(1),
      firstViewedAt: current.firstViewedAt ?? now,
      lastViewedAt: now,
    });
    return { viewed: true };
  });
}

/**
 * Mark a single pending action item expired. Server-side; called by the
 * expiration cron. Does not fire telemetry here — the cron emits the
 * event so it gets the agentId/lane/daysQueued context in one place.
 */
export async function expireActionItem(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  itemId: string;
}): Promise<{ expired: boolean; doc: ActionItemDoc | null }> {
  const ref = actionItemRef(params.db, params.agentId, params.itemId);
  return params.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { expired: false, doc: null };
    const current = snap.data() as ActionItemDoc;
    if (current.status !== 'pending') return { expired: false, doc: current };
    const updated: Partial<ActionItemDoc> = {
      status: 'expired',
      completedAt: new Date().toISOString(),
      completionAction: 'expired_unhandled',
    };
    tx.update(ref, {
      ...updated,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { expired: true, doc: { ...current, ...updated } };
  });
}

/**
 * Find the action item at a given idempotency key, regardless of status.
 * Returns null if the doc does not exist. Use `getPendingActionItemByKey`
 * if you only care about pending items.
 */
export async function getActionItemByKey(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  itemId: string;
}): Promise<ActionItemDoc | null> {
  const ref = actionItemRef(params.db, params.agentId, params.itemId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as ActionItemDoc;
}

/**
 * Find the active pending action item for a (lane, idempotencyKey)
 * tuple. Used by the welcome writer to look up the item created at
 * profile creation when the agent later edits the client profile, so it
 * can refresh the displayContext in place. Returns null if no pending
 * item exists.
 */
export async function getPendingActionItemByKey(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  itemId: string;
}): Promise<ActionItemDoc | null> {
  const data = await getActionItemByKey(params);
  if (!data || data.status !== 'pending') return null;
  return data;
}

/**
 * Cron entry point: scan an agent's pending action items and expire any
 * past their lane-specific expiration window. Returns counts per lane so
 * the cron handler can emit structured telemetry.
 *
 * Phase 1 only writes welcome items; the cron runs lane-agnostic so when
 * Phase 2 lanes start writing, they get the same hygiene for free.
 */
export async function expireOverdueActionItemsForAgent(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  now?: Date;
}): Promise<{
  scanned: number;
  expired: number;
  expiredByLane: Partial<Record<ActionItemLane, number>>;
  expiredItems: Array<{ itemId: string; lane: ActionItemLane; daysQueued: number }>;
}> {
  const now = params.now ?? new Date();
  const collectionRef = params.db
    .collection('agents')
    .doc(params.agentId)
    .collection(ACTION_ITEMS_COLLECTION);
  const snap = await collectionRef.where('status', '==', 'pending').get();

  let expired = 0;
  const expiredByLane: Partial<Record<ActionItemLane, number>> = {};
  const expiredItems: Array<{ itemId: string; lane: ActionItemLane; daysQueued: number }> = [];

  for (const doc of snap.docs) {
    const data = doc.data() as ActionItemDoc;
    const expiresMs = Date.parse(data.expiresAt);
    if (Number.isNaN(expiresMs) || expiresMs > now.getTime()) continue;

    const result = await expireActionItem({
      db: params.db,
      agentId: params.agentId,
      itemId: data.itemId,
    });
    if (result.expired) {
      expired += 1;
      expiredByLane[data.lane] = (expiredByLane[data.lane] ?? 0) + 1;
      const createdMs = Date.parse(data.createdAt);
      const daysQueued = Number.isFinite(createdMs)
        ? Math.floor((now.getTime() - createdMs) / (1000 * 60 * 60 * 24))
        : ACTION_ITEM_EXPIRATION_DAYS[data.lane];
      expiredItems.push({ itemId: data.itemId, lane: data.lane, daysQueued });
    }
  }

  return {
    scanned: snap.size,
    expired,
    expiredByLane,
    expiredItems,
  };
}

/**
 * Idempotency key helpers. Centralized so writers across lanes pick up
 * the same convention and Phase 2 doesn't accidentally collide with
 * Phase 1 keys.
 */
export const actionItemIdempotencyKey = {
  welcome(clientId: string): string {
    return `welcome_${clientId}`;
  },
  anniversary(policyReviewId: string): string {
    return `anniversary_${policyReviewId}`;
  },
  retention(conservationAlertId: string, touchIndex: number): string {
    return `retention_${conservationAlertId}_t${touchIndex}`;
  },
  referral(referralId: string): string {
    return `referral_${referralId}`;
  },
} as const;
