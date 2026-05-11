import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

/**
 * Classify a thrown error as transient (the upstream webhook source should
 * retry) vs permanent (retry won't help; alert and move on).
 *
 * Transient = infrastructure shrugged (Firestore briefly unavailable,
 * timeout, rate limit). A retry a few seconds later has a real chance of
 * succeeding.
 *
 * Permanent = code bug or config drift (missing index, malformed data,
 * permission denied). Retrying just hammers the bug; the fix is in our
 * source tree, not in the sender's retry queue.
 *
 * Decision history: pre-May-11 the Linq webhook swallowed every error
 * with a 200, which hid the entries-collectionGroup missing-index bug for
 * ~3 days. Extracted here so Stripe (and any future webhook) can apply
 * the same shape.
 */
export function isTransientWebhookError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const codeRaw = (error as { code?: unknown }).code;
  if (typeof codeRaw === 'number') {
    return (
      codeRaw === 4 || // DEADLINE_EXCEEDED
      codeRaw === 8 || // RESOURCE_EXHAUSTED
      codeRaw === 13 || // INTERNAL
      codeRaw === 14 // UNAVAILABLE
    );
  }
  if (typeof codeRaw === 'string') {
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(codeRaw);
  }
  return false;
}

/**
 * Fire-and-forget Firestore write for a permanent webhook error so the
 * failure isn't invisible. Lives in a top-level `webhookErrors` collection
 * (not per-agent) because the error frequently happens BEFORE we resolve
 * which agent the inbound belongs to.
 *
 * Best-effort: if the alert write itself fails, the structured console
 * log at the call site is the fallback. Never let alerting block the
 * response.
 */
export async function recordPermanentWebhookError(params: {
  db: FirebaseFirestore.Firestore;
  source: string;
  error: unknown;
  context?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const err = params.error;
    const errObj = (typeof err === 'object' && err !== null
      ? (err as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && typeof err.stack === 'string' ? err.stack.slice(0, 2000) : null;
    const code = typeof errObj.code === 'number' || typeof errObj.code === 'string' ? errObj.code : null;
    const details = typeof errObj.details === 'string' ? errObj.details : null;
    await params.db.collection('webhookErrors').add({
      source: params.source,
      message,
      code,
      details,
      stack,
      context: params.context ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // Alerting is intentionally best-effort.
  }
}
