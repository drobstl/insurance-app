import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { normalizeApplicationEvidence } from './application-extractor';
import { IngestionV3Error } from './ingestion-v3-errors';
import { validateAndNormalizeV3ApplicationResult } from './ingestion-v3-validate';
import type { IngestionV3ApplicationResult } from './ingestion-v3-types';
import type { Beneficiary, ExtractedApplicationData } from './types';

const CLAUDE_MODEL = 'claude-sonnet-4-6';

const APPLICATION_V3_PROMPT = `You are an expert insurance application extractor for life insurance forms. Extract only information explicitly present in the PDF. Do not guess.

You must resolve role ambiguity with strict precedence:

ROLE RESOLUTION
1) INSURED = "Proposed Insured", "Insured", "Person Insured", or "Applicant" when applicant is the life being insured.
2) APPLICANT = person applying/signing the application. If applicant is clearly different from insured, keep them distinct.
3) OWNER = "Owner", "Policy Owner", "Application Owner", "Payor Owner". Owner may be same as insured or applicant.
4) BENEFICIARY = "Primary Beneficiary" / "Contingent Beneficiary". Never map beneficiary to insured unless the form explicitly states self-beneficiary.

If two roles conflict, return null for the ambiguous field and explain in note.

FIELD RULES
- insuredName: full legal name for insured role.
- applicantName: full legal name for applicant role (null if not explicitly distinct).
- policyOwner: full legal name for owner role (null if absent).
- insuredState: U.S. state abbreviation from insured's address (e.g., MO, CA). Null if no address visible.
- beneficiaries: list each beneficiary with:
  - name
  - type: primary | contingent
  - relationship
  - percentage
  - designation: individual | trust | estate | other (if visible)
  - irrevocable: true | false | null (only if form explicitly marks irrevocable designation)
- riders: list all riders exactly as shown (e.g., Child Rider, Waiver of Premium, Accidental Death Rider), with rider amount if visible.
- replacementPolicy:
  - isReplacement: true/false/null
  - replacedCarrier
  - replacedPolicyNumber
  - replacementType (internal | external | unknown)
- premium:
  - modalPremium: payment amount for selected billing mode (monthly/quarterly/semi-annual/annual)
  - annualPremium: annualized premium when explicitly shown
  - premiumFrequency: monthly | quarterly | semi-annual | annual | null
  - Never infer annual from modal unless annual is explicitly printed.
- coverage:
  - faceAmount: policy face amount / specified amount / death benefit
  - coverageAmount: if a separate "coverage amount" field is present; otherwise null
  - If only one amount exists, put it in faceAmount and keep coverageAmount null.
- policyNumber: policy/application/case number (not SSN, not agent number, not form number).
- insuranceCompany: carrier short name.
- insuredDateOfBirth, insuredPhone, insuredEmail, effectiveDate: extract if explicitly present, else null.

NORMALIZATION
- Dates: YYYY-MM-DD when unambiguous; else null.
- Currency: numeric values only, no $ or commas.
- Percentages: numeric (e.g., 50 for 50%).
- Preserve middle initials/suffixes in names.
- Strip checkbox artifacts (e.g., trailing X used as marks).

EVIDENCE REQUIREMENT
For every non-null extracted field, provide evidence:
- page (1-indexed)
- snippet (exact nearby text)
- confidence (0 to 1)

STRICTNESS
- Never fabricate values.
- If unreadable/uncertain/contradictory, return null.
- If multiple candidate values exist and cannot be disambiguated, return null and explain in note.
- Keep output strictly valid to the provided JSON schema.`;

const APPLICATION_V3_SCHEMA = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'object' as const,
      properties: {
        policyType: {
          anyOf: [
            { type: 'string' as const, enum: ['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other'] },
            { type: 'null' as const },
          ],
        },
        policyNumber: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
        insuranceCompany: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
        policyOwner: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
        insuredName: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
        beneficiaries: {
          anyOf: [
            {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                properties: {
                  name: { type: 'string' as const },
                  relationship: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
                  percentage: { anyOf: [{ type: 'number' as const }, { type: 'null' as const }] },
                  irrevocable: { anyOf: [{ type: 'boolean' as const }, { type: 'null' as const }] },
                  type: { type: 'string' as const, enum: ['primary', 'contingent'] },
                },
                required: ['name', 'relationship', 'percentage', 'irrevocable', 'type'],
                additionalProperties: false,
              },
            },
            { type: 'null' as const },
          ],
        },
        coverageAmount: { anyOf: [{ type: 'number' as const }, { type: 'null' as const }] },
        premiumAmount: { anyOf: [{ type: 'number' as const }, { type: 'null' as const }] },
        premiumFrequency: {
          anyOf: [
            { type: 'string' as const, enum: ['monthly', 'quarterly', 'semi-annual', 'annual'] },
            { type: 'null' as const },
          ],
        },
        renewalDate: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
        insuredEmail: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
        insuredPhone: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
        insuredDateOfBirth: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
        insuredState: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
        effectiveDate: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
      },
      required: [
        'policyType',
        'policyNumber',
        'insuranceCompany',
        'policyOwner',
        'insuredName',
        'beneficiaries',
        'coverageAmount',
        'premiumAmount',
        'premiumFrequency',
        'renewalDate',
        'insuredEmail',
        'insuredPhone',
        'insuredDateOfBirth',
        'insuredState',
        'effectiveDate',
      ],
      additionalProperties: false,
    },
    evidence: {
      type: 'object' as const,
      properties: {
        policyType: evidenceItemSchema(),
        policyNumber: evidenceItemSchema(),
        insuranceCompany: evidenceItemSchema(),
        policyOwner: evidenceItemSchema(),
        insuredName: evidenceItemSchema(),
        beneficiaries: evidenceItemSchema(),
        coverageAmount: evidenceItemSchema(),
        premiumAmount: evidenceItemSchema(),
        premiumFrequency: evidenceItemSchema(),
        renewalDate: evidenceItemSchema(),
        insuredEmail: evidenceItemSchema(),
        insuredPhone: evidenceItemSchema(),
        insuredDateOfBirth: evidenceItemSchema(),
        insuredState: evidenceItemSchema(),
        effectiveDate: evidenceItemSchema(),
        applicantName: evidenceItemSchema(),
        faceAmount: evidenceItemSchema(),
        annualPremium: evidenceItemSchema(),
        modalPremium: evidenceItemSchema(),
      },
      required: [],
      additionalProperties: false,
    },
    note: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
  },
  required: ['data', 'evidence', 'note'],
  additionalProperties: false,
};

