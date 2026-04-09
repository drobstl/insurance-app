import Anthropic from '@anthropic-ai/sdk';
import { ExtractedApplicationData, Beneficiary } from './types';
import { isRetryableExtractionError } from './extraction-errors';

interface ApplicationExtractionOptions {
  fileSizeBytes?: number;
}

interface ExtractionRunConfig {
  maxTokens: number;
  maxRetries: number;
}

const LARGE_PDF_THRESHOLD_BYTES = 5 * 1024 * 1024;
const SMALL_PDF_THRESHOLD_BYTES = 2 * 1024 * 1024;
const FAST_PATH_MAX_BYTES = 4 * 1024 * 1024;
const MIN_FAST_MODE_SIGNALS = 4;

const SYSTEM_PROMPT = `You are an expert insurance application document parser. You extract structured data from insurance application PDFs by examining the full document directly.

You are viewing a complete insurance application PDF. Use the visible form layout, labels, and filled-in values to extract the requested fields. Examine ALL pages including any addendum or supplemental pages.

ROLE DISAMBIGUATION (extremely important):
- "Proposed Insured" / "Applicant" / "Insured" = the person whose life is being insured. This is the MAIN person on the application.
- "Owner" / "Policy Owner" = the person who owns the policy (often the same as the insured, but can be different — e.g. a parent or spouse).
- "Primary Beneficiary" = the person who receives the death benefit. This is NOT the insured. The beneficiary's name often appears with a "Relationship" field (e.g. "Spouse", "Brother", "Child").
- Do NOT confuse these roles. If a name appears next to "Beneficiary" or has a relationship label, it is the BENEFICIARY, not the insured.

FIELD EXTRACTION RULES:

"insuredName": The "Proposed Insured" or "Applicant" — the person whose life is insured. Usually appears near the TOP of page 1. It is NOT the beneficiary. Include first, middle, and last name if available. Strip any trailing "X" characters (form checkboxes).

"policyOwner": The "Owner" of the policy. Often the same person as the insured.

"beneficiaries": The "Primary Beneficiary" and/or "Contingent Beneficiary". Each must have a proper NAME (not just "Brother" or "Spouse"). The relationship label goes in the "relationship" field. Look in the main application AND any addendum pages with structured beneficiary tables.

"coverageAmount": The "Face Amount", "Death Benefit", "Coverage Amount", or "Specified Amount" in dollars. This is the actual policy coverage, NOT any maximum limit in legal disclaimers. Return as a number (e.g. 191000).

"premiumAmount": The "Modal Premium", "Planned Premium", or "Scheduled Premium". Return as a number.

"premiumFrequency": Determined by the payment mode. Common indicators: "Monthly"/"Bank Draft"/"MON" = "monthly", "Quarterly"/"QTR" = "quarterly", "Semi-Annual"/"SA" = "semi-annual", "Annual"/"ANN" = "annual".

"policyNumber": The application/case/policy/certificate number. Often a repeating reference number on multiple pages or near "Policy Number:", "Application Number:", "Certificate Number:". Do NOT confuse with SS#, DL#, agent numbers, or form numbers (like "ICC18-AA3487").

"policyType": Classify the product:
  - "Mortgage Protection" = plans named "Home Certainty", "Mortgage Protection", "MP", or applications with mortgage sections
  - "IUL" = "Indexed Universal Life", "IUL"
  - "Term Life" = "Term", "Level Term", "Return of Premium Term"
  - "Whole Life" = "Whole Life", "WL", "Ordinary Life"
  - "Accidental" = "Accidental Death", "AD&D"
  - "Other" = only if the product doesn't fit any category above

"insuranceCompany": The carrier's common/short name. Common mappings:
  - "American-Amicable Life Insurance Company of Texas" → "American-Amicable"
  - "Mutual of Omaha Insurance Company" → "Mutual of Omaha"
  - "National Western Life Insurance Company" → "National Western Life"

"insuredDateOfBirth": "Date of Birth", "DOB", "Birth Date" near the insured's info. Format: YYYY-MM-DD.

"insuredEmail": ONLY extract if an actual email address is visible. Set to null if none found. NEVER fabricate.

"insuredPhone": Phone number of the insured.

"effectiveDate": The carrier's policy **effective date** or **issue date** only (as labeled on the policy schedule or similar). Do NOT use applicant signature dates, agent sign dates, or generic "application date" lines next to signatures. Format: YYYY-MM-DD.

"applicationSignedDate": The date handwritten or printed **immediately beside** the **Proposed Insured**, **Applicant**, or **Policy Owner** signature line(s) — i.e. when the client signed the application. Scan **all pages** including signature / authorization pages (often near the end). If multiple such dates appear, return the **earliest** one that corresponds to the insured/applicant/owner signing. Do NOT use: agent-only dates, witness-only dates, today's date from cover letters, or metadata. If no such date is visible, null. Format: YYYY-MM-DD.

STRICT RULES:
- NEVER fabricate, guess, or infer values not explicitly visible in the document
- If a field cannot be determined, set it to null
- The beneficiary is NEVER the insured — they are different people/roles
- Strip trailing "X" characters from names (checkbox marks)
- Parse dollar amounts as numbers (remove $, commas)
- Parse dates as YYYY-MM-DD
- "note": brief note flagging anything unusual or uncertain (empty string if nothing to flag)`;

