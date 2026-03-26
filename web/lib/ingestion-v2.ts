import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { extractApplicationFields } from './application-extractor';
import { extractBobFromPdf, extractBobFromText, type BobRow } from './bob-extractor';
import { parseBobDeterministically } from './bob-deterministic-parser';
import { getAdminFirestore, getAdminStorage } from './firebase-admin';
import { pdfToBase64 } from './pdf-parser';
import {
  isRetryableExtractionError,
  shouldGracefullyDegradeApplicationExtraction,
} from './extraction-errors';
import type { ExtractedApplicationData } from './types';

export type IngestionMode = 'application' | 'bob';
export type IngestionJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface IngestionJobResult {
  application?: {
    data: ExtractedApplicationData;
    note?: string;
  };
  bob?: {
    rows: BobRow[];
    rowCount: number;
    note?: string;
  };
}

export interface IngestionJobMetrics {
  totalMs: number;
  resolveSourceMs: number;
  extractMs: number;
  textExtractMs?: number;
  mode: IngestionMode;
  usedTextSource: boolean;
  parserPath?: 'deterministic' | 'ai-text' | 'ai-pdf';
}

export interface IngestionJobDoc {
  mode: IngestionMode;
  status: IngestionJobStatus;
  source: {
    url?: string;
    gcsPath?: string;
    base64?: string;
    textContent?: string;
    fileName?: string;
    fileSize?: number;
  };
  attempts: number;
  maxAttempts: number;
  error?: string;
  result?: IngestionJobResult;
  metrics?: IngestionJobMetrics;
  agentId?: string;
  idempotencyKey?: string;
  createdAt: FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.FieldValue;
  startedAt?: FirebaseFirestore.FieldValue;
  completedAt?: FirebaseFirestore.FieldValue;
  retryAfter?: number;
}

export interface IngestionJobResponse {
  id: string;
  mode: IngestionMode;
  status: IngestionJobStatus;
  attempts: number;
  maxAttempts: number;
  error?: string;
  result?: IngestionJobResult;
  metrics?: IngestionJobMetrics;
}

const JOBS_COLLECTION = 'ingestionJobsV2';
const BLOB_FETCH_TIMEOUT_MS = 30_000;
const RETRY_BACKOFF_BASE_MS = 4_000;

function emptyExtractedApplicationData(): ExtractedApplicationData {
  return {
    policyType: null,
    policyNumber: null,
    insuranceCompany: null,
    policyOwner: null,
    insuredName: null,
    beneficiaries: null,
    coverageAmount: null,
    premiumAmount: null,
    premiumFrequency: null,
    renewalDate: null,
    insuredEmail: null,
    insuredPhone: null,
    insuredDateOfBirth: null,
    insuredState: null,
    effectiveDate: null,
  };
}

export function getIngestionJobsCollection() {
  return getAdminFirestore().collection(JOBS_COLLECTION);
}

export function toJobResponse(id: string, data: Record<string, unknown>): IngestionJobResponse {
  return {
    id,
    mode: (data.mode as IngestionMode) ?? 'application',
    status: (data.status as IngestionJobStatus) ?? 'failed',
    attempts: typeof data.attempts === 'number' ? data.attempts : 0,
    maxAttempts: typeof data.maxAttempts === 'number' ? data.maxAttempts : 1,
    error: typeof data.error === 'string' ? data.error : undefined,
    result: (data.result as IngestionJobResult | undefined) ?? undefined,
    metrics: (data.metrics as IngestionJobMetrics | undefined) ?? undefined,
  };
}

