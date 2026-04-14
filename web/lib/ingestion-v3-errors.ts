export const INGESTION_V3_ERROR_CODES = {
  UPLOAD_NOT_FOUND: 'UPLOAD_NOT_FOUND',
  UPLOAD_SOURCE_INVALID: 'UPLOAD_SOURCE_INVALID',
  TASK_AUTH_INVALID: 'TASK_AUTH_INVALID',
  TASK_ENQUEUE_FAILED: 'TASK_ENQUEUE_FAILED',
  IMPORT_CANCELLED: 'IMPORT_CANCELLED',
  USER_CANCELLED: 'USER_CANCELLED',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  JOB_LOCK_CONFLICT: 'JOB_LOCK_CONFLICT',
  SOURCE_FETCH_FAILED: 'SOURCE_FETCH_FAILED',
  SOURCE_UNSUPPORTED_TYPE: 'SOURCE_UNSUPPORTED_TYPE',
  DOCUMENT_NOT_APPLICATION: 'DOCUMENT_NOT_APPLICATION',
  CLAUDE_TIMEOUT: 'CLAUDE_TIMEOUT',
  CLAUDE_REQUEST_FAILED: 'CLAUDE_REQUEST_FAILED',
  CLAUDE_SCHEMA_INVALID: 'CLAUDE_SCHEMA_INVALID',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  EXTRACTION_EMPTY_RESULT: 'EXTRACTION_EMPTY_RESULT',
  STORAGE_WRITE_FAILED: 'STORAGE_WRITE_FAILED',
  MAX_RETRIES_EXHAUSTED: 'MAX_RETRIES_EXHAUSTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type IngestionV3ErrorCode = (typeof INGESTION_V3_ERROR_CODES)[keyof typeof INGESTION_V3_ERROR_CODES];

export interface IngestionV3ErrorDetails {
  code: IngestionV3ErrorCode;
  message: string;
  retryable: boolean;
  terminal: boolean;
}

const RETRYABLE_CODES: ReadonlySet<IngestionV3ErrorCode> = new Set([
  INGESTION_V3_ERROR_CODES.TASK_ENQUEUE_FAILED,
  INGESTION_V3_ERROR_CODES.SOURCE_FETCH_FAILED,
  INGESTION_V3_ERROR_CODES.CLAUDE_TIMEOUT,
  INGESTION_V3_ERROR_CODES.CLAUDE_REQUEST_FAILED,
  INGESTION_V3_ERROR_CODES.STORAGE_WRITE_FAILED,
  INGESTION_V3_ERROR_CODES.INTERNAL_ERROR,
]);

const TERMINAL_CODES: ReadonlySet<IngestionV3ErrorCode> = new Set([
  INGESTION_V3_ERROR_CODES.UPLOAD_NOT_FOUND,
  INGESTION_V3_ERROR_CODES.UPLOAD_SOURCE_INVALID,
  INGESTION_V3_ERROR_CODES.TASK_AUTH_INVALID,
  INGESTION_V3_ERROR_CODES.IMPORT_CANCELLED,
  INGESTION_V3_ERROR_CODES.USER_CANCELLED,
  INGESTION_V3_ERROR_CODES.JOB_NOT_FOUND,
  INGESTION_V3_ERROR_CODES.SOURCE_UNSUPPORTED_TYPE,
  INGESTION_V3_ERROR_CODES.DOCUMENT_NOT_APPLICATION,
  INGESTION_V3_ERROR_CODES.CLAUDE_SCHEMA_INVALID,
  INGESTION_V3_ERROR_CODES.VALIDATION_FAILED,
  INGESTION_V3_ERROR_CODES.EXTRACTION_EMPTY_RESULT,
  INGESTION_V3_ERROR_CODES.MAX_RETRIES_EXHAUSTED,
]);

export function isRetryableIngestionV3ErrorCode(code: IngestionV3ErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}

export function isTerminalIngestionV3ErrorCode(code: IngestionV3ErrorCode): boolean {
  return TERMINAL_CODES.has(code);
}

export function toIngestionV3ErrorDetails(
  code: IngestionV3ErrorCode,
  message: string,
  options?: { retryable?: boolean; terminal?: boolean },
): IngestionV3ErrorDetails {
  const retryable = options?.retryable ?? isRetryableIngestionV3ErrorCode(code);
  const terminal = options?.terminal ?? isTerminalIngestionV3ErrorCode(code);

  return {
    code,
    message,
    retryable,
    terminal,
  };
}

export class IngestionV3Error extends Error {
  public readonly details: IngestionV3ErrorDetails;

  constructor(code: IngestionV3ErrorCode, message: string, options?: { retryable?: boolean; terminal?: boolean }) {
    super(message);
    this.name = 'IngestionV3Error';
    this.details = toIngestionV3ErrorDetails(code, message, options);
  }
}