const TEXT_SYSTEM_PROMPT = `You are an expert insurance application document parser.

You are given extracted text from an insurance application PDF. The text may be noisy or partially ordered. Extract structured fields using only values explicitly present in the text.

ROLE DISAMBIGUATION (extremely important):
- "Proposed Insured" / "Applicant" / "Insured" = the person whose life is being insured.
- "Owner" / "Policy Owner" = the person who owns the policy.
- "Primary Beneficiary" / "Contingent Beneficiary" = recipients of death benefit, NOT the insured.

FIELD EXTRACTION RULES:
- Apply the same extraction rules as the PDF parser.
- Never invent values.
- If a field is missing, return null.
- Keep the output strictly aligned to schema.
- "note": brief note for uncertainty (empty string if nothing to flag).`;

// ─── JSON Schema for structured output ─────────────────────

const EXTRACTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    policyType: { type: 'string' as const, enum: ['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other'] },
    policyNumber: { type: 'string' as const },
    insuranceCompany: { type: 'string' as const },
    policyOwner: { type: 'string' as const },
    insuredName: { type: 'string' as const },
    beneficiaries: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          relationship: { type: 'string' as const },
          percentage: { type: 'number' as const },
          irrevocable: { type: 'boolean' as const },
          type: { type: 'string' as const, enum: ['primary', 'contingent'] },
        },
        required: ['name', 'type'],
        additionalProperties: false,
      },
    },
    coverageAmount: { type: 'number' as const },
    premiumAmount: { type: 'number' as const },
    premiumFrequency: { type: 'string' as const, enum: ['monthly', 'quarterly', 'semi-annual', 'annual'] },
    renewalDate: { type: 'string' as const },
    insuredEmail: { type: 'string' as const },
    insuredPhone: { type: 'string' as const },
    insuredDateOfBirth: { type: 'string' as const },
    insuredState: { type: 'string' as const },
    effectiveDate: { type: 'string' as const },
    applicationSignedDate: { type: 'string' as const },
    note: { type: 'string' as const },
  },
  required: ['note'],
  additionalProperties: false,
};

// ─── Main extraction ───────────────────────────────────────

/**
 * Send the full PDF to Claude Sonnet 4.6 as a native document content block.
 * Claude processes the raw PDF with full visual fidelity — no image rendering
 * or text extraction needed on our side.
 */
