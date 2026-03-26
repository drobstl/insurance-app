import Anthropic from '@anthropic-ai/sdk';

export function shouldGracefullyDegradeApplicationExtraction(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('rate limit') ||
    normalized.includes('429') ||
    normalized.includes('500') ||
    normalized.includes('502') ||
    normalized.includes('503') ||
    normalized.includes('529') ||
    normalized.includes('overloaded') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('fetch failed') ||
    normalized.includes('econnreset') ||
    normalized.includes('no response received from ai') ||
    normalized.includes('failed to parse ai response')
  );
}

export function isRetryableExtractionError(err: unknown): boolean {
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
