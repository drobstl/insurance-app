import Anthropic from '@anthropic-ai/sdk';

/**
 * Lead-form extractor — ported verbatim from
 * `web/lib/lead-form-extractor.ts` so the batch processor produces
 * byte-identical lead docs to the synchronous single-upload path.
 *
 * Differences from the web copy (and ONLY these):
 *   - no `server-only` import (this is a Cloud Function, not Next)
 *   - the Anthropic client is passed in (built from the GCF secret in
 *     index.ts) instead of read from process.env
 *   - `isRetryableExtractionError` is inlined (the web copy imported it
 *     from ./extraction-errors)
 *
 * Keep this in sync with the web extractor when the prompt/schema change.
 */

export type LeadFormType = 'Mail-In' | 'Call-In' | 'Digital' | 'Unknown';

export interface ExtractedLeadFields {
  name: string;
  phone: string;
  email: string | null;
  dateOfBirth: string | null;
  ageYears: number | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
  phones: Array<{ number: string; label: 'cell' | 'home' | 'work' | 'other' | null }>;
  gender: 'M' | 'F' | null;
  heightText: string | null;
  weightLbs: number | null;
  smokerStatus: 'Y' | 'N' | null;
  coborrowerStatus: 'Y' | 'N' | null;
  mortgageDetails: {
    balance: number | null;
    lender: string | null;
  } | null;
  spouseName: string | null;
  spouseAgeYears: number | null;
  beneficiaryName: string | null;
  formType: LeadFormType;
  extractionConfidence: number;
  extractionFlags: string[];
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Full name of the lead. Combine first + last when split.' },
    phone: { type: 'string', description: 'Lead PRIMARY phone number — prefer Cell if labeled, else Contact Phone, else Home Phone. Digits + formatting as printed. Empty string if not present. Also include in phones[] below.' },
    phones: {
      type: 'array',
      description: 'All visible phone numbers on the form. Always include the primary phone here too as the first entry.',
      items: {
        type: 'object',
        properties: {
          number: { type: 'string', description: 'Phone digits + formatting as printed.' },
          label: { type: 'string', enum: ['cell', 'home', 'work', 'other', ''], description: 'cell / home / work / other based on the form label. Empty string if the form does not specify.' },
        },
        required: ['number', 'label'],
        additionalProperties: false,
      },
    },
    email: { type: ['string', 'null'] },
    dateOfBirth: {
      type: ['string', 'null'],
      description: 'YYYY-MM-DD format. Null when only age (no DOB) is present on the form.',
    },
    ageYears: {
      type: ['integer', 'null'],
      description: 'Lead age in years. Set when the form lists age but no DOB. If both are present, set both — the consumer will prefer DOB.',
    },
    address: {
      type: ['object', 'null'],
      properties: {
        street: { type: ['string', 'null'] },
        city: { type: ['string', 'null'] },
        state: { type: ['string', 'null'], description: '2-letter USPS code (e.g. MO, AL, CA). Convert from full state name if needed.' },
        zip: { type: ['string', 'null'] },
      },
      required: ['street', 'city', 'state', 'zip'],
      additionalProperties: false,
    },
    gender: { type: 'string', enum: ['M', 'F', ''], description: 'M / F if explicit; "" when absent or ambiguous.' },
    heightText: { type: ['string', 'null'], description: 'Freeform — preserve as printed (e.g. "5\'10\\""). Null if absent.' },
    weightLbs: { type: ['number', 'null'] },
    smokerStatus: { type: 'string', enum: ['Y', 'N', ''], description: 'Y / N if explicit; "" when absent.' },
    coborrowerStatus: { type: 'string', enum: ['Y', 'N', ''], description: 'Y / N if a co-borrower question is answered; "" when absent.' },
    mortgageDetails: {
      type: ['object', 'null'],
      properties: {
        balance: { type: ['number', 'null'], description: 'Mortgage balance / loan amount in USD.' },
        lender: { type: ['string', 'null'] },
      },
      required: ['balance', 'lender'],
      additionalProperties: false,
    },
    spouseName: { type: ['string', 'null'] },
    spouseAgeYears: { type: ['integer', 'null'] },
    beneficiaryName: { type: ['string', 'null'], description: 'Only when explicitly labeled beneficiary on the form.' },
    formType: {
      type: 'string',
      enum: ['Mail-In', 'Call-In', 'Digital', 'Unknown'],
      description: 'Visual fingerprint of the form template. See the system prompt for the three known templates.',
    },
    extractionConfidence: {
      type: 'number',
      description: 'Self-rated overall confidence 0-1. Lower (≤0.6) when handwriting is illegible, fields are ambiguous, or the template is unfamiliar.',
    },
    extractionFlags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Per-field flags for low-confidence values, e.g. ["low_confidence_phone", "illegible_dob"]. Empty array when all fields are confident.',
    },
  },
  required: [
    'name', 'phone', 'phones', 'email', 'dateOfBirth', 'ageYears',
    'address', 'gender', 'heightText', 'weightLbs', 'smokerStatus', 'coborrowerStatus',
    'mortgageDetails', 'spouseName', 'spouseAgeYears', 'beneficiaryName',
    'formType', 'extractionConfidence', 'extractionFlags',
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an expert lead-form parser for a life insurance agency.

You will be given a single lead form PDF. Your job is two-fold:

1. **Classify the form template** as one of:
   - **Mail-In** — handwritten paper mailers, often photographed/scanned. Common headers include "FINAL MORTGAGE NOTICE", "FINAL NOTICE: ... ENROLLMENT PERIOD EXTENDED". Fields are partially printed, partially handwritten by the lead. Often contains a barcoded mortgage ID and originating lender block.
   - **Call-In** — Symmetry Financial Group "CUSTOMER REQUEST" PDF. Header reads "You have a CUSTOMER REQUEST that needs a call ASAP!" with the Symmetry logo. Structured field table with First Name / Last Name / Property Address / Mortgage ID / Contact Phone / Caller ID / Age / Mortgage Amount / Lender Name. Includes a "Questions Asked" section (gender, co-borrower, sometimes tobacco).
   - **Digital** — vendor PDF (e.g. Lighthouse Leads / Quility) with a richer structured table including Client Name / Gender / Spouse Name / Client Age / Spouse Age / Client Height / Client Weight / Phone Number / Email / Street Address / City / State / Zip / Mortgage Amount / Tobacco Use.

   If the layout doesn't match any of those three, set formType to "Unknown" and do your best with field extraction anyway.

2. **Extract the requested fields** from the PDF. Follow these rules:

FIELD EXTRACTION RULES:

- **name**: Full name of the lead (the borrower). Combine "First Name" and "Last Name" when they're split. Mail-In forms may have handwritten name in a "Borrower Information" or "Request for Information" box. Strip honorifics (Mr., Mrs., Dr.).

- **phone**: Lead's PRIMARY phone. On Call-In forms, prefer "Contact Phone"; on Mail-In, prefer "Cell Phone" then "Home Phone"; on Digital, prefer "Phone Number". Preserve digits and formatting as printed (e.g. "1-816-382-1302" or "(660) 998-1969"). The consumer normalizes downstream.

- **phones**: ALL visible phone numbers on the form (cell, home, work, etc.). ALWAYS include the primary phone here too as the first entry. Examples:
  - Mail-In with "Cell Phone: (660) 998-1969" and "Home Phone: (660) 998-1234" → [{number: "(660) 998-1969", label: "cell"}, {number: "(660) 998-1234", label: "home"}], and the primary "phone" field equals the cell one.
  - Symmetry Call-In with "Contact Phone: 1-816-382-1302" only → [{number: "1-816-382-1302", label: ""}].
  - Symmetry with "Contact Phone" AND "Caller ID" that differ → include both; label the Caller ID as "other".
  - Digital with one "Phone Number" → [{number: "...", label: ""}].
  Use label "cell" / "home" / "work" / "other" based on the form's labeling. Use "" (empty string) when the form does not specify a kind. Do not fabricate labels.

- **email**: Only if explicitly visible. Never fabricate.

- **dateOfBirth**: YYYY-MM-DD format. Mail-In forms sometimes have handwritten DOB (e.g. "11/09/1981" → "1981-11-09"). Most Call-In and Digital forms list AGE only (no DOB) — return null in that case and set ageYears.

- **ageYears**: Integer age in years if printed (Call-In and Digital forms typically list this). If both DOB and age are present, set both.

- **address.state**: USPS 2-letter code only ("MO", "AL", "CA"). If the form prints the state as a 2-letter code, use it directly. If full state name, convert. Set to null if the state is not extractable.

- **gender**: "M" or "F" if explicitly indicated (checkbox checked, "Male"/"Female" written, or "Questions Asked: What is your gender?: Male"). Null if absent or ambiguous.

- **heightText**: Freeform text as printed (e.g. "5'10\\"", "70 in", "5 ft 10 in"). Null if not present. Digital forms have a "Client Height" field.

- **weightLbs**: Numeric pounds. Digital forms have a "Client Weight" field. Null otherwise.

- **smokerStatus**: "Y" or "N" if a tobacco-use field is filled. The Call-In "Questions Asked" section often has "Have you used tobacco in the last 12 months?". Digital forms have "Tobacco Use (client)" with True/False.

- **coborrowerStatus**: "Y" or "N" if a co-borrower question is filled. Call-In Symmetry forms usually ask "Do you have a co-borrower on the mortgage?" or similar in the Questions Asked section. Treat a separately-listed Spouse Name as a strong but not definitive signal — only set "Y" if the form explicitly asks the co-borrower question and the lead answered yes. Empty string if absent.

- **mortgageDetails.balance**: Numeric USD. Look for "Loan Amount", "Mortgage Amount", "Mortgage Loan Amount" — NOT "Purchase Amount" (which is the original purchase price, often $0 on these forms).

- **mortgageDetails.lender**: Originating bank/lender name. Mail-In often labels this "ORIGINATING LENDER" or "Lender:" with bank name beneath.

- **spouseName** / **spouseAgeYears**: Only when explicitly labeled "Spouse Name" / "Spouse's Age" / "Spouse/Co-Borrower Information".

- **beneficiaryName**: Only when explicitly labeled beneficiary. Most lead forms don't have this — return null.

- **extractionConfidence**: Self-rate overall 0–1. Lower when handwriting is hard to read, fields are blurry, or the template is unfamiliar.

- **extractionFlags**: Per-field strings flagging anything the agent should double-check. Examples: "low_confidence_phone" (ink smudged), "illegible_dob" (handwriting unclear), "ambiguous_state" (multiple state references). Empty array when all fields are confident.

NEVER fabricate values. If a field is not visible or you can't read it, return null (not a guessed value). The agent will fill it in manually if needed.`;

const MAX_TOKENS = 2048;
const MAX_RETRIES = 3;

const PRIMARY_MODEL = 'claude-sonnet-4-6';
const ESCALATION_MODEL = 'claude-opus-4-7';
const ESCALATION_CONFIDENCE_THRESHOLD = 0.85;
const CRITICAL_FIELD_FLAG = /name|phone|dob|date_of_birth|birth/i;

function isRetryableExtractionError(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    return err.status === 429 || err.status === 500 || err.status === 502 || err.status === 503 || err.status === 529;
  }
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? (err as { status?: unknown }).status
      : undefined;
  if (typeof status === 'number' && (status === 429 || status === 500 || status === 502 || status === 503 || status === 529)) {
    return true;
  }
  return err instanceof Error && (
    err.message.includes('No response') ||
    err.message.includes('fetch failed') ||
    err.message.includes('ECONNRESET')
  );
}

async function runExtractionPass(
  anthropic: Anthropic,
  pdfBase64: string,
  model: string,
): Promise<ExtractedLeadFields> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: MAX_TOKENS,
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
                text: 'Classify this lead form template and extract all available fields.',
              },
            ],
          },
        ],
      } as Anthropic.MessageCreateParamsNonStreaming);

      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      if (!textBlock?.text) {
        throw new Error('No response received from extractor.');
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        throw new Error('Failed to parse extractor response.');
      }

      return normalize(parsed);
    } catch (err) {
      lastError = err;
      console.error(`[lead-extractor] ${model} attempt ${attempt + 1}/${MAX_RETRIES} failed:`, err);
      if (!isRetryableExtractionError(err) || attempt === MAX_RETRIES - 1) break;
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Lead extraction failed after retries.');
}

