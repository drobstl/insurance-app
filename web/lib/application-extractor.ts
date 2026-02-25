import Anthropic from '@anthropic-ai/sdk';
import { ExtractedApplicationData, Beneficiary } from './types';

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

"effectiveDate": Policy effective date, issue date, or application date. Format: YYYY-MM-DD.

STRICT RULES:
- NEVER fabricate, guess, or infer values not explicitly visible in the document
- If a field cannot be determined, set it to null
- The beneficiary is NEVER the insured — they are different people/roles
- Strip trailing "X" characters from names (checkbox marks)
- Parse dollar amounts as numbers (remove $, commas)
- Parse dates as YYYY-MM-DD
- "note": brief note flagging anything unusual or uncertain (empty string if nothing to flag)`;

// ─── JSON Schema for structured output ─────────────────────

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    policyType: {
      type: ['string', 'null'],
      enum: ['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other', null],
    },
    policyNumber: { type: ['string', 'null'] },
    insuranceCompany: { type: ['string', 'null'] },
    policyOwner: { type: ['string', 'null'] },
    insuredName: { type: ['string', 'null'] },
    beneficiaries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          relationship: { type: ['string', 'null'] },
          percentage: { type: ['number', 'null'] },
          type: { type: 'string', enum: ['primary', 'contingent'] },
        },
        required: ['name', 'type', 'relationship', 'percentage'],
        additionalProperties: false,
      },
    },
    coverageAmount: { type: ['number', 'null'] },
    premiumAmount: { type: ['number', 'null'] },
    premiumFrequency: {
      type: ['string', 'null'],
      enum: ['monthly', 'quarterly', 'semi-annual', 'annual', null],
    },
    renewalDate: { type: ['string', 'null'] },
    insuredEmail: { type: ['string', 'null'] },
    insuredPhone: { type: ['string', 'null'] },
    insuredDateOfBirth: { type: ['string', 'null'] },
    effectiveDate: { type: ['string', 'null'] },
    note: { type: 'string' },
  },
  required: [
    'policyType', 'policyNumber', 'insuranceCompany', 'policyOwner',
    'insuredName', 'beneficiaries', 'coverageAmount', 'premiumAmount',
    'premiumFrequency', 'renewalDate', 'insuredEmail', 'insuredPhone',
    'insuredDateOfBirth', 'effectiveDate', 'note',
  ],
  additionalProperties: false,
} as const;

// ─── Main extraction ───────────────────────────────────────

/**
 * Send the full PDF to Claude Sonnet 4.6 as a native document content block.
 * Claude processes the raw PDF with full visual fidelity — no image rendering
 * or text extraction needed on our side.
 */
export async function extractApplicationFields(
  pdfBase64: string,
): Promise<{ data: ExtractedApplicationData; note?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Add it to your .env.local file.');
  }

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6-20250514',
    max_tokens: 2048,
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
    throw new Error('No response received from AI. Please try again.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textContent.text);
  } catch {
    throw new Error('Failed to parse AI response. Please try again.');
  }

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
    effectiveDate: toStringOrNull(parsed.effectiveDate),
  };

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

    result.push({ name, type: benefType, relationship, percentage });
  }

  return result.length > 0 ? result : null;
}