export async function processIngestionJob(id: string): Promise<void> {
  const db = getAdminFirestore();
  const ref = db.collection(JOBS_COLLECTION).doc(id);
  let gcsPathToDelete: string | undefined;

  const lock = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, reason: 'not_found' as const };
    const data = snap.data() as Record<string, unknown>;
    const status = data.status as IngestionJobStatus | undefined;
    const attempts = typeof data.attempts === 'number' ? data.attempts : 0;
    const maxAttempts = typeof data.maxAttempts === 'number' ? data.maxAttempts : 1;
    const retryAfter = typeof data.retryAfter === 'number' ? data.retryAfter : undefined;

    if (status === 'processing' || status === 'succeeded') {
      return { ok: false, reason: 'already_running_or_done' as const };
    }
    if (retryAfter && Date.now() < retryAfter) {
      return { ok: false, reason: 'retry_backoff_not_elapsed' as const };
    }
    if (attempts >= maxAttempts) {
      tx.update(ref, {
        status: 'failed',
        error: 'Maximum retry attempts reached.',
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
        retryAfter: FieldValue.delete(),
      });
      return { ok: false, reason: 'max_attempts' as const };
    }

    tx.update(ref, {
      status: 'processing',
      attempts: attempts + 1,
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      error: FieldValue.delete(),
      retryAfter: FieldValue.delete(),
    });
    return { ok: true, reason: 'locked' as const };
  });

  if (!lock.ok) return;

  try {
    const snap = await ref.get();
    if (!snap.exists) return;
    const data = snap.data() as Record<string, unknown>;
    const mode = (data.mode as IngestionMode | undefined) ?? 'application';
    const source = (data.source as Record<string, unknown> | undefined) ?? {};
    gcsPathToDelete = typeof source.gcsPath === 'string' ? source.gcsPath : undefined;

    const attempt = typeof data.attempts === 'number' ? data.attempts : 1;
    const { result, metrics } = await runExtraction(mode, source, { attempt });
    console.log('[ingestion-v2] Job succeeded', { jobId: id, mode, metrics });

    await ref.update({
      status: 'succeeded',
      result,
      metrics,
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
      error: FieldValue.delete(),
      retryAfter: FieldValue.delete(),
    });
    if (gcsPathToDelete) {
      try {
        await getAdminStorage().bucket().file(gcsPathToDelete).delete();
      } catch {
        // non-blocking cleanup
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process ingestion job.';
    const snap = await ref.get();
    const data = snap.data() as Record<string, unknown> | undefined;
    const attempts = typeof data?.attempts === 'number' ? data.attempts : 1;
    const maxAttempts = typeof data?.maxAttempts === 'number' ? data.maxAttempts : 1;
    const isRetryable = isRetryableExtractionError(err);

    if (isRetryable && attempts < maxAttempts) {
      const nextDelayMs = Math.min(RETRY_BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attempts - 1)), 30_000);
      console.warn('[ingestion-v2] Job transient failure, re-queueing', {
        jobId: id,
        error: message,
        attempts,
        maxAttempts,
        nextDelayMs,
      });
      await ref.update({
        status: 'queued',
        error: message,
        updatedAt: FieldValue.serverTimestamp(),
        retryAfter: Date.now() + nextDelayMs,
      });
      return;
    }

    console.error('[ingestion-v2] Job failed', { jobId: id, error: message, attempts, maxAttempts });
    await ref.update({
      status: 'failed',
      error: message,
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
      retryAfter: FieldValue.delete(),
    });
  }
}

async function runExtraction(
  mode: IngestionMode,
  source: Record<string, unknown>,
  options: { attempt: number },
): Promise<{ result: IngestionJobResult; metrics: IngestionJobMetrics }> {
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.INGESTION_FAULT_MODE === 'retryable_once' &&
    options.attempt <= 1
  ) {
    throw Object.assign(new Error('Synthetic 503: fault injection for retry testing'), {
      status: 503,
    });
  }

  const t0 = Date.now();
  let resolveSourceMs = 0;
  let extractMs = 0;

  if (mode === 'application') {
    const sourceStart = Date.now();
    const pdfBase64 = await resolvePdfBase64(source);
    resolveSourceMs = Date.now() - sourceStart;
    const fileSizeBytes = typeof source.fileSize === 'number' ? source.fileSize : undefined;

    const extractStart = Date.now();
    let extraction: { data: ExtractedApplicationData; note?: string };
    try {
      extraction = await extractApplicationFields(pdfBase64, { fileSizeBytes });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI extraction failed.';
      if (isRetryableExtractionError(error)) {
        throw error;
      }

      if (!shouldGracefullyDegradeApplicationExtraction(message)) {
        throw error;
      }

      extraction = {
        data: emptyExtractedApplicationData(),
        note: 'Automatic extraction is temporarily unavailable. Please review and fill in fields manually.',
      };
    }
    extractMs = Date.now() - extractStart;

    return {
      result: {
        application: {
          data: extraction.data,
          note: extraction.note,
        },
      },
      metrics: {
        totalMs: Date.now() - t0,
        resolveSourceMs,
        extractMs,
        mode,
        usedTextSource: false,
        parserPath: 'ai-pdf',
      },
    };
  }

  const bobSourceStart = Date.now();
  const bobSource = await resolveBobSource(source);
  resolveSourceMs = Date.now() - bobSourceStart;

  if (bobSource.kind === 'text') {
    const deterministic = parseBobDeterministically(bobSource.text, bobSource.fileName || 'upload.txt');
    if (deterministic.rows.length > 0 && deterministic.confidence === 'high') {
      return {
        result: {
          bob: {
            rows: deterministic.rows,
            rowCount: deterministic.rows.length,
            note: deterministic.note,
          },
        },
        metrics: {
          totalMs: Date.now() - t0,
          resolveSourceMs,
          extractMs: 0,
          mode,
          usedTextSource: true,
          parserPath: 'deterministic',
        },
      };
    }

    const extractStart = Date.now();
    const extraction = await extractBobFromText(bobSource.text);
    extractMs = Date.now() - extractStart;
    return {
      result: {
        bob: {
          rows: extraction.rows,
          rowCount: extraction.rowCount,
          note: extraction.note,
        },
      },
      metrics: {
        totalMs: Date.now() - t0,
        resolveSourceMs,
        extractMs,
        mode,
        usedTextSource: true,
        parserPath: 'ai-text',
      },
    };
  }

  const extractStart = Date.now();
  const extraction = await extractBobFromPdf(bobSource.pdfBase64);
  extractMs = Date.now() - extractStart;

  return {
    result: {
      bob: {
        rows: extraction.rows,
        rowCount: extraction.rowCount,
        note: extraction.note,
      },
    },
    metrics: {
      totalMs: Date.now() - t0,
      resolveSourceMs,
      extractMs,
      mode,
      usedTextSource: false,
      parserPath: 'ai-pdf',
    },
  };
}

