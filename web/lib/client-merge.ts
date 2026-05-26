import 'server-only';
import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Client-merge engine.
 *
 * Merges a "duplicate" client doc into a "canonical" client doc, moving
 * all associated data (policies, notifications, action items, threads,
 * appointments, conservation alerts, policy reviews) and rewriting
 * back-references (leads.convertedToClientId, clientCodes redirect).
 *
 * Design decisions (May 25, 2026, with Daniel):
 *   • Soft-delete the duplicate (mark `deleted: true`, `mergedInto`,
 *     `mergedAt`). Keep the doc for a 30-day recovery window.
 *   • Physically MOVE policies + notifications subcollections to the
 *     canonical (preserve doc IDs). The duplicate ends up empty.
 *   • Gap-fill contact fields on the canonical from the duplicate, but
 *     NEVER overwrite a non-empty canonical field.
 *   • Redirect `clientCodes/{dupCode}` to point at canonical (preserve
 *     the doc) so existing share links keep working.
 *   • DELETE the top-level `clients/{dupId}` mirror so the mobile app
 *     stops surfacing it.
 *   • Write a journal doc at `agents/{agentId}/clientMerges/{journalId}`
 *     summarizing what got moved — enables a future un-merge feature and
 *     gives auditors a trail.
 *   • Idempotent: re-running the same merge is a no-op (returns the
 *     existing journal).
 *   • `dryRun: true` returns the same shape but skips all writes —
 *     used by the review UI preview and the initial run on Kevin's data.
 *
 * Firestore writes are batched (500-op limit). Each subcollection move
 * and each agent-level field rewrite is chunked into ≤450-op batches to
 * leave headroom for journal/canonical/duplicate writes in the final
 * batch when the move is small enough to fit in one.
 */

const BATCH_LIMIT = 450;

// ───────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────

export interface MergeOptions {
  /** When true, do not write. Return the same shape with what would happen. */
  dryRun?: boolean;
  /** UID of the actor performing the merge (logged on the journal). */
  actorAgentId?: string;
}

export interface MergeContactGapsFilled {
  email?: { from: string; to: string };
  phone?: { from: string; to: string };
  dateOfBirth?: { from: string; to: string };
  preferredLanguage?: { from: string; to: string };
  clientSinceDate?: { from: string; to: string };
  sourceReferralId?: { from: string; to: string };
  convertedFromLeadId?: { from: string; to: string };
}

export interface MergeCounts {
  policies: number;
  notifications: number;
  actionItems: number;
  conversationThreads: number;
  appointments: number;
  conservationAlerts: number;
  policyReviews: number;
  leadsRewritten: number;
  notDuplicateOfMerged: number;
}

export type MergeFailureReason =
  | 'canonical-not-found'
  | 'duplicate-not-found'
  | 'same-client'
  | 'already-merged-elsewhere'
  | 'canonical-is-deleted'
  | 'cross-agent';

export type MergeResult =
  | {
      ok: true;
      dryRun: boolean;
      journalId: string | null;
      idempotent: boolean;
      counts: MergeCounts;
      contactGapsFilled: MergeContactGapsFilled;
      duplicateClientCode?: string;
    }
  | {
      ok: false;
      reason: MergeFailureReason;
      detail?: string;
    };

// ───────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Choose the "earlier" of two ISO-ish date strings. Returns null if
 * neither is a valid YYYY-MM-DD. We use this for clientSinceDate so
 * the canonical inherits the longest tenure on merge — agents care
 * about anniversary triggers being based on the earliest sign date.
 */
function earlierIsoDate(a: string | undefined, b: string | undefined): string | null {
  const validA = a && /^\d{4}-\d{2}-\d{2}$/.test(a) ? a : null;
  const validB = b && /^\d{4}-\d{2}-\d{2}$/.test(b) ? b : null;
  if (!validA && !validB) return null;
  if (!validA) return validB;
  if (!validB) return validA;
  return validA <= validB ? validA : validB;
}

interface BatchWriter {
  write(fn: (batch: WriteBatch) => void): Promise<void>;
  flush(): Promise<void>;
}

/**
 * Buffered batch writer. Auto-commits when approaching the 500-op
 * Firestore batch limit. Pass `null` for dry-run (no-op writer).
 */
