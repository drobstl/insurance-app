import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebase-admin';
import type { IngestionV3ErrorDetails } from './ingestion-v3-errors';
import type { IngestionV3JobRecord, IngestionV3Mode, IngestionV3ResultPayload, IngestionV3Status } from './ingestion-v3-types';

const JOBS_COLLECTION = 'ingestionJobsV3';

interface IngestionV3JobDoc {
  mode: IngestionV3Mode;
  status: IngestionV3Status;
  gcsPath: string;
  fileName?: string;
  contentType?: string;
  attempts: number;
  maxAttempts: number;
  agentId?: string | null;
  idempotencyKey?: string | null;
  error?: IngestionV3ErrorDetails | null;
  result?: IngestionV3ResultPayload | null;
  metrics?: Record<string, unknown> | null;
  processingToken?: string | null;
  retryAfter?: number | null;
  createdAt: FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.FieldValue;
  startedAt?: FirebaseFirestore.FieldValue;
  completedAt?: FirebaseFirestore.FieldValue;
}

export interface CreateIngestionV3JobInput {
  mode: IngestionV3Mode;
  gcsPath: string;
  fileName?: string;
  contentType?: string;
  maxAttempts?: number;
  agentId?: string;
  idempotencyKey?: string;
}

export function getIngestionV3JobsCollection() {
  return getAdminFirestore().collection(JOBS_COLLECTION);
}

export async function findExistingIngestionV3JobByIdempotency(
  input: Pick<CreateIngestionV3JobInput, 'agentId' | 'idempotencyKey'>,
): Promise<IngestionV3JobRecord | null> {
  if (!input.agentId || !input.idempotencyKey) return null;
  const existing = await getIngestionV3JobsCollection()
    .where('agentId', '==', input.agentId)
    .where('idempotencyKey', '==', input.idempotencyKey)
    .limit(1)
    .get();

  if (existing.empty) return null;
  const doc = existing.docs[0];
  return toIngestionV3JobRecord(doc.id, doc.data() || {});
}

export async function createIngestionV3Job(input: CreateIngestionV3JobInput): Promise<IngestionV3JobRecord> {
  const ref = getIngestionV3JobsCollection().doc();
  const maxAttempts = typeof input.maxAttempts === 'number' && input.maxAttempts > 0 ? input.maxAttempts : 4;

  const payload: IngestionV3JobDoc = {
    mode: input.mode,
    status: 'queued',
    gcsPath: input.gcsPath,
    fileName: input.fileName,
    contentType: input.contentType,
    attempts: 0,
    maxAttempts,
    agentId: input.agentId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    error: null,
    result: null,
    metrics: null,
    processingToken: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await ref.set(compactObject(payload));
  const created = await ref.get();
  return toIngestionV3JobRecord(ref.id, created.data() || {});
}

export async function getIngestionV3Job(jobId: string): Promise<IngestionV3JobRecord | null> {
  const snap = await getIngestionV3JobsCollection().doc(jobId).get();
  if (!snap.exists) return null;
  return toIngestionV3JobRecord(snap.id, snap.data() || {});
}

export async function setIngestionV3JobError(
  jobId: string,
  error: IngestionV3ErrorDetails,
  status: IngestionV3Status = 'failed',
): Promise<void> {
  await getIngestionV3JobsCollection()
    .doc(jobId)
    .set(
      {
        status,
        error,
        processingToken: FieldValue.delete(),
        retryAfter: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: status === 'failed' ? FieldValue.serverTimestamp() : FieldValue.delete(),
      },
      { merge: true },
    );
}

export type LockIngestionV3JobResult =
  | { ok: true; job: IngestionV3JobRecord }
  | { ok: false; reason: 'not_found' | 'already_processing' | 'already_terminal' | 'max_attempts_exhausted' | 'retry_not_ready' };

export async function lockIngestionV3JobForProcessing(
  jobId: string,
  processingToken: string,
): Promise<LockIngestionV3JobResult> {
  const db = getAdminFirestore();
  const ref = db.collection(JOBS_COLLECTION).doc(jobId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { ok: false, reason: 'not_found' as const };
    }

    const data = snap.data() as Record<string, unknown>;
    const status = (data.status as IngestionV3Status | undefined) ?? 'failed';
    const attempts = typeof data.attempts === 'number' ? data.attempts : 0;
    const maxAttempts = typeof data.maxAttempts === 'number' ? data.maxAttempts : 4;
    const retryAfter = typeof data.retryAfter === 'number' ? data.retryAfter : undefined;

    if (status === 'processing') {
      return { ok: false, reason: 'already_processing' as const };
    }
    if (retryAfter && Date.now() < retryAfter) {
      return { ok: false, reason: 'retry_not_ready' as const };
    }
    if (status === 'review_ready' || status === 'saved' || status === 'failed') {
      return { ok: false, reason: 'already_terminal' as const };
    }
    if (attempts >= maxAttempts) {
      tx.update(ref, {
        status: 'failed',
        error: {
          code: 'MAX_RETRIES_EXHAUSTED',
          message: 'Maximum retry attempts reached.',
          retryable: false,
          terminal: true,
        },
        processingToken: FieldValue.delete(),
        retryAfter: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
      });
      return { ok: false, reason: 'max_attempts_exhausted' as const };
    }

    tx.update(ref, {
      status: 'processing',
      attempts: attempts + 1,
      processingToken,
      updatedAt: FieldValue.serverTimestamp(),
      startedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.delete(),
      error: FieldValue.delete(),
      retryAfter: FieldValue.delete(),
    });

    return {
      ok: true,
      job: toIngestionV3JobRecord(jobId, {
        ...data,
        status: 'processing',
        attempts: attempts + 1,
        processingToken,
      }),
    };
  });
}

