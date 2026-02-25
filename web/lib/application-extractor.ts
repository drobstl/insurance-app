import OpenAI from 'openai';
import { ExtractedApplicationData, Beneficiary } from './types';

const SYSTEM_PROMPT = `You are an expert insurance application document parser. You extract structured data from raw text that was programmatically extracted from fillable insurance application PDFs.

CRITICAL — UNDERSTANDING THE TEXT FORMAT:
The text comes from fillable PDF forms where labels and filled-in values are often on SEPARATE lines. Form field labels (e.g. "Proposed Insured:", "Owner:", "Primary Beneficiary:") appear first, followed by blank lines or underscores, then the actual filled-in values appear nearby — often on the next line or several lines later, in the same positional order as the labels. You MUST carefully match values to their corresponding labels by reading the document structure.

For example, if you see:
  Proposed Insured: _____ (First) (Middle) (Last)
  Owner: Name _________ SS#_________ Address:_________
  Primary Beneficiary _________ SS#_________ Relationship _________
  ...
  John    A    Smith
  Jane Smith                        123-45-6789     123 Main St
  Mary Johnson                      987-65-4321     Daughter

Then: Proposed Insured = "John A Smith", Owner = "Jane Smith", Primary Beneficiary = "Mary Johnson" (Daughter).

ROLE DISAMBIGUATION (extremely important):
- "Proposed Insured" / "Applicant" / "Insured" = the person whose life is being insured. This is the MAIN person on the application.
- "Owner" / "Policy Owner" = the person who owns the policy (often the same as the insured, but can be different — e.g. a parent or spouse).
- "Primary Beneficiary" = the person who receives the death benefit. This is NOT the insured. The beneficiary's name often appears with a "Relationship" field (e.g. "Spouse", "Brother", "Child").
- Do NOT confuse these roles. If a name appears next to "Beneficiary" or has a relationship label, it is the BENEFICIARY, not the insured.

The text you receive contains selected pages annotated with page numbers (e.g. "--- Page 3 ---"). Use information from ALL provided pages.

Return ONLY a valid JSON object with these fields:

{
  "policyType": one of "IUL", "Term Life", "Whole Life", "Mortgage Protection", "Accidental", or "Other",
  "policyNumber": string or null,
  "insuranceCompany": string or null,
  "policyOwner": string or null,
  "insuredName": string or null,
  "beneficiaries": [{ "name": string, "relationship": string or null, "percentage": number or null, "type": "primary" or "contingent" }] or null,
  "coverageAmount": number or null,
  "premiumAmount": number or null,
  "premiumFrequency": one of "monthly", "quarterly", "semi-annual", "annual", or null,
  "renewalDate": "YYYY-MM-DD" or null,
  "insuredEmail": string or null,
  "insuredPhone": string or null,
  "insuredDateOfBirth": "YYYY-MM-DD" or null,
  "effectiveDate": "YYYY-MM-DD" or null,
  "note": string or null
}

FIELD EXTRACTION RULES:

"insuredName": The "Proposed Insured" or "Applicant" — the person whose life is insured. This name usually appears near the TOP of page 1 right after the form header fields. It is NOT the beneficiary. Include first, middle, and last name if available. Strip any trailing "X" characters (form checkboxes).

"policyOwner": The "Owner" of the policy. If labeled "Owner: Name ___" the filled value is the owner. Often the same person as the insured.

"beneficiaries": The "Primary Beneficiary" and/or "Contingent Beneficiary". Each must have a proper NAME (not just "Brother" or "Spouse"). The relationship label (e.g. "Brother", "Spouse", "Child") goes in the "relationship" field. Look in the main application AND any addendum pages which often have structured beneficiary tables.

"coverageAmount": The "Face Amount", "Death Benefit", "Coverage Amount", or "Specified Amount" in dollars. This is the actual policy coverage, NOT any maximum limit mentioned in legal disclaimers or conditional receipt clauses. Parse as a number (e.g. 191000, not "$191,000").

"premiumAmount": The "Modal Premium", "Planned Premium", or "Scheduled Premium". Look for a dollar amount near premium/payment fields. Parse as a number.

"premiumFrequency": Determined by the payment mode. "Bank Draft" with monthly indicators = "monthly". Look for "Mode:", "Payment Mode:", "Billing Frequency:" fields. Common indicators: "Monthly"/"Bank Draft"/"MON" = monthly, "Quarterly"/"QTR" = quarterly, "Semi-Annual"/"SA" = semi-annual, "Annual"/"ANN" = annual.

"policyNumber": The application/case/policy/certificate number. Often appears as a repeating reference number on multiple pages (e.g. "M3166549") or near "Policy Number:", "Application Number:", "Certificate Number:", "Telephone Case No:". Do NOT confuse with SS#, DL#, agent numbers, or form numbers (like "ICC18-AA3487").

"policyType": Classify the product:
  - "Mortgage Protection" = plans named "Home Certainty", "Mortgage Protection", "MP", or applications with mortgage company/loan sections
  - "IUL" = "Indexed Universal Life", "IUL"
  - "Term Life" = "Term", "Level Term", "Return of Premium Term"
  - "Whole Life" = "Whole Life", "WL", "Ordinary Life"
  - "Accidental" = "Accidental Death", "AD&D"
  - "Other" = only if the product doesn't fit any category above

"insuranceCompany": The carrier's common/short name. Common mappings:
  - "American-Amicable Life Insurance Company of Texas" → "American-Amicable"
  - "Mutual of Omaha Insurance Company" → "Mutual of Omaha"
  - "National Western Life Insurance Company" → "National Western Life"
  Use the recognizable carrier name, not the full legal entity name.

"insuredDateOfBirth": Look for "Date of Birth", "DOB", "Birth Date" near the insured's info. Format: YYYY-MM-DD. Parse dates like "06/27/1964" → "1964-06-27".

"insuredEmail": ONLY extract if an actual email address is visible in the text. Set to null if no email is found. NEVER fabricate or guess an email address.

"insuredPhone": Phone number of the insured. Look for "Phone", "Telephone", "Cell" fields.

"effectiveDate": Policy effective date, issue date, requested policy date, or application date. Format: YYYY-MM-DD.

STRICT RULES:
- NEVER fabricate, guess, or infer values that are not explicitly present in the text
- If a field cannot be determined, set it to null
- The beneficiary is NEVER the insured — they are different people/roles
- Strip trailing "X" characters from names (these are checkbox marks in the form)
- "note": brief note flagging anything unusual or uncertain
- Return ONLY the JSON object — no markdown, no explanation`;

