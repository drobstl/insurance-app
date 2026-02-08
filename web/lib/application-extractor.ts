import OpenAI from 'openai';
import { ExtractedApplicationData } from './types';

const SYSTEM_PROMPT = `You are an insurance application document parser. Your job is to extract structured data from raw text extracted from insurance application PDFs.

Return ONLY a valid JSON object with these fields (no markdown, no explanation, just the JSON):

{
  "policyType": one of "IUL", "Term Life", "Whole Life", "Mortgage Protection", "Accidental", or "Other",
  "policyNumber": string or null,
  "insuranceCompany": string or null,
  "policyOwner": string or null,
  "insuredName": string or null,
  "beneficiary": string or null,
  "coverageAmount": number or null,
  "premiumAmount": number or null,
  "premiumFrequency": one of "monthly", "quarterly", "semi-annual", "annual", or null,
  "renewalDate": "YYYY-MM-DD" or null,
  "insuredEmail": string or null,
  "insuredPhone": string or null,
  "note": string or null
}

Rules:
- "coverageAmount" = death benefit, face amount, specified amount, or coverage amount (in dollars, no commas/symbols)
- "premiumAmount" = planned premium, scheduled premium, or modal premium (in dollars)
- "policyType": IUL = Indexed Universal Life. Use "Other" if the product doesn't clearly fit a category.
- "insuranceCompany": use the carrier's common name (e.g. "Mutual of Omaha", not "United of Omaha Life Insurance Company")
- "policyOwner": the owner of the policy (often the insured, but not always)
- "insuredName": the person whose life is insured
- "beneficiary": primary beneficiary name(s)
- If a field cannot be determined from the text, set it to null — do NOT guess
- "note": brief note if you want to flag anything (e.g. "multiple beneficiaries listed, only primary shown")
- Return ONLY the JSON object`;

/**
 * Send extracted PDF text to OpenAI and get structured application data back.
 */
export async function extractApplicationFields(
  pdfText: string
): Promise<{ data: ExtractedApplicationData; note?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured. Add it to your .env.local file.');
  }

  const openai = new OpenAI({ apiKey });

  // Truncate extremely long documents to stay within token limits.
  // ~4 chars per token, 128k context window, but we only need ~30k tokens max.
  const maxChars = 100_000;
  const truncatedText = pdfText.length > maxChars
    ? pdfText.slice(0, maxChars) + '\n\n[Document truncated — remaining pages omitted]'
    : pdfText;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Extract all available fields from this insurance application:\n\n${truncatedText}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response received from AI. Please try again.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Failed to parse AI response. Please try again.');
  }

  // Extract the note separately, then build the typed data object
  const note = typeof parsed.note === 'string' ? parsed.note : undefined;

  const data: ExtractedApplicationData = {
    policyType: validatePolicyType(parsed.policyType),
    policyNumber: toStringOrNull(parsed.policyNumber),
    insuranceCompany: toStringOrNull(parsed.insuranceCompany),
    policyOwner: toStringOrNull(parsed.policyOwner),
    insuredName: toStringOrNull(parsed.insuredName),
    beneficiary: toStringOrNull(parsed.beneficiary),
    coverageAmount: toNumberOrNull(parsed.coverageAmount),
    premiumAmount: toNumberOrNull(parsed.premiumAmount),
    premiumFrequency: validateFrequency(parsed.premiumFrequency),
    renewalDate: toStringOrNull(parsed.renewalDate),
    insuredEmail: toStringOrNull(parsed.insuredEmail),
    insuredPhone: toStringOrNull(parsed.insuredPhone),
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