function needsEscalation(r: ExtractedLeadFields): boolean {
  if (r.formType === 'Mail-In' || r.formType === 'Unknown') return true;
  if (r.extractionConfidence < ESCALATION_CONFIDENCE_THRESHOLD) return true;
  if (!r.name || !r.phone) return true;
  return r.extractionFlags.some((f) => CRITICAL_FIELD_FLAG.test(f));
}

/**
 * Extract structured lead fields from a base64-encoded single-page PDF.
 * In the batch path we pass `{ escalate: false }` to skip the stronger
 * second pass — a 60-page bundle running Opus on every Mail-In page
 * would balloon cost/latency. The synchronous close-of-sale upload keeps
 * escalation on.
 */
export async function extractLeadFromPdf(
  anthropic: Anthropic,
  pdfBase64: string,
  opts: { escalate?: boolean } = {},
): Promise<ExtractedLeadFields> {
  const primary = await runExtractionPass(anthropic, pdfBase64, PRIMARY_MODEL);

  if (opts.escalate === false || !needsEscalation(primary)) {
    return primary;
  }

  try {
    return await runExtractionPass(anthropic, pdfBase64, ESCALATION_MODEL);
  } catch (escalationErr) {
    console.error('[lead-extractor] escalation pass failed; using primary result:', escalationErr);
    return primary;
  }
}

