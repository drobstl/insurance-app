import 'server-only';

import { randomUUID } from 'crypto';
import { extractBobFromPdf } from './bob-extractor';
import { enqueueIngestionV3ProcessJob } from './cloud-tasks';
import { isRetryableExtractionError } from './extraction-errors';
import { getAdminStorage } from './firebase-admin';
import {
  updateBatchFileStatus,
  checkBatchCompletion,
  triggerRetryRound,
  finalizeBatch,
} from './ingestion-v3-batch-store';
import { extractBobStructuredV3 } from './ingestion-v3-csv';
import { IngestionV3Error } from './ingestion-v3-errors';
import { extractApplicationPdfV3 } from './ingestion-v3-pdf';
import {
  trackIngestionV3ProcessFailed,
  trackIngestionV3ProcessRequeued,
  trackIngestionV3ProcessStarted,
  trackIngestionV3ProcessSucceeded,
  trackIngestionV3TaskEnqueued,
  trackIngestionV3TaskEnqueueFailed,
} from './ingestion-v3-telemetry';
import { validateAndNormalizeV3BobResult } from './ingestion-v3-validate';
import {
  completeIngestionV3Job,
  failIngestionV3Job,
  lockIngestionV3JobForProcessing,
  requeueIngestionV3JobWithBackoff,
  setIngestionV3JobError,
  type LockIngestionV3JobResult,
} from './ingestion-v3-store';
import type { IngestionV3ErrorDetails } from './ingestion-v3-errors';
import type { IngestionV3JobRecord, IngestionV3Metrics, IngestionV3ResultPayload } from './ingestion-v3-types';

interface ProcessIngestionV3JobResult {
  status: 'processed' | 'skipped';
  reason?: Extract<LockIngestionV3JobResult, { ok: false }>['reason'];
}

const RETRY_SCHEDULE_SECONDS = [5, 20, 60] as const;

