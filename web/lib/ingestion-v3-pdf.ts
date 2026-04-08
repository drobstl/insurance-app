import 'server-only';

import { extractApplicationFields } from './application-extractor';
import { IngestionV3Error } from './ingestion-v3-errors';
import { validateAndNormalizeV3ApplicationResult } from './ingestion-v3-validate';
import type { IngestionV3ApplicationResult } from './ingestion-v3-types';

/**
 * V3 ingestion wrapper around the proven extractApplicationFields function.
 * Delegates all PDF extraction to application-extractor.ts which is already
 * working in production with the correct model, schema, and output_config.
 */
export async function extractApplicationPdfV3(pdfBase64: string): Promise<IngestionV3ApplicationResult> {
  try {
    const result = await extractApplicationFields(pdfBase64);

    return validateAndNormalizeV3ApplicationResult({
      data: result.data,
      evidence: {},
      note: result.note,
    });
  } catch (error) {
    if (error instanceof IngestionV3Error) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Claude request failed.';
    const lower = message.toLowerCase();
    const isRetryable = lower.includes('timeout') || lower.includes('timed out') ||
      lower.includes('rate') || lower.includes('overloaded') || lower.includes('529');
    throw new IngestionV3Error(
      isRetryable ? 'CLAUDE_REQUEST_FAILED' : 'CLAUDE_SCHEMA_INVALID',
      message,
      { retryable: isRetryable, terminal: !isRetryable },
    );
  }
}

export const INGESTION_V3_PDF_MODEL = 'claude-sonnet-4-6';