function createBatchWriter(db: Firestore, dryRun: boolean): BatchWriter {
  if (dryRun) {
    return { write: async () => {}, flush: async () => {} };
  }
  let batch: WriteBatch = db.batch();
  let ops = 0;
  return {
    async write(fn) {
      // Each fn may apply multiple ops; we conservatively assume up to
      // 4 ops per fn (used by the canonical-update step). Commit early
      // if we'd cross the limit.
      if (ops > BATCH_LIMIT - 4) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
      const before = ops;
      const proxy: WriteBatch = new Proxy(batch, {
        get(target, prop) {
          const v = (target as unknown as Record<string, unknown>)[prop as string];
          if (typeof v !== 'function') return v;
          return (...args: unknown[]) => {
            ops++;
            return (v as (...a: unknown[]) => unknown).apply(target, args);
          };
        },
      });
      fn(proxy);
      // Guard against an empty fn call.
      void before;
    },
    async flush() {
      if (ops > 0) {
        await batch.commit();
        ops = 0;
        batch = db.batch();
      }
    },
  };
}

interface ClientDocShape {
  name?: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  preferredLanguage?: string | null;
  clientSinceDate?: string | null;
  sourceReferralId?: string | null;
  convertedFromLeadId?: string | null;
  clientCode?: string | null;
  notDuplicateOf?: string[];
  deleted?: boolean;
  mergedInto?: string;
  agentId?: string;
}

// ───────────────────────────────────────────────────────────────
// Main entry
// ───────────────────────────────────────────────────────────────

