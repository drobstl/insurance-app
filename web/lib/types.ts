/**
 * A single beneficiary on an insurance policy.
 */
export interface Beneficiary {
  name: string;
  relationship?: string;  // e.g. "Spouse", "Child" -- optional
  percentage?: number;     // e.g. 25 -- optional
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
}
