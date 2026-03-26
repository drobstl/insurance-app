import type { ExtractedApplicationData } from './types';

export const INGESTION_V3_STATUSES = [
  'queued',
  'uploading',
  'processing',
  'review_ready',
  'saved',
  'failed',
] as const;

export type IngestionV3Status = (typeof INGESTION_V3_STATUSES)[number];
export type IngestionV3Mode = 'application' | 'bob';
export type IngestionV3UploadPurpose = 'application' | 'bob';

export interface IngestionV3FieldEvidence {
  /**
   * 1-indexed source page for PDF evidence. Null for non-paginated sources.
   */
  page: number | null;
  /**
   * Exact source snippet used to support extracted value.
   */
  snippet: string | null;
  /**
   * 0-1 confidence score for the extracted field.
   */
  confidence: number | null;
}

export type IngestionV3FieldEvidenceMap = Partial<
  Record<keyof ExtractedApplicationData | 'applicantName' | 'faceAmount' | 'annualPremium' | 'modalPremium', IngestionV3FieldEvidence>
>;

export interface IngestionV3ApplicationResult {
  data: ExtractedApplicationData;
  evidence: IngestionV3FieldEvidenceMap;
  note?: string;
}

export interface IngestionV3BobRow {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  policyType: string | null;
  policyNumber: string | null;
  carrier: string | null;
  premiumAmount: number | null;
  coverageAmount: number | null;
}

export interface IngestionV3BobResult {
  rows: IngestionV3BobRow[];
  rowCount: number;
  note?: string;
}

export interface IngestionV3ResultPayload {
  application?: IngestionV3ApplicationResult;
  bob?: IngestionV3BobResult;
}

export interface IngestionV3Metrics {
  totalMs: number;
  queueWaitMs?: number;
  sourceFetchMs?: number;
  extractionMs?: number;
  validationMs?: number;
  parserPath?: 'ai-pdf' | 'ai-text' | 'deterministic' | 'csv-parser';
}

export interface IngestionV3JobRecord {
  id: string;
  mode: IngestionV3Mode;
  status: IngestionV3Status;
  agentId?: string;
  gcsPath: string;
  fileName?: string;
  contentType?: string;
  attempts: number;
  maxAttempts: number;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    terminal?: boolean;
  };
  result?: IngestionV3ResultPayload;
  metrics?: IngestionV3Metrics;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  retryAfter?: string;
}
