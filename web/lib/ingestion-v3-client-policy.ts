import type { ExtractedApplicationData } from './types';

export const V3_CLIENT_POLICY = {
  hardResolveMs: 120_000,
  pollIntervalMs: 1_500,
  maxUploadBytes: 16 * 1024 * 1024,
  gcsUploadTimeoutMs: 30_000,
  stepTimeoutMs: 25_000,
  statusTimeoutMs: 12_000,
  progressSlaMs: 15_000,
  usableTargetMs: 30_000,
  stallThresholdMs: 25_000,
} as const;

const FALLBACK_JOB_ERROR_CODES = new Set([
  'INTERNAL_ERROR',
  'CLAUDE_SCHEMA_INVALID',
  'TASK_ENQUEUE_FAILED',
  'CLAUDE_TIMEOUT',
  'CLAUDE_REQUEST_FAILED',
  'MAX_RETRIES_EXHAUSTED',
]);

export function isDirectParserFallbackEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_DIRECT_PARSE_FALLBACK !== 'false';
}

export function shouldFallbackForJobFailure(errorCode: string | null | undefined): boolean {
  if (!errorCode) return false;
  return FALLBACK_JOB_ERROR_CODES.has(errorCode);
}

export function shouldFallbackForThrownMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    message.includes('Upload failed (403)') ||
    message.includes('Invalid JWT Signature') ||
    message.includes('SignatureDoesNotMatch') ||
    message.includes('Failed to fetch') ||
    message.includes('Status check timed out')
  );
}

export function mapIngestionErrorToUserMessage(errorCode: string | null | undefined, fallbackMessage: string): string {
  switch (errorCode || '') {
    case 'DOCUMENT_NOT_APPLICATION':
      return 'This file was not recognized as an insurance application. Please upload an application PDF.';
    case 'UPLOAD_SOURCE_INVALID':
      return 'This upload could not be validated. Please try again.';
    case 'UPLOAD_NOT_FOUND':
      return 'Uploaded file could not be found. Please re-upload and try again.';
    case 'VALIDATION_FAILED':
      return 'We found too little usable application data in this file. Please review and fill missing fields manually.';
    case 'MAX_RETRIES_EXHAUSTED':
      return 'Parsing retried several times and did not complete. Please retry the file.';
    default:
      return fallbackMessage;
  }
}

export function computeApplicationCoreCompleteness(data: ExtractedApplicationData): {
  coreFieldsPresent: number;
  coreFieldsTotal: number;
  ratio: number;
  carrierDetected: boolean;
  resultType: 'full' | 'partial' | 'error';
} {
  const [firstName, ...rest] = (data.insuredName || '').trim().split(/\s+/);
  const lastName = rest.join(' ').trim();
  const checks: Array<string | number | null | undefined> = [
    firstName,
    lastName,
    data.insuredPhone,
    data.insuredEmail,
    data.insuredDateOfBirth,
    data.insuranceCompany,
    data.policyType,
    data.coverageAmount,
    data.premiumAmount,
  ];

  const coreFieldsPresent = checks.reduce((acc, value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? acc + 1 : acc;
    if (typeof value === 'string') return value.trim().length > 0 ? acc + 1 : acc;
    return value ? acc + 1 : acc;
  }, 0);

  const coreFieldsTotal = checks.length;
  const ratio = coreFieldsTotal > 0 ? coreFieldsPresent / coreFieldsTotal : 0;
  const carrierDetected = !!(data.insuranceCompany && data.insuranceCompany.trim().length > 0);

  let resultType: 'full' | 'partial' | 'error' = 'error';
  if (coreFieldsPresent >= 7) {
    resultType = 'full';
  } else if (coreFieldsPresent >= 4) {
    resultType = 'partial';
  }

  return {
    coreFieldsPresent,
    coreFieldsTotal,
    ratio,
    carrierDetected,
    resultType,
  };
}