export async function extractApplicationFields(
  pdfBase64: string,
  options: ApplicationExtractionOptions = {},
): Promise<{ data: ExtractedApplicationData; note?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Add it to your .env.local file.');
  }

  const anthropic = new Anthropic({ apiKey });
  const fileSizeBytes = options.fileSizeBytes;

  const isLargePdf = typeof fileSizeBytes === 'number' && fileSizeBytes >= LARGE_PDF_THRESHOLD_BYTES;

  if (isLargePdf) {
    // Large PDFs: run a faster first pass, then fall back to full-depth only when needed.
    const fastResult = await runExtractionAttempt(anthropic, pdfBase64, { maxTokens: 1200, maxRetries: 1 });
    if (isFastPassAcceptable(fastResult.data)) {
      if (shouldRetryForSignatureDate(fastResult.data)) {
        const deep = await runExtractionAttempt(anthropic, pdfBase64, { maxTokens: 2048, maxRetries: 2 });
        return pickExtractionPreferringSignatureDate(fastResult, deep);
      }
      return fastResult;
    }
    return runExtractionAttempt(anthropic, pdfBase64, { maxTokens: 2048, maxRetries: 2 });
  }

  const isFastPathPdf = typeof fileSizeBytes === 'number' && fileSizeBytes <= FAST_PATH_MAX_BYTES;
  if (isFastPathPdf) {
    // <= 4MB: strict fast-first pass, then one deeper pass only when quality is weak.
    const isSmallPdf = fileSizeBytes <= SMALL_PDF_THRESHOLD_BYTES;
    const fastResult = await runExtractionAttempt(anthropic, pdfBase64, {
      maxTokens: isSmallPdf ? 950 : 1100,
      maxRetries: 1,
    });
    if (isFastPassAcceptable(fastResult.data)) {
      if (shouldRetryForSignatureDate(fastResult.data)) {
        const deep = await runExtractionAttempt(anthropic, pdfBase64, { maxTokens: 1550, maxRetries: 1 });
        return pickExtractionPreferringSignatureDate(fastResult, deep);
      }
      return fastResult;
    }
    return runExtractionAttempt(anthropic, pdfBase64, { maxTokens: 1550, maxRetries: 1 });
  }

  return runExtractionAttempt(anthropic, pdfBase64, { maxTokens: 1700, maxRetries: 1 });
}

export async function extractApplicationFieldsFromText(
  text: string,
): Promise<{ data: ExtractedApplicationData; note?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Add it to your .env.local file.');
  }

  const anthropic = new Anthropic({ apiKey });
  const normalizedText = text.trim();
  if (normalizedText.length === 0) {
    throw new Error('No extracted text provided.');
  }

  // Keep text payload bounded to reduce model latency/cost.
  const truncatedText = normalizedText.length > 18_000 ? normalizedText.slice(0, 18_000) : normalizedText;
  return runTextExtractionAttempt(anthropic, truncatedText, { maxTokens: 1200, maxRetries: 1 });
}

async function runExtractionAttempt(
  anthropic: Anthropic,
  pdfBase64: string,
  config: ExtractionRunConfig,
): Promise<{ data: ExtractedApplicationData; note?: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: config.maxTokens,
        system: SYSTEM_PROMPT,
        output_config: {
          format: {
            type: 'json_schema',
            schema: EXTRACTION_SCHEMA,
          },
        },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdfBase64,
                },
              },
              {
                type: 'text',
                text: 'Extract all available fields from this insurance application PDF.',
              },
            ],
          },
        ],
      });

      const textContent = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      if (!textContent?.text) {
        throw new Error('No response received from AI.');
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(textContent.text);
      } catch {
        throw new Error('Failed to parse AI response.');
      }

      return buildResult(parsed);
    } catch (err) {
      lastError = err;
      console.error(`[application-extractor] Attempt ${attempt + 1}/${config.maxRetries} failed:`, err);
      const isRetryable = isRetryableExtractionError(err);

      if (!isRetryable || attempt === config.maxRetries - 1) break;

      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('AI extraction failed after retries. Please try again.');
}