// ─── Page relevance scoring ────────────────────────────────

/**
 * Keywords grouped by the field(s) they help identify.
 * Each keyword is lowercased for matching.
 */
const RELEVANCE_KEYWORDS: string[] = [
  // Identity / parties
  'insured', 'applicant', 'proposed insured', 'owner', 'policy owner',
  'beneficiary', 'primary beneficiary', 'contingent beneficiary',
  // Coverage / premium
  'face amount', 'death benefit', 'coverage amount', 'specified amount',
  'initial death benefit', 'base face amount',
  'premium', 'planned premium', 'scheduled premium', 'modal premium',
  'premium mode', 'premium frequency', 'payment mode', 'billing frequency',
  'bank draft', 'modal prem',
  // Policy identification
  'policy number', 'application number', 'certificate number',
  'case no', 'telephone case',
  'effective date', 'issue date', 'renewal date',
  // Product type
  'indexed universal life', 'term life', 'whole life', 'universal life',
  'mortgage protection', 'accidental death',
  'home certainty', 'mortgage company', 'mortgage loan',
  // Carrier identification (page 1 / header)
  'life insurance company', 'insurance company', 'underwritten by',
  // Contact info
  'email', 'e-mail', 'phone', 'telephone', 'cell',
  // Personal details
  'date of birth', 'dob', 'birth date', 'born', 'birthdate',
  // Supplemental pages with structured data
  'addendum', 'beneficiary details', 'driver', 'bank account',
];

/** Score a single page's text for relevance to the fields we extract. */
function scorePage(pageText: string): number {
  const lower = pageText.toLowerCase();
  let score = 0;
  for (const kw of RELEVANCE_KEYWORDS) {
    if (lower.includes(kw)) score += 1;
  }
  return score;
}

/**
 * Select the most relevant pages from the document.
 *
 * Strategy:
 * - Always include page 1 (carrier name, product type, often insured name).
 * - Score every remaining page by keyword hits.
 * - Take the top pages until we hit the character budget.
 * - Maintain original page order in the output.
 */
function selectRelevantPages(
  pages: string[],
  maxChars: number = 30_000,
): { text: string; selectedPages: number[]; totalPages: number } {
  if (pages.length === 0) return { text: '', selectedPages: [], totalPages: 0 };

  // Score each page (1-indexed for display)
  const scored = pages.map((text, idx) => ({
    pageNum: idx + 1,
    text,
    score: scorePage(text),
    chars: text.length,
  }));

  // Always include page 1; sort the rest by score descending
  const first = scored[0];
  const rest = scored.slice(1).sort((a, b) => b.score - a.score);

  const selected: typeof scored = [first];
  let charCount = first.chars;

  for (const page of rest) {
    // Skip pages with zero relevance (HIPAA notices, signature pages, etc.)
    if (page.score === 0) continue;
    if (charCount + page.chars > maxChars) continue;
    selected.push(page);
    charCount += page.chars;
  }

  // Restore original page order so the LLM reads them sequentially
  selected.sort((a, b) => a.pageNum - b.pageNum);

  const selectedPages = selected.map((p) => p.pageNum);
  const text = selected
    .map((p) => `--- Page ${p.pageNum} ---\n${p.text}`)
    .join('\n\n');

  return { text, selectedPages, totalPages: pages.length };
}

// ─── Main extraction ───────────────────────────────────────

/**
 * Send extracted PDF text to OpenAI and get structured application data back.
 * Accepts per-page text so we can intelligently select only the relevant pages,
 * regardless of carrier or application format.
 */
export async function extractApplicationFields(
  pages: string[]
): Promise<{ data: ExtractedApplicationData; note?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured. Add it to your .env.local file.');
  }

  const openai = new OpenAI({ apiKey });

  const { text, selectedPages, totalPages } = selectRelevantPages(pages, 60_000);

  const pageNote =
    selectedPages.length < totalPages
      ? `\n\n[Showing ${selectedPages.length} of ${totalPages} pages — pages ${selectedPages.join(', ')}]`
      : '';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Extract all available fields from this insurance application:\n\n${text}${pageNote}`,
      },
    ],
  }, { timeout: 45_000 });

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
    beneficiaries: parseBeneficiaries(parsed.beneficiaries),
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
