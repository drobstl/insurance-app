import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are an expert insurance data parser. You extract structured client and policy data from Book of Business (BOB) reports exported by insurance carriers.

These reports come in many formats:
- PDFs with multi-panel horizontal layouts (data split across pages, e.g. "-- 1 of 5 --")
- CSV or TSV text with carrier-specific column headers
- Any other tabular layout

ROLE DISAMBIGUATION:
- "Insured" / "Proposed Insured" / "Applicant" = the person whose life is insured. This is the CLIENT.
- "Owner" / "Policy Owner" = the person who owns the policy. Often the same as the insured, but can differ (e.g. a parent owning a child's policy).
- These are two different roles. Always extract both if available.

FIELD EXTRACTION RULES:

"name": The insured person — INSURED_NME, Insured Name, Applicant, Client Name, etc. This is the primary client.

"owner": The policy owner — OWNER_NME, Owner Name, Policy Owner. Only include if DIFFERENT from the insured. If same as insured, use empty string.

"email": The insured's email address. Only extract if explicitly present.

"phone": The insured's phone number. Digits only (no dashes, parentheses, spaces).

"dateOfBirth": The insured's date of birth. Format: MM/DD/YYYY exactly as it appears, or convert to that format.

"policyNumber": The policy/certificate number. NOT an SSN, agent number, or form number.

"carrier": The insurance company name. Use the common short name:
  - "Mutual of Omaha Insurance Company" → "Mutual of Omaha"
  - "United of Omaha Life Insurance Company" → "United of Omaha"
  - Use similar shortening for other carriers.

"policyType": Classify the product into one of these categories:
  - "Term Life" = Term, Level Term, Term Life Express, Return of Premium Term
  - "Whole Life" = Whole Life, Living Promise, Graded Benefit, Children's Whole Life, Ordinary Life
  - "IUL" = Indexed Universal Life, IUL
  - "Accidental" = Accidental Death, AD&D, Limited Accident, Health And Accident (accidental death products)
  - "Mortgage Protection" = Home Certainty, Mortgage Protection, MP
  - "Other" = Critical Illness, Cancer, Specified Disease, Disability, or anything that doesn't fit above

"effectiveDate": Policy effective date, issue date, or inception date. Format: MM/DD/YYYY.

"premium": The MONTHLY premium amount. Number only, no $ or commas.
  - If the report has both monthly and annual premium, use the monthly value.
  - If only annual premium is available, divide by 12 and round to 2 decimal places.
  - Check the billing mode (BILL_MODE, Payment Mode, etc.) to determine frequency.

"coverageAmount": The face amount / death benefit. Number only, no $ or commas.
  - Use FACE_AMT, Face Amount, Death Benefit, Coverage Amount, Specified Amount.
  - Do NOT use Cash Value, Surrender Value, or Account Value.

"status": Policy status:
  - "Active" = Inforce, In Force, Active, Paid Up
  - "Pending" = Pending, Applied, Submitted
  - "Lapsed" = Lapsed, Cancelled, Terminated, Surrendered, Expired

"premiumFrequency": The billing frequency:
  - "monthly" = Monthly, Bank Draft, MON
  - "quarterly" = Quarterly, QTR
  - "semi-annual" = Semi-Annual, SA
  - "annual" = Annual, ANN

MULTI-PANEL PDF HANDLING:
- Some carrier reports (like Mutual of Omaha) split wide tables across multiple pages/panels.
- Panel 1 might have: Carrier, Policy Number, Insured Name, DOB, Address, Phone, Email
- Panel 2 might have: Owner info, Billing Mode, Premium, Annual Premium, Dates
- Panel 3 might have: Agent info
- Panel 4 might have: Product info, Status
- Panel 5 might have: Coverage amounts
- You MUST merge data across panels by row position. Row 1 in Panel 1 corresponds to Row 1 in Panel 2, etc.
- Count rows carefully. If panels have different row counts, something is wrong — flag it in the note.

STRICT RULES:
- Extract EVERY policy row. Do not skip any.
- NEVER fabricate, guess, or infer values not present in the document.
- If a field is not present for a row, use an empty string.
- Parse dollar amounts as plain numbers (remove $, commas).
- Include a "rowCount" field with the total number of policies extracted.
- Include a "note" field for anything unusual (empty string if nothing to flag).`;

const BOB_EXTRACTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    rowCount: { type: 'number' as const },
    note: { type: 'string' as const },
    rows: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          owner: { type: 'string' as const },
          email: { type: 'string' as const },
          phone: { type: 'string' as const },
          dateOfBirth: { type: 'string' as const },
          policyNumber: { type: 'string' as const },
          carrier: { type: 'string' as const },
          policyType: {
            type: 'string' as const,
            enum: ['Term Life', 'Whole Life', 'IUL', 'Accidental', 'Mortgage Protection', 'Other'],
          },
          effectiveDate: { type: 'string' as const },
          premium: { type: 'string' as const },
          coverageAmount: { type: 'string' as const },
          status: { type: 'string' as const },
          premiumFrequency: {
            type: 'string' as const,
            enum: ['monthly', 'quarterly', 'semi-annual', 'annual'],
          },
        },
        required: [
          'name', 'owner', 'email', 'phone', 'dateOfBirth',
          'policyNumber', 'carrier', 'policyType', 'effectiveDate',
          'premium', 'coverageAmount', 'status', 'premiumFrequency',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['rowCount', 'note', 'rows'],
  additionalProperties: false,
};

export interface BobRow {
  name: string;
  owner: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  policyNumber: string;
  carrier: string;
  policyType: string;
  effectiveDate: string;
  premium: string;
  coverageAmount: string;
  status: string;
  premiumFrequency: string;
}

export interface BobExtractionResult {
  rows: BobRow[];
  rowCount: number;
  note?: string;
}

/**
 * Extract BOB data from a PDF document via Claude.
 */
export async function extractBobFromPdf(
  pdfBase64: string,
): Promise<BobExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured.');
  }

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16384,
    system: SYSTEM_PROMPT,
    output_config: {
      format: {
        type: 'json_schema',
        schema: BOB_EXTRACTION_SCHEMA,
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
            text: 'Extract all client and policy data from this Book of Business report. Merge data across all panels/pages by row position.',
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

  const parsed = JSON.parse(textContent.text) as BobExtractionResult;

  if (parsed.rowCount !== parsed.rows.length) {
    const msg = `Row count mismatch: expected ${parsed.rowCount}, got ${parsed.rows.length}.`;
    parsed.note = parsed.note ? `${parsed.note} ${msg}` : msg;
  }

  return parsed;
}

/**
 * Extract BOB data from raw text (CSV/TSV that failed structured parsing) via Claude.
 */
export async function extractBobFromText(
  text: string,
): Promise<BobExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured.');
  }

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16384,
    system: SYSTEM_PROMPT,
    output_config: {
      format: {
        type: 'json_schema',
        schema: BOB_EXTRACTION_SCHEMA,
      },
    },
    messages: [
      {
        role: 'user',
        content: `Extract all client and policy data from this Book of Business report:\n\n${text}`,
      },
    ],
  });

  const textContent = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );
  if (!textContent?.text) {
    throw new Error('No response received from AI. Please try again.');
  }

  const parsed = JSON.parse(textContent.text) as BobExtractionResult;

  if (parsed.rowCount !== parsed.rows.length) {
    const msg = `Row count mismatch: expected ${parsed.rowCount}, got ${parsed.rows.length}.`;
    parsed.note = parsed.note ? `${parsed.note} ${msg}` : msg;
  }

  return parsed;
}