function normalize(raw: Record<string, unknown>): ExtractedLeadFields {
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const numOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const intOrNull = (v: unknown): number | null => {
    const n = numOrNull(v);
    return n === null ? null : Math.round(n);
  };

  const addressRaw = (raw.address || null) as Record<string, unknown> | null;
  const address = addressRaw && typeof addressRaw === 'object'
    ? {
        street: strOrNull(addressRaw.street),
        city: strOrNull(addressRaw.city),
        state: strOrNull(addressRaw.state),
        zip: strOrNull(addressRaw.zip),
      }
    : null;

  const mortgageRaw = (raw.mortgageDetails || null) as Record<string, unknown> | null;
  const mortgageDetails = mortgageRaw && typeof mortgageRaw === 'object'
    ? {
        balance: numOrNull(mortgageRaw.balance),
        lender: strOrNull(mortgageRaw.lender),
      }
    : null;

  const genderRaw = strOrNull(raw.gender);
  const gender: 'M' | 'F' | null =
    genderRaw === 'M' || genderRaw === 'F' ? genderRaw : null;

  const smokerRaw = strOrNull(raw.smokerStatus);
  const smokerStatus: 'Y' | 'N' | null =
    smokerRaw === 'Y' || smokerRaw === 'N' ? smokerRaw : null;

  const coborrowerRaw = strOrNull(raw.coborrowerStatus);
  const coborrowerStatus: 'Y' | 'N' | null =
    coborrowerRaw === 'Y' || coborrowerRaw === 'N' ? coborrowerRaw : null;

  const rawPhones = Array.isArray(raw.phones) ? raw.phones : [];
  const phones: Array<{ number: string; label: 'cell' | 'home' | 'work' | 'other' | null }> = [];
  const seenDigits = new Set<string>();
  const pushPhone = (num: string, lbl: string | null) => {
    const trimmed = num.trim();
    if (!trimmed) return;
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 7) return;
    if (seenDigits.has(digits)) return;
    seenDigits.add(digits);
    const validLabel: 'cell' | 'home' | 'work' | 'other' | null =
      lbl === 'cell' || lbl === 'home' || lbl === 'work' || lbl === 'other' ? lbl : null;
    phones.push({ number: trimmed, label: validLabel });
  };
  const primaryStr = str(raw.phone);
  if (primaryStr) pushPhone(primaryStr, null);
  for (const p of rawPhones) {
    if (!p || typeof p !== 'object') continue;
    const num = strOrNull((p as Record<string, unknown>).number) || '';
    const lbl = strOrNull((p as Record<string, unknown>).label);
    pushPhone(num, lbl);
  }

  const formTypeRaw = strOrNull(raw.formType);
  const formType: LeadFormType =
    formTypeRaw === 'Mail-In' || formTypeRaw === 'Call-In' || formTypeRaw === 'Digital'
      ? formTypeRaw
      : 'Unknown';

  const flagsRaw = Array.isArray(raw.extractionFlags) ? raw.extractionFlags : [];
  const extractionFlags = flagsRaw
    .filter((f): f is string => typeof f === 'string')
    .slice(0, 32);

  let confidence = numOrNull(raw.extractionConfidence) ?? 0.5;
  if (confidence < 0) confidence = 0;
  if (confidence > 1) confidence = 1;

  return {
    name: str(raw.name),
    phone: str(raw.phone),
    phones,
    email: strOrNull(raw.email),
    dateOfBirth: strOrNull(raw.dateOfBirth),
    ageYears: intOrNull(raw.ageYears),
    address,
    gender,
    heightText: strOrNull(raw.heightText),
    weightLbs: numOrNull(raw.weightLbs),
    smokerStatus,
    coborrowerStatus,
    mortgageDetails,
    spouseName: strOrNull(raw.spouseName),
    spouseAgeYears: intOrNull(raw.spouseAgeYears),
    beneficiaryName: strOrNull(raw.beneficiaryName),
    formType,
    extractionConfidence: confidence,
    extractionFlags,
  };
}
