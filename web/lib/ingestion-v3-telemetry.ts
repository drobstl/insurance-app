import 'server-only';

import type { IngestionV3ErrorDetails } from './ingestion-v3-errors';
import type { IngestionV3Metrics, IngestionV3Mode, IngestionV3Status } from './ingestion-v3-types';

type IngestionV3TelemetryEventName =
  | 'ingestion_v3_job_created'
  | 'ingestion_v3_task_enqueued'
  | 'ingestion_v3_task_enqueue_failed'
  | 'ingestion_v3_process_started'
  | 'ingestion_v3_process_succeeded'
  | 'ingestion_v3_process_requeued'
  | 'ingestion_v3_process_failed'
  | 'ingestion_v3_process_auth_failed';

type IngestionV3TelemetryPayload = Record<string, string | number | boolean | null | undefined>;

function emitTelemetry(event: IngestionV3TelemetryEventName, payload: IngestionV3TelemetryPayload) {
  const entry = {
    event,
    ts: new Date().toISOString(),
    ...payload,
  };
  console.log('[ingestion-v3-telemetry]', JSON.stringify(entry));
}

export function trackIngestionV3JobCreated(params: {
  jobId: string;
  mode: IngestionV3Mode;
  agentId?: string;
  maxAttempts: number;
}) {
  emitTelemetry('ingestion_v3_job_created', {
    job_id: params.jobId,
    mode: params.mode,
    agent_id_present: !!params.agentId,
    max_attempts: params.maxAttempts,
  });
}

export function trackIngestionV3TaskEnqueued(params: {
  jobId: string;
  mode: IngestionV3Mode;
  delayedSeconds?: number;
}) {
  emitTelemetry('ingestion_v3_task_enqueued', {
    job_id: params.jobId,
    mode: params.mode,
    delayed_seconds: params.delayedSeconds ?? 0,
  });
}

export function trackIngestionV3TaskEnqueueFailed(params: {
  jobId: string;
  mode: IngestionV3Mode;
  error: IngestionV3ErrorDetails;
}) {
  emitTelemetry('ingestion_v3_task_enqueue_failed', {
    job_id: params.jobId,
    mode: params.mode,
    error_code: params.error.code,
    retryable: params.error.retryable,
    terminal: params.error.terminal,
    error_message: params.error.message,
  });
}

export function trackIngestionV3ProcessStarted(params: {
  jobId: string;
  mode: IngestionV3Mode;
  attempts: number;
  maxAttempts: number;
}) {
  emitTelemetry('ingestion_v3_process_started', {
    job_id: params.jobId,
    mode: params.mode,
    attempts: params.attempts,
    max_attempts: params.maxAttempts,
  });
}

export function trackIngestionV3ProcessSucceeded(params: {
  jobId: string;
  mode: IngestionV3Mode;
  status: IngestionV3Status;
  metrics: IngestionV3Metrics;
  attempts: number;
  maxAttempts: number;
}) {
  emitTelemetry('ingestion_v3_process_succeeded', {
    job_id: params.jobId,
    mode: params.mode,
    status: params.status,
    attempts: params.attempts,
    max_attempts: params.maxAttempts,
    total_ms: params.metrics.totalMs,
    source_fetch_ms: params.metrics.sourceFetchMs ?? null,
    extraction_ms: params.metrics.extractionMs ?? null,
    validation_ms: params.metrics.validationMs ?? null,
    parser_path: params.metrics.parserPath ?? null,
  });
}

export function trackIngestionV3ProcessRequeued(params: {
  jobId: string;
  mode: IngestionV3Mode;
  attempts: number;
  maxAttempts: number;
  retryAfterMs: number;
  error: IngestionV3ErrorDetails;
}) {
  emitTelemetry('ingestion_v3_process_requeued', {
    job_id: params.jobId,
    mode: params.mode,
    attempts: params.attempts,
    max_attempts: params.maxAttempts,
    retry_after_ms: params.retryAfterMs,
    error_code: params.error.code,
    retryable: params.error.retryable,
    terminal: params.error.terminal,
  });
}

export function trackIngestionV3ProcessFailed(params: {
  jobId: string;
  mode: IngestionV3Mode;
  attempts: number;
  maxAttempts: number;
  error: IngestionV3ErrorDetails;
}) {
  emitTelemetry('ingestion_v3_process_failed', {
    job_id: params.jobId,
    mode: params.mode,
    attempts: params.attempts,
    max_attempts: params.maxAttempts,
    error_code: params.error.code,
    retryable: params.error.retryable,
    terminal: params.error.terminal,
    error_message: params.error.message,
  });
}

export function trackIngestionV3ProcessAuthFailed(params: { message: string }) {
  emitTelemetry('ingestion_v3_process_auth_failed', {
    message: params.message,
  });
}