export async function processIngestionV3Job(jobId: string): Promise<ProcessIngestionV3JobResult> {
  const processingToken = randomUUID();
  const lock = await lockIngestionV3JobForProcessing(jobId, processingToken);
  if (!lock.ok) {
    return { status: 'skipped', reason: lock.reason };
  }
  trackIngestionV3ProcessStarted({
    jobId,
    mode: lock.job.mode,
    attempts: lock.job.attempts,
    maxAttempts: lock.job.maxAttempts,
  });

  const t0 = Date.now();

  try {
    const sourceStart = Date.now();
    const source = await downloadSource(lock.job.gcsPath);
    const sourceFetchMs = Date.now() - sourceStart;

    const extractStart = Date.now();
    const result = await runExtractionBranch(lock.job, source);
    const extractionMs = Date.now() - extractStart;

    const validateStart = Date.now();
    validateIngestionV3Result(result.payload, lock.job.mode);
    const validationMs = Date.now() - validateStart;

    const metrics: IngestionV3Metrics = {
      totalMs: Date.now() - t0,
      sourceFetchMs,
      extractionMs,
      validationMs,
      parserPath: result.metricsParserPath,
    };

    await completeIngestionV3Job(jobId, processingToken, {
      status: 'review_ready',
      result: result.payload,
      metrics: metrics as unknown as Record<string, unknown>,
    });
    trackIngestionV3ProcessSucceeded({
      jobId,
      mode: lock.job.mode,
      status: 'review_ready',
      metrics,
      attempts: lock.job.attempts,
      maxAttempts: lock.job.maxAttempts,
    });

    // Fire-and-forget: update batch progress doc if this job belongs to a batch
    const loadedRows = result.payload.bob?.rows?.length ?? (result.payload.application ? 1 : 0);
    await reportToBatchDoc(lock.job.agentId, lock.job.batchId, jobId, {
      status: 'succeeded',
      loadedRows,
    });

    return { status: 'processed' };
  } catch (error) {
    console.error('[ingestion-v3-processor] Raw extraction error:', error instanceof Error ? { message: error.message, stack: error.stack } : error);
    const classified = classifyProcessorError(error);
    const diagnosticCategory = classifyProcessorDiagnosticCategory(error, classified);
    if (classified.retryable && lock.job.attempts < lock.job.maxAttempts) {
      const delaySeconds = getRetryDelaySeconds(lock.job.attempts);
      const retryAfterMs = Date.now() + delaySeconds * 1000;
      const safeError = toUserSafeError(classified);
      await requeueIngestionV3JobWithBackoff(jobId, processingToken, safeError, retryAfterMs);
      trackIngestionV3ProcessRequeued({
        jobId,
        mode: lock.job.mode,
        attempts: lock.job.attempts,
        maxAttempts: lock.job.maxAttempts,
        retryAfterMs,
        error: safeError,
      });

      try {
        await enqueueIngestionV3ProcessJob(jobId, { delaySeconds });
        trackIngestionV3TaskEnqueued({
          jobId,
          mode: lock.job.mode,
          delayedSeconds: delaySeconds,
        });
      } catch (enqueueError) {
        const enqueueTypedError = toUserSafeError({
          code: 'TASK_ENQUEUE_FAILED',
          message: enqueueError instanceof Error ? enqueueError.message : 'Failed to dispatch retry task.',
          retryable: true,
          terminal: false,
        });
        await setIngestionV3JobError(
          jobId,
          enqueueTypedError,
          'failed',
        );
        trackIngestionV3TaskEnqueueFailed({
          jobId,
          mode: lock.job.mode,
          error: enqueueTypedError,
        });
      }
      return { status: 'processed' };
    }

    const terminalError =
      classified.retryable && lock.job.attempts >= lock.job.maxAttempts
        ? toUserSafeError({
            code: 'MAX_RETRIES_EXHAUSTED',
            message: 'Ingestion retry attempts were exhausted.',
            retryable: false,
            terminal: true,
          })
        : toUserSafeError(classified);

    await failIngestionV3Job(jobId, processingToken, terminalError);
    trackIngestionV3ProcessFailed({
      jobId,
      mode: lock.job.mode,
      attempts: lock.job.attempts,
      maxAttempts: lock.job.maxAttempts,
      error: terminalError,
      diagnosticCategory,
    });
    console.error('[ingestion-v3-alert] process failed', {
      jobId,
      code: terminalError.code,
      diagnosticCategory,
      retryable: terminalError.retryable,
      terminal: terminalError.terminal,
    });

    // Fire-and-forget: update batch progress doc if this job belongs to a batch.
    // For batch-level retry: mark as retryable if the original error was transient
    // (classified.retryable) or a catch-all internal error, even though the
    // processor exhausted its own retries. Non-retryable at batch level: bad file
    // format, unsupported type, validation failures — these won't succeed on retry.
    const batchRetryable = classified.retryable || classified.code === 'INTERNAL_ERROR';
    await reportToBatchDoc(lock.job.agentId, lock.job.batchId, jobId, {
      status: 'failed',
      error: terminalError.message,
      retryable: batchRetryable,
    });

    return { status: 'processed' };
  }
}

async function downloadSource(gcsPath: string): Promise<{ buffer: Buffer; fileName?: string; contentType?: string }> {
  const file = getAdminStorage().bucket().file(gcsPath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new IngestionV3Error('UPLOAD_NOT_FOUND', 'Uploaded source file does not exist.', {
      retryable: false,
      terminal: true,
    });
  }

  const [metadata, buffer] = await Promise.all([file.getMetadata(), file.download().then(([b]) => b)]);
  const fileName = gcsPath.split('/').pop();
  const contentType = metadata?.[0]?.contentType;
  return { buffer, fileName, contentType };
}