export async function completeIngestionV3Job(
  jobId: string,
  processingToken: string,
  payload: {
    status: Extract<IngestionV3Status, 'review_ready' | 'saved'>;
    result: IngestionV3ResultPayload;
    metrics?: Record<string, unknown>;
  },
): Promise<void> {
  const ref = getIngestionV3JobsCollection().doc(jobId);
  await getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() as Record<string, unknown>;
    if (data.processingToken !== processingToken) return;

    tx.update(ref, {
      status: payload.status,
      result: payload.result,
      metrics: payload.metrics ?? FieldValue.delete(),
      processingToken: FieldValue.delete(),
      retryAfter: FieldValue.delete(),
      error: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function failIngestionV3Job(
  jobId: string,
  processingToken: string,
  error: IngestionV3ErrorDetails,
): Promise<void> {
  const ref = getIngestionV3JobsCollection().doc(jobId);
  await getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() as Record<string, unknown>;
    if (data.processingToken !== processingToken) return;

    tx.update(ref, {
      status: 'failed',
      error,
      processingToken: FieldValue.delete(),
      retryAfter: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function requeueIngestionV3JobWithBackoff(
  jobId: string,
  processingToken: string,
  error: IngestionV3ErrorDetails,
  retryAfterMs: number,
): Promise<void> {
  const ref = getIngestionV3JobsCollection().doc(jobId);
  await getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() as Record<string, unknown>;
    if (data.processingToken !== processingToken) return;

    tx.update(ref, {
      status: 'queued',
      error,
      retryAfter: retryAfterMs,
      processingToken: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.delete(),
    });
  });
}

export function toIngestionV3JobRecord(id: string, data: Record<string, unknown>): IngestionV3JobRecord {
  return {
    id,
    mode: (data.mode as IngestionV3Mode) ?? 'application',
    status: (data.status as IngestionV3Status) ?? 'failed',
    agentId: typeof data.agentId === 'string' ? data.agentId : undefined,
    gcsPath: typeof data.gcsPath === 'string' ? data.gcsPath : '',
    fileName: typeof data.fileName === 'string' ? data.fileName : undefined,
    contentType: typeof data.contentType === 'string' ? data.contentType : undefined,
    attempts: typeof data.attempts === 'number' ? data.attempts : 0,
    maxAttempts: typeof data.maxAttempts === 'number' ? data.maxAttempts : 4,
    error: isErrorDetails(data.error) ? data.error : undefined,
    result: (data.result as IngestionV3ResultPayload | undefined) ?? undefined,
    metrics: (data.metrics as IngestionV3JobRecord['metrics']) ?? undefined,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    startedAt: toIsoStringOptional(data.startedAt),
    completedAt: toIsoStringOptional(data.completedAt),
    retryAfter: toIsoStringOptional(data.retryAfter),
  };
}

function compactObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k as keyof T] = v as T[keyof T];
    }
  }
  return out;
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

function isErrorDetails(value: unknown): value is IngestionV3ErrorDetails {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === 'string' &&
    typeof v.message === 'string' &&
    typeof v.retryable === 'boolean' &&
    typeof v.terminal === 'boolean'
  );
}
