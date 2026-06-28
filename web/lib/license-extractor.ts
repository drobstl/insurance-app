import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { isRetryableExtractionError } from './extraction-errors';
import { PRIMARY_MODEL } from './ai-models';
import { isValidStateCode } from './agent-licenses';

/**
 * Agent state-license autofill extractor.
 *
 * Reads the license number, issuing state, and expiration date off an
 * uploaded insurance-producer license so the agent doesn't have to type
 * them by hand in the State Licenses settings section. Convenience only:
 * the agent always reviews and can edit the prefilled fields before
 * saving, so a miss or a null degrades cleanly to manual entry.
 *
 * Mirrors the lead-form extractor's primitives (Anthropic Claude with
 * JSON-schema structured output, base64 document/image attachment,
 * exponential-backoff retry) but is a SEPARATE module — it shares
 * nothing with the locked application/lead pipelines, so changes here
 * never touch them. Single fast pass (no escalation): producer licenses
 * are printed/typed documents the primary model reads reliably, and the
 * human confirm step is the real safety net.
 */

export interface ExtractedLicenseFields {
  /** State producer license number as printed; NOT the NPN. Null if unreadable. */
  licenseNumber: string | null;
  /** 2-letter USPS code of the issuing state, validated. Null if not determinable. */
  stateCode: string | null;
  /** Expiration date, YYYY-MM-DD. Null if absent. */
  expiresOn: string | null;
  /** Model's self-rated overall confidence, 0–1. */
  confidence: number;
}

export type LicenseFileContentType = 'application/pdf' | 'image/jpeg' | 'image/png';

const LICENSE_SCHEMA = {
  type: 'object',
  properties: {
    licenseNumber: {
      type: ['string', 'null'],
      description:
        'The STATE-issued insurance producer license number for the license shown, exactly as printed (preserve letters, digits, and any leading zeros). This is NOT the National Producer Number (NPN) — if both appear, return the state license number and ignore the NPN. Null if not clearly present.',
    },
    stateCode: {
      type: ['string', 'null'],
      description:
        '2-letter USPS code of the issuing state (e.g. CA, TX, FL). Convert from a full state name if the document spells it out. Null if not determinable.',
    },
    expiresOn: {
      type: ['string', 'null'],
      description:
        'License expiration date in YYYY-MM-DD format. Null if no expiration date is shown.',
    },
    confidence: {
      type: 'number',
      description:
        'Self-rated overall confidence 0–1. Lower (≤0.6) when the image is blurry, the number is partly obscured, or the document is an unfamiliar layout.',
    },
  },
  required: ['licenseNumber', 'stateCode', 'expiresOn', 'confidence'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an expert at reading United States insurance producer license documents.

You will be given a single document: a state insurance department license, a NIPR or state-portal licensing printout, or a photo/scan/screenshot of one. Extract exactly three things:

1. licenseNumber — the STATE-issued producer license number for the license shown, exactly as printed. Preserve letters, digits, and any leading zeros. This is NOT the National Producer Number (NPN). If both a state license number and an NPN appear, return the state license number and ignore the NPN.
2. stateCode — the 2-letter USPS code of the issuing state.
3. expiresOn — the expiration date in YYYY-MM-DD format.

If the document lists licenses for multiple states, use the single most prominent one. Return null for any field you cannot read confidently or that is not present. NEVER guess or fabricate a value — the agent reviews these and will fill in anything missing by hand. Self-rate your overall confidence from 0 to 1.`;

const MAX_TOKENS = 512;
const MAX_RETRIES = 3;

let cachedClient: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (cachedClient) return cachedClient;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');
  cachedClient = new Anthropic({ apiKey: key });
  return cachedClient;
}

/**
 * Extract the license number, state, and expiration from a base64-encoded
 * license file (PDF / JPEG / PNG). Exponential-backoff retry on transient
 * API errors. Throws on unrecoverable failure — the caller (the extract
 * route) soft-fails to `fields: null` so the agent can still type manually.
 */
export async function extractLicenseFields(
  fileBase64: string,
  contentType: LicenseFileContentType,
): Promise<ExtractedLicenseFields> {
  const anthropic = getAnthropic();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: PRIMARY_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        output_config: {
          format: {
            type: 'json_schema',
            schema: LICENSE_SCHEMA,
          },
        },
        messages: [
          {
            role: 'user',
            content: [
              // `document` block for PDFs, `image` block for JPEG/PNG.
              contentType === 'application/pdf'
                ? {
                    type: 'document',
                    source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 },
                  }
                : {
                    type: 'image',
                    source: { type: 'base64', media_type: contentType, data: fileBase64 },
                  },
              {
                type: 'text',
                text: 'Extract the state license number, issuing state, and expiration date from this license.',
              },
            ],
          },
        ],
      });

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
      console.error(`[license-extractor] attempt ${attempt + 1}/${MAX_RETRIES} failed:`, err);
      if (!isRetryableExtractionError(err) || attempt === MAX_RETRIES - 1) break;
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('License extraction failed after retries.');
}

/**
 * Normalize the raw model JSON to the strict ExtractedLicenseFields shape.
 * Defensive against missing keys, wrong types, an invalid state code, or a
 * malformed date — anything uncertain becomes null so the UI leaves that
 * field blank for the agent rather than prefilling a bad value.
 */
function normalize(raw: Record<string, unknown>): ExtractedLicenseFields {
  const licenseNumber =
    typeof raw.licenseNumber === 'string' && raw.licenseNumber.trim()
      ? raw.licenseNumber.trim()
      : null;

  const stateRaw = typeof raw.stateCode === 'string' ? raw.stateCode.trim().toUpperCase() : '';
  const stateCode = isValidStateCode(stateRaw) ? stateRaw : null;

  const expRaw = typeof raw.expiresOn === 'string' ? raw.expiresOn.trim() : '';
  const expiresOn = /^\d{4}-\d{2}-\d{2}$/.test(expRaw) ? expRaw : null;

  let confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? raw.confidence : 0.5;
  if (confidence < 0) confidence = 0;
  if (confidence > 1) confidence = 1;

  return { licenseNumber, stateCode, expiresOn, confidence };
}