async function runExtractionBranch(
  job: IngestionV3JobRecord,
  source: { buffer: Buffer; fileName?: string; contentType?: string },
): Promise<{ payload: IngestionV3ResultPayload; metricsParserPath: IngestionV3Metrics['parserPath'] }> {
  const inferredContentType = (job.contentType || source.contentType || '').toLowerCase();
  const fileName = (job.fileName || source.fileName || '').toLowerCase();
  const isPdf =
    inferredContentType.includes('application/pdf') ||
    fileName.endsWith('.pdf') ||
    job.gcsPath.toLowerCase().endsWith('.pdf');

  if (job.mode === 'application') {
    if (!isPdf) {
      throw new IngestionV3Error('SOURCE_UNSUPPORTED_TYPE', 'Application ingestion requires a PDF source.', {
        retryable: false,
        terminal: true,
      });
    }

    const extraction = await extractApplicationPdfV3(source.buffer.toString('base64'));

    return {
      payload: {
        application: extraction,
      },
      metricsParserPath: 'ai-pdf',
    };
  }

  if (isPdf) {
    const pdfExtraction = await extractBobFromPdf(source.buffer.toString('base64'));
    return {
      payload: {
        bob: validateAndNormalizeV3BobResult({
          rows: pdfExtraction.rows.map(mapBobRow),
          rowCount: pdfExtraction.rowCount,
          note: pdfExtraction.note,
        }),
      },
      metricsParserPath: 'ai-pdf',
    };
  }
  const structured = await extractBobStructuredV3({
    fileBuffer: source.buffer,
    fileName: job.fileName || source.fileName,
    contentType: inferredContentType,
  });
  return {
    payload: {
      bob: structured.result,
    },
    metricsParserPath: structured.parserPath,
  };
}

function mapBobRow(row: {
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  policyType: string;
  policyNumber: string;
  carrier: string;
  premium: string;
  coverageAmount: string;
}) {
  const [firstName, ...rest] = (row.name || '').trim().split(/\s+/);
  const lastName = rest.join(' ').trim();
  return {
    firstName: firstName || row.name || '',
    lastName,
    phone: toNullableString(row.phone),
    email: toNullableString(row.email),
    dateOfBirth: toNullableString(row.dateOfBirth),
    policyType: toNullableString(row.policyType),
    policyNumber: toNullableString(row.policyNumber),
    carrier: toNullableString(row.carrier),
    premiumAmount: toNullableNumber(row.premium),
    coverageAmount: toNullableNumber(row.coverageAmount),
  };
}

function validateIngestionV3Result(result: IngestionV3ResultPayload, mode: IngestionV3JobRecord['mode']) {
  if (mode === 'application') {
    if (!result.application) {
      throw new IngestionV3Error('VALIDATION_FAILED', 'Application extraction payload is missing.', {
        retryable: false,
        terminal: true,
      });
    }
    return;
  }

  if (!result.bob) {
    throw new IngestionV3Error('VALIDATION_FAILED', 'BOB extraction payload is missing.', {
      retryable: false,
      terminal: true,
    });
  }
  if (!Array.isArray(result.bob.rows)) {
    throw new IngestionV3Error('VALIDATION_FAILED', 'BOB rows must be an array.', {
      retryable: false,
      terminal: true,
    });
  }
}

function classifyProcessorError(error: unknown): IngestionV3ErrorDetails {
  if (error instanceof IngestionV3Error) return error.details;
  if (isRetryableExtractionError(error)) {
    const message = error instanceof Error ? error.message : 'Claude extraction request failed.';
    const lower = message.toLowerCase();
    return {
      code: lower.includes('timeout') || lower.includes('timed out') ? 'CLAUDE_TIMEOUT' : 'CLAUDE_REQUEST_FAILED',
      message,
      retryable: true,
      terminal: false,
    };
  }

  const message = error instanceof Error ? error.message : 'Internal processing error.';
  if (message.toLowerCase().includes('parse ai response')) {
    return {
      code: 'CLAUDE_SCHEMA_INVALID',
      message,
      retryable: false,
      terminal: true,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message,
    retryable: false,
    terminal: true,
  };
}

function classifyProcessorDiagnosticCategory(error: unknown, classified: IngestionV3ErrorDetails): string {
  if (classified.code !== 'INTERNAL_ERROR') return classified.code;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes('storage') || message.includes('bucket') || message.includes('download')) return 'INTERNAL_STORAGE_IO';
  if (message.includes('json') || message.includes('parse')) return 'INTERNAL_PARSE_ERROR';
  if (message.includes('anthropic') || message.includes('claude')) return 'INTERNAL_LLM_ERROR';
  if (message.includes('timeout')) return 'INTERNAL_TIMEOUT';
  return 'INTERNAL_UNKNOWN';
}

