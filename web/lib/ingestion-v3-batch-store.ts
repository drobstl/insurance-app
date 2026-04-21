import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebase-admin';

// ─── Types ───────────────────────────────────────────────

export type BatchJobStatus = 'processing' | 'completing' | 'completed' | 'partial' | 'failed' | 'cancelled';
export type BatchFileStatus = 'queued' | 'processing' | 'succeeded' | 'failed';
export type BatchSource = 'drive' | 'local';

export interface BatchFileEntry {
  jobId: string;
  driveFileId?: string;
  fileName: string;
  mimeType: string;
  status: BatchFileStatus;
  loadedRows: number;
  error?: string;
  retryable: boolean;
}

export interface BatchJobRecord {
  id: string;
  agentId: string;
  source: BatchSource;
  status: BatchJobStatus;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  totalRows: number;
  retryRound: number;
  files: Record<string, BatchFileEntry>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CreateBatchFileInput {
  jobId: string;
  driveFileId?: string;
  fileName: string;
  mimeType: string;
}

export interface BatchFileStatusPatch {
  status: 'succeeded' | 'failed';
  loadedRows?: number;
  error?: string;
  retryable?: boolean;
}

// ─── Collection Helpers ──────────────────────────────────

function getBatchJobRef(agentId: string, batchId: string) {
  return getAdminFirestore()
    .collection('agents')
    .doc(agentId)
    .collection('batchJobs')
    .doc(batchId);
}

// ─── Create ──────────────────────────────────────────────

/**
 * Creates the batch tracking doc with the correct totalFiles count and an
 * empty files map. Returns the Firestore-generated document ID immediately
 * so callers can pass it to ingestion job creation — every job gets the real
 * batchId from the moment it's written.
 *
 * File entries are registered individually via registerBatchFile() as each
 * ingestion job is created.
 */
export async function createBatchJob(
  agentId: string,
  source: BatchSource,
  totalFiles: number,
): Promise<string> {
  const ref = getAdminFirestore()
    .collection('agents')
    .doc(agentId)
    .collection('batchJobs')
    .doc();

  await ref.set({
    agentId,
    source,
    status: 'processing',
    totalFiles,
    completedFiles: 0,
    failedFiles: 0,
    totalRows: 0,
    retryRound: 0,
    files: {},
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return ref.id;
}

/**
 * Registers a single file entry in the batch doc's files map. Called from the
 * import route as each ingestion job is successfully created and enqueued.
 *
 * Uses a field-path update so concurrent calls for different jobIds don't
 * conflict with each other or with processor updates.
 */
export async function registerBatchFile(
  agentId: string,
  batchId: string,
  file: CreateBatchFileInput,
): Promise<void> {
  const ref = getBatchJobRef(agentId, batchId);
  await ref.update({
    [`files.${file.jobId}`]: {
      jobId: file.jobId,
      driveFileId: file.driveFileId ?? null,
      fileName: file.fileName,
      mimeType: file.mimeType,
      status: 'queued',
      loadedRows: 0,
      error: null,
      retryable: false,
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ─── Update File Status ──────────────────────────────────

/**
 * Atomically updates a single file entry in the batch doc and increments
 * the appropriate counters. Uses field-path updates so concurrent processors
 * updating different files don't conflict.
 */
export async function updateBatchFileStatus(
  agentId: string,
  batchId: string,
  jobId: string,
  patch: BatchFileStatusPatch,
): Promise<void> {
  const ref = getBatchJobRef(agentId, batchId);

  await getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() as Record<string, unknown>;
    if ((data.status as BatchJobStatus | undefined) === 'cancelled') {
      return;
    }
    const files = (data.files || {}) as Record<string, Record<string, unknown>>;
    const existing = files[jobId];
    if (!existing) {
      // Ignore updates for unknown jobs to avoid creating partial entries.
      return;
    }
    const prevStatus = (existing.status as BatchFileStatus | undefined) ?? 'queued';
    if (prevStatus === patch.status) {
      // Idempotent no-op: same terminal status already applied.
      return;
    }
    if (prevStatus === 'succeeded' || prevStatus === 'failed') {
      // Protect counters from terminal-to-terminal transitions.
      return;
    }

    const update: Record<string, unknown> = {
      [`files.${jobId}.status`]: patch.status,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (patch.status === 'succeeded') {
      update.completedFiles = FieldValue.increment(1);
      if (typeof patch.loadedRows === 'number' && patch.loadedRows > 0) {
        update[`files.${jobId}.loadedRows`] = patch.loadedRows;
        update.totalRows = FieldValue.increment(patch.loadedRows);
      }
    } else if (patch.status === 'failed') {
      update.failedFiles = FieldValue.increment(1);
      if (patch.error) {
        update[`files.${jobId}.error`] = patch.error;
      }
      update[`files.${jobId}.retryable`] = patch.retryable === true;
    }

    tx.update(ref, update);
  });
}

// ─── Batch Completion Check ──────────────────────────────

export interface BatchCompletionState {
  isComplete: boolean;
  retryRound: number;
  retryableJobIds: string[];
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
}

/**
 * Reads the batch doc and determines whether all files are accounted for.
 * Returns the current state so the caller can decide on retry vs finalize.
 *
 * This is a plain read — the caller should use a transaction if it needs
 * to act on the result atomically (see triggerRetryRound and finalizeBatch).
 */
export async function checkBatchCompletion(
  agentId: string,
  batchId: string,
): Promise<BatchCompletionState | null> {
  const snap = await getBatchJobRef(agentId, batchId).get();
  if (!snap.exists) return null;

  const data = snap.data() as Record<string, unknown>;
  return extractCompletionState(data);
}

function extractCompletionState(data: Record<string, unknown>): BatchCompletionState {
  const totalFiles = typeof data.totalFiles === 'number' ? data.totalFiles : 0;
  const completedFiles = typeof data.completedFiles === 'number' ? data.completedFiles : 0;
  const failedFiles = typeof data.failedFiles === 'number' ? data.failedFiles : 0;
  const retryRound = typeof data.retryRound === 'number' ? data.retryRound : 0;
  const isComplete = completedFiles + failedFiles >= totalFiles && totalFiles > 0;

  const retryableJobIds: string[] = [];
  if (isComplete && retryRound === 0 && typeof data.files === 'object' && data.files) {
    const files = data.files as Record<string, Record<string, unknown>>;
    for (const [jobId, entry] of Object.entries(files)) {
      if (entry.status === 'failed' && entry.retryable === true) {
        retryableJobIds.push(jobId);
      }
    }
  }

  return { isComplete, retryRound, retryableJobIds, totalFiles, completedFiles, failedFiles };
}

// ─── Retry Round ─────────────────────────────────────────

/**
 * Atomically transitions the batch to retry round 1:
 * - Sets retryRound = 1
 * - Resets retryable failed file entries to 'queued'
 * - Decrements failedFiles for each reset file
 *
 * Uses a Firestore transaction to guard against two processors racing to
 * trigger the retry. Only one will succeed — the second will re-read the
 * batch doc, see retryRound is already 1, and return an empty array.
 *
 * Returns the jobIds that were reset (caller should re-enqueue them).
 */
export async function triggerRetryRound(
  agentId: string,
  batchId: string,
): Promise<string[]> {
  const db = getAdminFirestore();
  const ref = getBatchJobRef(agentId, batchId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return [];

    const data = snap.data() as Record<string, unknown>;
    if ((data.status as BatchJobStatus | undefined) === 'cancelled') {
      return [];
    }
    const state = extractCompletionState(data);

    // Guard: only trigger once, only on round 0, only if there are retryable failures
    if (!state.isComplete || state.retryRound !== 0 || state.retryableJobIds.length === 0) {
      return [];
    }

    const update: Record<string, unknown> = {
      retryRound: 1,
      // Decrement failedFiles by the number of files being retried
      failedFiles: FieldValue.increment(-state.retryableJobIds.length),
      updatedAt: FieldValue.serverTimestamp(),
    };

    for (const jobId of state.retryableJobIds) {
      update[`files.${jobId}.status`] = 'queued';
      update[`files.${jobId}.error`] = null;
      update[`files.${jobId}.retryable`] = false;
    }

    tx.update(ref, update);
    return state.retryableJobIds;
  });
}

// ─── Finalize ────────────────────────────────────────────

/**
 * Sets the batch to its final status. Uses a transaction to guard against
 * races with triggerRetryRound.
 */
export async function finalizeBatch(
  agentId: string,
  batchId: string,
): Promise<BatchJobStatus> {
  const db = getAdminFirestore();
  const ref = getBatchJobRef(agentId, batchId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 'failed';

    const data = snap.data() as Record<string, unknown>;
    const currentStatus = (data.status as BatchJobStatus | undefined) ?? 'processing';
    if (currentStatus === 'cancelled') return 'cancelled';
    const state = extractCompletionState(data);

    // Don't finalize if not actually complete
    if (!state.isComplete) return currentStatus;

    // Don't finalize if we're still on round 0 with retryable failures
    // (triggerRetryRound should handle this case)
    if (state.retryRound === 0 && state.retryableJobIds.length > 0) {
      return 'processing';
    }

    const finalStatus: BatchJobStatus = state.failedFiles > 0 ? 'partial' : 'completed';

    tx.update(ref, {
      status: finalStatus,
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    });

    return finalStatus;
  });
}

export async function cancelBatchJob(
  agentId: string,
  batchId: string,
): Promise<{ cancelled: boolean; status: BatchJobStatus | 'not_found'; cancellableJobIds: string[] }> {
  const db = getAdminFirestore();
  const ref = getBatchJobRef(agentId, batchId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { cancelled: false, status: 'not_found' as const, cancellableJobIds: [] };
    }

    const data = snap.data() as Record<string, unknown>;
    const currentStatus = (data.status as BatchJobStatus | undefined) ?? 'processing';
    if (currentStatus === 'completed' || currentStatus === 'partial' || currentStatus === 'failed' || currentStatus === 'cancelled') {
      return { cancelled: false, status: currentStatus, cancellableJobIds: [] };
    }

    const files = (data.files || {}) as Record<string, Record<string, unknown>>;
    const cancellableJobIds: string[] = [];
    for (const [jobId, entry] of Object.entries(files)) {
      const status = (entry.status as string | undefined) ?? 'queued';
      if (status === 'queued' || status === 'processing') {
        cancellableJobIds.push(jobId);
      }
    }

    tx.update(ref, {
      status: 'cancelled',
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    });

    return { cancelled: true, status: 'cancelled' as const, cancellableJobIds };
  });
}

// ─── Read ────────────────────────────────────────────────

export async function getBatchJob(
  agentId: string,
  batchId: string,
): Promise<BatchJobRecord | null> {
  const snap = await getBatchJobRef(agentId, batchId).get();
  if (!snap.exists) return null;
  return toBatchJobRecord(snap.id, snap.data() as Record<string, unknown>);
}

// ─── Serialization ───────────────────────────────────────

function toBatchJobRecord(id: string, data: Record<string, unknown>): BatchJobRecord {
  const filesRaw = (data.files || {}) as Record<string, Record<string, unknown>>;
  const files: Record<string, BatchFileEntry> = {};

  for (const [jobId, entry] of Object.entries(filesRaw)) {
    files[jobId] = {
      jobId,
      driveFileId: typeof entry.driveFileId === 'string' ? entry.driveFileId : undefined,
      fileName: typeof entry.fileName === 'string' ? entry.fileName : '',
      mimeType: typeof entry.mimeType === 'string' ? entry.mimeType : '',
      status: (entry.status as BatchFileStatus) || 'queued',
      loadedRows: typeof entry.loadedRows === 'number' ? entry.loadedRows : 0,
      error: typeof entry.error === 'string' ? entry.error : undefined,
      retryable: entry.retryable === true,
    };
  }

  return {
    id,
    agentId: typeof data.agentId === 'string' ? data.agentId : '',
    source: (data.source as BatchSource) || 'drive',
    status: (data.status as BatchJobStatus) || 'processing',
    totalFiles: typeof data.totalFiles === 'number' ? data.totalFiles : 0,
    completedFiles: typeof data.completedFiles === 'number' ? data.completedFiles : 0,
    failedFiles: typeof data.failedFiles === 'number' ? data.failedFiles : 0,
    totalRows: typeof data.totalRows === 'number' ? data.totalRows : 0,
    retryRound: typeof data.retryRound === 'number' ? data.retryRound : 0,
    files,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    completedAt: toIsoStringOptional(data.completedAt),
  };
}

function toIsoString(value: unknown): string {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString() : new Date(0).toISOString();
}

function toIsoStringOptional(value: unknown): string | undefined {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString() : undefined;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
