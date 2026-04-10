import type { ExtractedApplicationData } from './types';

export const V3_CLIENT_POLICY = {
  maxUploadBytes: 16 * 1024 * 1024,
  hardResolveMs: 90_000,
  pollIntervalMs: 1_500,
  statusTimeoutMs: 8_000,
  stepTimeoutMs: 90_000,
  gcsUploadTimeoutMs: 120_000,
  stallThresholdMs: 30_000,
  progressSlaMs: 10_000,
  usableTargetMs: 45_000,
} as const;

export function isDirectParserFallbackEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_INGESTION_V3_ENABLE_FALLBACK || '').trim().toLowerCase();
  // Default ON for production safety; set to "false" for strict primary-path testing.
  if (!raw) return true;
  return raw !== 'false';
}

const PROCESSOR_FAILURE_FALLBACK_CODES = new Set([
  'INTERNAL_ERROR',
  'CLAUDE_SCHEMA_INVALID',
  'MAX_RETRIES_EXHAUSTED',
]);

const SIGNING_FAILURE_SNIPPETS = [
  'invalid jwt signature',
  'signaturedoesnotmatch',
  'upload url generation timed out',
  'upload failed (403)',
];

const USER_MESSAGE_BY_ERROR_CODE: Record<string, string> = {
  UPLOAD_SOURCE_INVALID: 'This file is invalid. Please upload a PDF under 16 MB.',
  UPLOAD_NOT_FOUND: 'We could not find the uploaded file. Please upload again.',
  TASK_ENQUEUE_FAILED: 'Processing is temporarily unavailable. Please try again.',
  CLAUDE_TIMEOUT: 'Parsing timed out. Please try again.',
  CLAUDE_REQUEST_FAILED: 'Parsing is temporarily unavailable. Please try again shortly.',
  CLAUDE_SCHEMA_INVALID: 'We had trouble reading this file. Please review missing fields.',
  MAX_RETRIES_EXHAUSTED: 'Processing took too many attempts. Please retry this file.',
  SOURCE_UNSUPPORTED_TYPE: 'This file type is not supported for this import.',
  VALIDATION_FAILED: 'We could not safely validate extracted data from this file.',
  INTERNAL_ERROR: 'We could not fully read this file. Please review missing fields.',
};

export function shouldFallbackForJobFailure(code: string | undefined): boolean {
  if (!code) return false;
  return PROCESSOR_FAILURE_FALLBACK_CODES.has(code);
}

export function shouldFallbackForThrownMessage(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes('timed out') || lower.includes('timeout')) return true;
  return SIGNING_FAILURE_SNIPPETS.some((snippet) => lower.includes(snippet));
}

export function mapIngestionErrorToUserMessage(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  return USER_MESSAGE_BY_ERROR_CODE[code] || fallback;
}

export function computeApplicationCoreCompleteness(data: ExtractedApplicationData) {
  const [firstName, ...rest] = (data.insuredName || '').trim().split(/\s+/);
  const lastName = rest.join(' ').trim();
  const values = {
    firstName: firstName || null,
    lastName: lastName || null,
    phone: data.insuredPhone,
    email: data.insuredEmail,
    dateOfBirth: data.insuredDateOfBirth,
    carrier: data.insuranceCompany,
    policyType: data.policyType,
    coverageAmount: data.coverageAmount,
    premiumAmount: data.premiumAmount,
  };

  const total = 9;
  const present = Object.values(values).reduce((count, value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? count + 1 : count;
    if (typeof value === 'string') return value.trim() ? count + 1 : count;
    return value ? count + 1 : count;
  }, 0);
  const hasName = !!values.firstName || !!values.lastName;
  const ratio = total > 0 ? present / total : 0;
  const resultType: 'full' | 'partial' | 'error' = hasName && present >= 7 ? 'full' : hasName && present >= 4 ? 'partial' : 'error';

  return {
    coreFieldsTotal: total,
    coreFieldsPresent: present,
    hasName,
    ratio,
    resultType,
    carrierDetected: data.insuranceCompany || null,
  };
}