async function runTextExtractionAttempt(
  anthropic: Anthropic,
  extractedText: string,
  config: ExtractionRunConfig,
): Promise<{ data: ExtractedApplicationData; note?: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: config.maxTokens,
        system: TEXT_SYSTEM_PROMPT,
        output_config: {
          format: {
            type: 'json_schema',
            schema: EXTRACTION_SCHEMA,
          },
        },
        messages: [
          {
            role: 'user',
            content: `Extract all available fields from this insurance application text:\n\n${extractedText}`,
          },
        ],
      });

      const textContent = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      if (!textContent?.text) {
        throw new Error('No response received from AI.');
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(textContent.text);
      } catch {
        throw new Error('Failed to parse AI response.');
      }

      return buildResult(parsed);
    } catch (err) {
      lastError = err;
      console.error(`[application-extractor-text] Attempt ${attempt + 1}/${config.maxRetries} failed:`, err);
      const isRetryable = isRetryableExtractionError(err);
      if (!isRetryable || attempt === config.maxRetries - 1) break;
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('AI extraction failed after retries. Please try again.');
}

function buildResult(parsed: Record<string, unknown>): { data: ExtractedApplicationData; note?: string } {
  const note = typeof parsed.note === 'string' && parsed.note.length > 0
    ? parsed.note
    : undefined;

  const rawBeneficiaries = Array.isArray(parsed.beneficiaries)
    ? parsed.beneficiaries
    : [];

  const data: ExtractedApplicationData = {
    policyType: validatePolicyType(parsed.policyType),
    policyNumber: toStringOrNull(parsed.policyNumber),
    insuranceCompany: toStringOrNull(parsed.insuranceCompany),
    policyOwner: toStringOrNull(parsed.policyOwner),
    insuredName: toStringOrNull(parsed.insuredName),
    beneficiaries: parseBeneficiaries(rawBeneficiaries),
    coverageAmount: toNumberOrNull(parsed.coverageAmount),
    premiumAmount: toNumberOrNull(parsed.premiumAmount),
    premiumFrequency: validateFrequency(parsed.premiumFrequency),
    renewalDate: toStringOrNull(parsed.renewalDate),
    insuredEmail: toStringOrNull(parsed.insuredEmail),
    insuredPhone: toStringOrNull(parsed.insuredPhone),
    insuredDateOfBirth: toStringOrNull(parsed.insuredDateOfBirth),
    insuredState: toStateAbbreviationOrNull(parsed.insuredState),
    effectiveDate: toIsoDateStringOrNull(parsed.effectiveDate),
    applicationSignedDate: toIsoDateStringOrNull(parsed.applicationSignedDate),
  };

  const keyFields = [
    'insuredName',
    'insuredDateOfBirth',
    'insuredPhone',
    'policyType',
    'insuranceCompany',
    'policyNumber',
    'coverageAmount',
    'premiumAmount',
    'applicationSignedDate',
  ] as const;
  const completeness = keyFields.reduce((acc, field) => {
    const value = data[field];
    if (typeof value === 'number') return acc + 1;
    if (typeof value === 'string') return value.trim().length > 0 ? acc + 1 : acc;
    return value ? acc + 1 : acc;
  }, 0);
  console.info('[application-extractor] completeness', {
    score: `${completeness}/${keyFields.length}`,
    hasBeneficiaries: Array.isArray(data.beneficiaries) && data.beneficiaries.length > 0,
    hasEffectiveDate: !!data.effectiveDate,
    hasSignedDate: !!data.applicationSignedDate,
  });

  return { data, note };
}

// ─── Helpers ───────────────────────────────────────────────

function toStringOrNull(val: unknown): string | null {
  if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  return null;
}

function toNumberOrNull(val: unknown): number | null {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const num = parseFloat(val.replace(/[,$]/g, ''));
    if (!isNaN(num)) return num;
  }
  return null;
}

const VALID_POLICY_TYPES = ['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other'] as const;

function validatePolicyType(val: unknown): ExtractedApplicationData['policyType'] {
  if (typeof val === 'string' && VALID_POLICY_TYPES.includes(val as typeof VALID_POLICY_TYPES[number])) {
    return val as ExtractedApplicationData['policyType'];
  }
  return null;
}

const VALID_FREQUENCIES = ['monthly', 'quarterly', 'semi-annual', 'annual'] as const;

function validateFrequency(val: unknown): ExtractedApplicationData['premiumFrequency'] {
  if (typeof val === 'string' && VALID_FREQUENCIES.includes(val as typeof VALID_FREQUENCIES[number])) {
    return val as ExtractedApplicationData['premiumFrequency'];
  }
  return null;
}