async function resolveBobSource(
  source: Record<string, unknown>,
): Promise<{ kind: 'text'; text: string; fileName?: string } | { kind: 'pdf'; pdfBase64: string; fileName?: string }> {
  const fileName = typeof source.fileName === 'string' ? source.fileName : undefined;

  if (typeof source.textContent === 'string' && source.textContent.trim().length > 0) {
    return { kind: 'text', text: source.textContent, fileName };
  }

  if (typeof source.gcsPath === 'string' && source.gcsPath.trim().length > 0) {
    const [buffer] = await getAdminStorage().bucket().file(source.gcsPath).download();
    if (looksLikePdfFileName(fileName)) {
      return { kind: 'pdf', pdfBase64: pdfToBase64(buffer), fileName };
    }
    const text = new TextDecoder().decode(buffer);
    if (text.trim().length === 0) {
      throw new Error('File is empty.');
    }
    return { kind: 'text', text, fileName };
  }

  if (typeof source.base64 === 'string' && source.base64.trim().length > 0) {
    if (looksLikePdfFileName(fileName)) {
      return { kind: 'pdf', pdfBase64: source.base64, fileName };
    }
    const decoded = Buffer.from(source.base64, 'base64').toString('utf-8');
    if (decoded.trim().length > 0) {
      return { kind: 'text', text: decoded, fileName };
    }
    return { kind: 'pdf', pdfBase64: source.base64, fileName };
  }

  if (typeof source.url === 'string' && source.url.trim().length > 0) {
    const fileRes = await fetch(source.url, { signal: AbortSignal.timeout(BLOB_FETCH_TIMEOUT_MS) });
    if (!fileRes.ok) {
      throw new Error('Failed to retrieve uploaded file.');
    }
    const contentType = (fileRes.headers.get('content-type') || '').toLowerCase();
    const arrayBuffer = await fileRes.arrayBuffer();
    const isPdf =
      contentType.includes('application/pdf') ||
      looksLikePdfFileName(fileName) ||
      source.url.toLowerCase().includes('.pdf');

    if (isPdf) {
      return { kind: 'pdf', pdfBase64: pdfToBase64(Buffer.from(arrayBuffer)), fileName };
    }

    const text = new TextDecoder().decode(arrayBuffer);
    if (text.trim().length === 0) {
      throw new Error('File is empty.');
    }
    return { kind: 'text', text, fileName };
  }

  throw new Error('No file source provided for ingestion job.');
}

function looksLikePdfFileName(fileName?: string): boolean {
  return !!fileName && fileName.toLowerCase().endsWith('.pdf');
}

async function resolvePdfBase64(source: Record<string, unknown>): Promise<string> {
  if (typeof source.gcsPath === 'string' && source.gcsPath.trim().length > 0) {
    const [buffer] = await getAdminStorage().bucket().file(source.gcsPath).download();
    return pdfToBase64(buffer);
  }

  if (typeof source.base64 === 'string' && source.base64.trim().length > 0) {
    return source.base64;
  }

  if (typeof source.url === 'string' && source.url.trim().length > 0) {
    const fileRes = await fetch(source.url, { signal: AbortSignal.timeout(BLOB_FETCH_TIMEOUT_MS) });
    if (!fileRes.ok) {
      throw new Error('Failed to retrieve uploaded file.');
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    return pdfToBase64(Buffer.from(arrayBuffer));
  }

  throw new Error('No file source provided for ingestion job.');
}