function evidenceItemSchema() {
  return {
    type: 'object' as const,
    properties: {
      page: { anyOf: [{ type: 'number' as const }, { type: 'null' as const }] },
      snippet: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
      confidence: { anyOf: [{ type: 'number' as const }, { type: 'null' as const }] },
    },
    required: ['page', 'snippet', 'confidence'],
    additionalProperties: false,
  };
}

export async function extractApplicationPdfV3(pdfBase64: string): Promise<IngestionV3ApplicationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new IngestionV3Error('CLAUDE_REQUEST_FAILED', 'ANTHROPIC_API_KEY is not configured.', {
      retryable: false,
      terminal: true,
    });
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2200,
      system: APPLICATION_V3_PROMPT,
      output_config: {
        format: {
          type: 'json_schema',
          schema: APPLICATION_V3_SCHEMA,
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
              text: 'Extract application fields and evidence for each non-null value.',
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    if (!textContent?.text) {
      throw new IngestionV3Error('CLAUDE_REQUEST_FAILED', 'No response received from Claude.', {
        retryable: true,
        terminal: false,
      });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(textContent.text) as Record<string, unknown>;
    } catch {
      throw new IngestionV3Error('CLAUDE_SCHEMA_INVALID', 'Claude response was not valid JSON.', {
        retryable: false,
        terminal: true,
      });
    }

    const rawData = ((parsed.data as Record<string, unknown> | undefined) || {}) as Record<string, unknown>;
    const rawBeneficiaries = Array.isArray(rawData.beneficiaries) ? rawData.beneficiaries : null;
    const data: ExtractedApplicationData = {
      policyType: coercePolicyType(rawData.policyType),
      policyNumber: toNullableString(rawData.policyNumber),
      insuranceCompany: toNullableString(rawData.insuranceCompany),
      policyOwner: toNullableString(rawData.policyOwner),
      insuredName: toNullableString(rawData.insuredName),
      beneficiaries: coerceBeneficiaries(rawBeneficiaries),
      coverageAmount: toNullableNumber(rawData.coverageAmount),
      premiumAmount: toNullableNumber(rawData.premiumAmount),
      premiumFrequency: coercePremiumFrequency(rawData.premiumFrequency),
      renewalDate: toNullableString(rawData.renewalDate),
      insuredEmail: toNullableString(rawData.insuredEmail),
      insuredPhone: toNullableString(rawData.insuredPhone),
      insuredDateOfBirth: toNullableString(rawData.insuredDateOfBirth),
      insuredState: toStateAbbreviationOrNull(rawData.insuredState),
      effectiveDate: toNullableString(rawData.effectiveDate),
    };

    return validateAndNormalizeV3ApplicationResult({
      data,
      evidence: normalizeApplicationEvidence(parsed.evidence),
      note: typeof parsed.note === 'string' && parsed.note.trim().length > 0 ? parsed.note.trim() : undefined,
    });
  } catch (error) {
    if (error instanceof IngestionV3Error) {
      throw error;
    }
    throw new IngestionV3Error('CLAUDE_REQUEST_FAILED', error instanceof Error ? error.message : 'Claude request failed.', {
      retryable: true,
      terminal: false,
    });
  }
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.replace(/[,$]/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coercePolicyType(value: unknown): ExtractedApplicationData['policyType'] {
  const allowed = new Set(['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other']);
  if (typeof value === 'string' && allowed.has(value)) {
    return value as ExtractedApplicationData['policyType'];
  }
  return null;
}

function coercePremiumFrequency(value: unknown): ExtractedApplicationData['premiumFrequency'] {
  const allowed = new Set(['monthly', 'quarterly', 'semi-annual', 'annual']);
  if (typeof value === 'string' && allowed.has(value)) {
    return value as ExtractedApplicationData['premiumFrequency'];
  }
  return null;
}

function toStateAbbreviationOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const state = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : null;
}

function coerceBeneficiaries(value: unknown): Beneficiary[] | null {
  if (!Array.isArray(value)) return null;
  const rows: Beneficiary[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const name = toNullableString(record.name);
    if (!name) continue;
    rows.push({
      name,
      relationship: toNullableString(record.relationship) ?? undefined,
      percentage: toNullableNumber(record.percentage) ?? undefined,
      irrevocable: typeof record.irrevocable === 'boolean' ? record.irrevocable : null,
      type: record.type === 'contingent' ? 'contingent' : 'primary',
    });
  }
  return rows.length > 0 ? rows : null;
}

export { APPLICATION_V3_PROMPT, CLAUDE_MODEL as INGESTION_V3_PDF_MODEL };