function parseBeneficiaries(val: unknown): Beneficiary[] | null {
  if (!Array.isArray(val) || val.length === 0) return null;

  const result: Beneficiary[] = [];
  for (const item of val) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const name = toStringOrNull(obj.name);
    if (!name) continue;

    const benefType = obj.type === 'contingent' ? 'contingent' : 'primary';
    const relationship = toStringOrNull(obj.relationship) || undefined;
    const percentage = toNumberOrNull(obj.percentage) ?? undefined;
    const irrevocable = toBooleanOrNull(obj.irrevocable);

    result.push({ name, type: benefType, relationship, percentage, irrevocable });
  }

  return result.length > 0 ? result : null;
}

function countExtractionSignals(data: ExtractedApplicationData): number {
  let signals = 0;
  if (data.insuredName) signals++;
  if (data.policyType) signals++;
  if (data.policyNumber) signals++;
  if (data.insuranceCompany) signals++;
  if (data.coverageAmount != null) signals++;
  if (data.premiumAmount != null) signals++;
  return signals;
}

function isFastPassAcceptable(data: ExtractedApplicationData): boolean {
  const signals = countExtractionSignals(data);
  if (signals < MIN_FAST_MODE_SIGNALS) {
    return false;
  }

  const hasIdentity = !!data.insuredName;
  const hasPolicyAnchor = !!data.policyType || !!data.policyNumber || !!data.insuranceCompany;
  const hasFinancialAnchor = data.coverageAmount != null || data.premiumAmount != null;

  return hasIdentity && hasPolicyAnchor && hasFinancialAnchor;
}

/** Fast pass often skips late signature pages; run a deeper pass when core fields look good but signature date is missing. */
function shouldRetryForSignatureDate(data: ExtractedApplicationData): boolean {
  if (data.applicationSignedDate) return false;
  return isFastPassAcceptable(data);
}

function pickExtractionPreferringSignatureDate(
  fast: { data: ExtractedApplicationData; note?: string },
  deep: { data: ExtractedApplicationData; note?: string },
): { data: ExtractedApplicationData; note?: string } {
  if (deep.data.applicationSignedDate) {
    const note = [fast.note, deep.note].filter(Boolean).join(' ');
    return {
      data: { ...fast.data, applicationSignedDate: deep.data.applicationSignedDate },
      note: note || undefined,
    };
  }
  return fast;
}

function toIsoDateStringOrNull(val: unknown): string | null {
  const s = toStringOrNull(val);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T12:00:00.000Z`);
  return Number.isNaN(t) ? null : s;
}

function toBooleanOrNull(val: unknown): boolean | null {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const normalized = val.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function toStateAbbreviationOrNull(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const state = val.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : null;
}

export interface ApplicationFieldEvidence {
  page: number | null;
  snippet: string | null;
  confidence: number | null;
}

export type ApplicationFieldEvidenceMap = Partial<
  Record<keyof ExtractedApplicationData | 'applicantName' | 'faceAmount' | 'annualPremium' | 'modalPremium', ApplicationFieldEvidence>
>;

/**
 * v3-safe helper: normalize unknown evidence payloads into the expected
 * page/snippet/confidence shape without affecting v2 extraction behavior.
 */
export function normalizeApplicationEvidence(raw: unknown): ApplicationFieldEvidenceMap {
  if (!raw || typeof raw !== 'object') return {};
  const entries = Object.entries(raw as Record<string, unknown>);
  const out: ApplicationFieldEvidenceMap = {};

  for (const [key, value] of entries) {
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    out[key as keyof ApplicationFieldEvidenceMap] = {
      page: typeof record.page === 'number' && record.page > 0 ? Math.floor(record.page) : null,
      snippet: typeof record.snippet === 'string' && record.snippet.trim().length > 0 ? record.snippet.trim() : null,
      confidence:
        typeof record.confidence === 'number' && Number.isFinite(record.confidence)
          ? Math.max(0, Math.min(1, record.confidence))
          : null,
    };
  }

  return out;
}

