/**
 * A single beneficiary on an insurance policy.
 */
export interface Beneficiary {
  name: string;
  relationship?: string;  // e.g. "Spouse", "Child" -- optional
  percentage?: number;     // e.g. 25 -- optional
  irrevocable?: boolean | null;
  type: 'primary' | 'contingent';
}

/**
 * Extracted data from an insurance application PDF.
 * Fields are nullable because any given application may not contain all fields.
 */
export interface ExtractedApplicationData {
  policyType: 'IUL' | 'Term Life' | 'Whole Life' | 'Mortgage Protection' | 'Accidental' | 'Other' | null;
  policyNumber: string | null;
  insuranceCompany: string | null;
  policyOwner: string | null;
  insuredName: string | null;
  beneficiaries: Beneficiary[] | null;
  coverageAmount: number | null;
  premiumAmount: number | null;
  premiumFrequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual' | null;
  renewalDate: string | null;
  insuredEmail: string | null;
  insuredPhone: string | null;
  insuredDateOfBirth: string | null;
  insuredState: string | null;
  effectiveDate: string | null;
}

/**
 * Response from the /api/parse-application endpoint.
 */
export interface ParseApplicationResponse {
  success: boolean;
  data?: ExtractedApplicationData;
  error?: string;
  /** Number of pages extracted from the PDF */
  pageCount?: number;
  /** Confidence note from the LLM (e.g. "some fields could not be found") */
  note?: string;
  /** Optional timing breakdown for observability */
  timings?: {
    totalMs: number;
    sourceMs?: number;
    extractMs?: number;
    textExtractMs?: number;
    parserPath?: 'ai-pdf' | 'ai-text';
  };
}

/**
 * v3 ingestion API response contracts.
 * These are additive so existing v2 consumers remain unchanged.
 */
export type { IngestionV3FieldEvidence, IngestionV3FieldEvidenceMap, IngestionV3JobRecord, IngestionV3Metrics, IngestionV3Mode, IngestionV3ResultPayload, IngestionV3Status } from './ingestion-v3-types';
export type { IngestionV3ErrorCode, IngestionV3ErrorDetails } from './ingestion-v3-errors';

export interface IngestionV3SubmitJobResponse {
  success: boolean;
  jobId?: string;
  status?: import('./ingestion-v3-types').IngestionV3Status;
  error?: import('./ingestion-v3-errors').IngestionV3ErrorDetails;
}

export interface IngestionV3JobStatusResponse {
  success: boolean;
  job?: import('./ingestion-v3-types').IngestionV3JobRecord;
  error?: import('./ingestion-v3-errors').IngestionV3ErrorDetails;
}
