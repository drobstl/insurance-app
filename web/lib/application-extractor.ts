import OpenAI from 'openai';
import { ExtractedApplicationData } from './types';

const SYSTEM_PROMPT = `You are an insurance application document parser. Your job is to extract structured data from raw text extracted from insurance application PDFs.

The text you receive contains selected pages from the application, annotated with page numbers (e.g. "--- Page 3 ---"). Pages are selected based on relevance — not every page of the original document is included. Use information from ALL provided pages to fill in as many fields as possible.

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
  // Policy identification
  'policy number', 'application number', 'certificate number',
  'effective date', 'issue date', 'renewal date',
  // Product type
  'indexed universal life', 'term life', 'whole life', 'universal life',
  'mortgage protection', 'accidental death',
  // Carrier identification (page 1 / header)
  'life insurance company', 'insurance company', 'underwritten by',
  // Contact info
  'email', 'e-mail', 'phone', 'telephone', 'cell',
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

  const { text, selectedPages, totalPages } = selectRelevantPages(pages, 30_000);

  const pageNote =
    selectedPages.length < totalPages
      ? `\n\n[Showing ${selectedPages.length} of ${totalPages} pages — pages ${selectedPages.join(', ')}]`
      : '';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Extract all available fields from this insurance application:\n\n${text}${pageNote}`,
      },
    ],
  }, { timeout: 30_000 });

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