export async function mergeClients(
  db: Firestore,
  agentId: string,
  canonicalId: string,
  duplicateId: string,
  opts: MergeOptions = {},
): Promise<MergeResult> {
  if (canonicalId === duplicateId) {
    return { ok: false, reason: 'same-client' };
  }
  const dryRun = Boolean(opts.dryRun);

  const agentRef = db.collection('agents').doc(agentId);
  const canonicalRef = agentRef.collection('clients').doc(canonicalId);
  const duplicateRef = agentRef.collection('clients').doc(duplicateId);

  const [canonicalSnap, duplicateSnap] = await Promise.all([
    canonicalRef.get(),
    duplicateRef.get(),
  ]);

  if (!canonicalSnap.exists) return { ok: false, reason: 'canonical-not-found' };
  if (!duplicateSnap.exists) return { ok: false, reason: 'duplicate-not-found' };

  const canonicalData = (canonicalSnap.data() ?? {}) as ClientDocShape;
  const duplicateData = (duplicateSnap.data() ?? {}) as ClientDocShape;

  if (canonicalData.deleted) {
    return { ok: false, reason: 'canonical-is-deleted' };
  }

  // Idempotency: if duplicate already merged into the same canonical,
  // surface the existing journal. If into a different canonical, error.
  if (duplicateData.mergedInto) {
    if (duplicateData.mergedInto === canonicalId) {
      return {
        ok: true,
        dryRun,
        idempotent: true,
        journalId: null, // caller can look up via mergedInto / clientMerges
        counts: {
          policies: 0, notifications: 0, actionItems: 0, conversationThreads: 0,
          appointments: 0, conservationAlerts: 0, policyReviews: 0,
          leadsRewritten: 0, notDuplicateOfMerged: 0,
        },
        contactGapsFilled: {},
        duplicateClientCode: duplicateData.clientCode ?? undefined,
      };
    }
    return {
      ok: false,
      reason: 'already-merged-elsewhere',
      detail: `Duplicate ${duplicateId} is already merged into ${duplicateData.mergedInto}.`,
    };
  }

  // Cross-agent safety belt. Both docs should belong to this agent —
  // they live under the agent's subcollection — but defend against a
  // mis-routed call from an admin tool.
  if (canonicalData.agentId && canonicalData.agentId !== agentId) {
    return { ok: false, reason: 'cross-agent' };
  }
  if (duplicateData.agentId && duplicateData.agentId !== agentId) {
    return { ok: false, reason: 'cross-agent' };
  }

  const counts: MergeCounts = {
    policies: 0, notifications: 0, actionItems: 0, conversationThreads: 0,
    appointments: 0, conservationAlerts: 0, policyReviews: 0,
    leadsRewritten: 0, notDuplicateOfMerged: 0,
  };

  const writer = createBatchWriter(db, dryRun);

  // ─── 1. Move policies subcollection ──────────────────────────
  {
    const polSnap = await duplicateRef.collection('policies').get();
    counts.policies = polSnap.size;
    for (const polDoc of polSnap.docs) {
      const targetRef = canonicalRef.collection('policies').doc(polDoc.id);
      await writer.write((b) => {
        b.set(targetRef, polDoc.data(), { merge: false });
        b.delete(polDoc.ref);
      });
    }
  }

  // ─── 2. Move notifications subcollection ────────────────────
  {
    const notifSnap = await duplicateRef.collection('notifications').get();
    counts.notifications = notifSnap.size;
    for (const notifDoc of notifSnap.docs) {
      const targetRef = canonicalRef.collection('notifications').doc(notifDoc.id);
      await writer.write((b) => {
        b.set(targetRef, notifDoc.data(), { merge: false });
        b.delete(notifDoc.ref);
      });
    }
  }

  // ─── 3. Rewrite clientId on agent-level collections ─────────
  // actionItems, appointments, conservationAlerts, policyReviews all
  // carry a flat `clientId` field that we can rewrite in place.
  const flatClientIdCollections: Array<{
    name: 'actionItems' | 'appointments' | 'conservationAlerts' | 'policyReviews';
    countKey: keyof MergeCounts;
  }> = [
    { name: 'actionItems', countKey: 'actionItems' },
    { name: 'appointments', countKey: 'appointments' },
    { name: 'conservationAlerts', countKey: 'conservationAlerts' },
    { name: 'policyReviews', countKey: 'policyReviews' },
  ];

  for (const { name, countKey } of flatClientIdCollections) {
    const snap = await agentRef
      .collection(name)
      .where('clientId', '==', duplicateId)
      .get();
    counts[countKey] = snap.size;
    for (const doc of snap.docs) {
      await writer.write((b) => {
        b.update(doc.ref, { clientId: canonicalId });
      });
    }
  }

  // Action items can ALSO carry the clientId in `linkedEntityId` or
  // `primaryPersonId` (welcome/anniversary writers set both). Sweep
  // those as a defensive second pass.
  for (const field of ['linkedEntityId', 'primaryPersonId'] as const) {
    const snap = await agentRef
      .collection('actionItems')
      .where(field, '==', duplicateId)
      .get();
    for (const doc of snap.docs) {
      await writer.write((b) => {
        b.update(doc.ref, { [field]: canonicalId });
      });
    }
  }

  // ─── 4. conversationThreads (linkedEntityId / primaryPersonId) ───
  {
    const seenIds = new Set<string>();
    for (const field of ['linkedEntityId', 'primaryPersonId'] as const) {
      const snap = await agentRef
        .collection('conversationThreads')
        .where(field, '==', duplicateId)
        .get();
      for (const doc of snap.docs) {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          counts.conversationThreads++;
        }
        await writer.write((b) => {
          b.update(doc.ref, { [field]: canonicalId });
        });
      }
    }
  }

  // ─── 5. Rewrite leads.convertedToClientId / convertedToClientCode ───
  {
    const snap = await agentRef
      .collection('leads')
      .where('convertedToClientId', '==', duplicateId)
      .get();
    counts.leadsRewritten = snap.size;
    const canonicalCode = canonicalData.clientCode ?? null;
    for (const doc of snap.docs) {
      await writer.write((b) => {
        const update: Record<string, unknown> = { convertedToClientId: canonicalId };
        if (canonicalCode) update.convertedToClientCode = canonicalCode;
        b.update(doc.ref, update);
      });
    }
  }

  // ─── 6. Gap-fill canonical from duplicate ───────────────────
  const contactGapsFilled: MergeContactGapsFilled = {};
  const canonicalUpdate: Record<string, unknown> = {};

  const tryGapFill = (
    field: 'email' | 'phone' | 'dateOfBirth' | 'preferredLanguage' | 'sourceReferralId' | 'convertedFromLeadId',
  ) => {
    const canonVal = canonicalData[field];
    const dupVal = duplicateData[field];
    if (!isNonEmptyString(canonVal) && isNonEmptyString(dupVal)) {
      canonicalUpdate[field] = dupVal;
      contactGapsFilled[field] = { from: '', to: dupVal };
    }
  };

  tryGapFill('email');
  tryGapFill('phone');
  tryGapFill('dateOfBirth');
  tryGapFill('preferredLanguage');
  tryGapFill('sourceReferralId');
  tryGapFill('convertedFromLeadId');

  // clientSinceDate: take the EARLIER of the two (longest tenure wins).
  const earlier = earlierIsoDate(
    canonicalData.clientSinceDate ?? undefined,
    duplicateData.clientSinceDate ?? undefined,
  );
  if (earlier && earlier !== canonicalData.clientSinceDate) {
    contactGapsFilled.clientSinceDate = {
      from: canonicalData.clientSinceDate ?? '',
      to: earlier,
    };
    canonicalUpdate.clientSinceDate = earlier;
  }

  // Merge notDuplicateOf arrays (preserve agent-declared "not a duplicate"
  // signals from both sides so they don't resurface in future scans).
  const canonicalNDO = Array.isArray(canonicalData.notDuplicateOf)
    ? canonicalData.notDuplicateOf : [];
  const duplicateNDO = Array.isArray(duplicateData.notDuplicateOf)
    ? duplicateData.notDuplicateOf : [];
  const mergedNDO = Array.from(new Set([...canonicalNDO, ...duplicateNDO]))
    .filter((id) => id !== canonicalId && id !== duplicateId);
  if (mergedNDO.length !== canonicalNDO.length) {
    canonicalUpdate.notDuplicateOf = mergedNDO;
    counts.notDuplicateOfMerged = mergedNDO.length - canonicalNDO.length;
  }

  if (Object.keys(canonicalUpdate).length > 0) {
    await writer.write((b) => b.update(canonicalRef, canonicalUpdate));
  }

  // ─── 7. Redirect clientCodes for the duplicate's code ───────
  // Preserves the share-link URL the agent or client may have already
  // distributed. The doc gets a `mergedFromClientId` audit field so we
  // can tell apart "redirect for merge" from "original mapping" later.
  const dupCode = duplicateData.clientCode;
  if (isNonEmptyString(dupCode) && dupCode !== canonicalData.clientCode) {
    const codeRef = db.collection('clientCodes').doc(dupCode);
    await writer.write((b) => {
      b.set(codeRef, {
        agentId,
        clientId: canonicalId,
        mergedFromClientId: duplicateId,
        mergedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  }

  // ─── 8. Delete top-level mirror so mobile app stops surfacing ───
  await writer.write((b) => {
    b.delete(db.collection('clients').doc(duplicateId));
  });

  // ─── 9. Mark duplicate as merged (soft-delete) ──────────────
  const journalRef = agentRef.collection('clientMerges').doc();
  const journalId = journalRef.id;

  await writer.write((b) => {
    b.update(duplicateRef, {
      deleted: true,
      deletedAt: FieldValue.serverTimestamp(),
      mergedInto: canonicalId,
      mergedAt: FieldValue.serverTimestamp(),
      mergedBy: opts.actorAgentId ?? agentId,
      mergeJournalId: journalId,
    });
  });

  // ─── 10. Write journal doc ──────────────────────────────────
  await writer.write((b) => {
    b.set(journalRef, {
      canonicalId,
      duplicateId,
      duplicateClientCode: dupCode ?? null,
      duplicateSnapshot: duplicateData, // for un-merge / audit
      counts,
      contactGapsFilled,
      actorAgentId: opts.actorAgentId ?? agentId,
      mergedAt: FieldValue.serverTimestamp(),
    });
  });

  await writer.flush();

  return {
    ok: true,
    dryRun,
    idempotent: false,
    journalId: dryRun ? null : journalId,
    counts,
    contactGapsFilled,
    duplicateClientCode: dupCode ?? undefined,
  };
}

// ───────────────────────────────────────────────────────────────
// "Not a duplicate" recording (for the review UI's dismiss action)
// ───────────────────────────────────────────────────────────────

/**
 * Record that two clients are NOT duplicates so the scan doesn't
 * resurface them. Symmetric — appends each id to the other's
 * `notDuplicateOf` array.
 */
export async function markNotDuplicate(
  db: Firestore,
  agentId: string,
  clientIdA: string,
  clientIdB: string,
): Promise<void> {
  if (clientIdA === clientIdB) return;
  const agentRef = db.collection('agents').doc(agentId);
  const aRef = agentRef.collection('clients').doc(clientIdA);
  const bRef = agentRef.collection('clients').doc(clientIdB);
  const batch = db.batch();
  batch.update(aRef, { notDuplicateOf: FieldValue.arrayUnion(clientIdB) });
  batch.update(bRef, { notDuplicateOf: FieldValue.arrayUnion(clientIdA) });
  await batch.commit();
}