function getRetryDelaySeconds(attemptNumber: number): number {
  const idx = Math.max(0, Math.min(RETRY_SCHEDULE_SECONDS.length - 1, attemptNumber - 1));
  return RETRY_SCHEDULE_SECONDS[idx];
}

function toUserSafeError(error: IngestionV3ErrorDetails): IngestionV3ErrorDetails {
  const messageByCode: Partial<Record<IngestionV3ErrorDetails['code'], string>> = {
    CLAUDE_TIMEOUT: 'Extraction timed out. Retrying automatically.',
    CLAUDE_REQUEST_FAILED: 'Extraction service is temporarily unavailable. Retrying automatically.',
    SOURCE_FETCH_FAILED: 'Uploaded file could not be retrieved.',
    SOURCE_UNSUPPORTED_TYPE: 'This file type is not supported for this ingestion mode.',
    CLAUDE_SCHEMA_INVALID: 'Extraction returned an invalid response format.',
    VALIDATION_FAILED: 'Extracted data did not pass validation.',
    TASK_ENQUEUE_FAILED: 'Failed to schedule processing retry.',
    MAX_RETRIES_EXHAUSTED: 'Processing failed after maximum retry attempts.',
    INTERNAL_ERROR: 'An internal processing error occurred.',
  };

  return {
    ...error,
    message: messageByCode[error.code] || error.message || 'Processing failed.',
  };
}

/**
 * Fire-and-forget batch doc update. Logs errors but never throws.
 *
 * After updating the file status, checks whether the batch is now complete.
 * If complete on round 0 with retryable failures, triggers automatic retry.
 * If complete on round 1 (or no retryable failures), finalizes the batch.
 *
 * Race condition guard: triggerRetryRound and finalizeBatch both use Firestore
 * transactions. When two processors finish at nearly the same time, both will
 * attempt the transaction — the second will re-read the batch doc, see that
 * the state has already changed, and return without double-triggering.
 */
async function reportToBatchDoc(
  agentId: string | undefined,
  batchId: string | undefined,
  jobId: string,
  patch: { status: 'succeeded'; loadedRows: number } | { status: 'failed'; error: string; retryable: boolean },
): Promise<void> {
  if (!agentId || !batchId) return;

  try {
    await updateBatchFileStatus(agentId, batchId, jobId, patch);

    // Check if the batch is now complete and handle retry/finalization
    const state = await checkBatchCompletion(agentId, batchId);
    if (!state || !state.isComplete) return;

    if (state.retryRound === 0 && state.retryableJobIds.length > 0) {
      // Automatic retry: reset retryable failures and re-enqueue with 30s delay
      const retriedJobIds = await triggerRetryRound(agentId, batchId);
      for (const retryJobId of retriedJobIds) {
        try {
          await enqueueIngestionV3ProcessJob(retryJobId, { delaySeconds: 30 });
        } catch (enqueueErr) {
          console.error(`[ingestion-v3-processor] Failed to re-enqueue job ${retryJobId} for batch retry:`, enqueueErr);
        }
      }
    } else {
      // No retryable failures or already on round 1 — finalize
      await finalizeBatch(agentId, batchId);
    }
  } catch (err) {
    console.error('[ingestion-v3-processor] Batch doc update failed (non-blocking):', err);
  }
}

function toNullableString(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[,$]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
