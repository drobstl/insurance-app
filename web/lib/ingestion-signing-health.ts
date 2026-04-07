import 'server-only';

import { randomUUID } from 'crypto';
import { getAdminStorage } from './firebase-admin';

export interface IngestionSigningCanaryResult {
  ok: boolean;
  stage: 'generate_signed_url' | 'signed_put' | 'verify_exists' | 'cleanup';
  objectPath: string;
  timingsMs: {
    signUrl: number;
    put: number;
    verify: number;
    cleanup?: number;
    total: number;
  };
  details?: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function classifySigningError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('signaturedoesnotmatch')) return 'SIGNATURE_MISMATCH';
  if (lower.includes('invalid jwt signature')) return 'INVALID_JWT_SIGNATURE';
  if (lower.includes('invalid_grant')) return 'INVALID_GRANT';
  if (lower.includes('permission denied')) return 'PERMISSION_DENIED';
  if (lower.includes('unauthenticated')) return 'UNAUTHENTICATED';
  if (lower.includes('timed out') || lower.includes('timeout')) return 'TIMEOUT';
  return 'UNKNOWN';
}

export async function runIngestionSigningCanary(): Promise<IngestionSigningCanaryResult> {
  const startedAt = Date.now();
  const objectPath = `ingestion/v3/canary/${Date.now()}-${randomUUID()}.txt`;
  const file = getAdminStorage().bucket().file(objectPath);
  const timingsMs: IngestionSigningCanaryResult['timingsMs'] = {
    signUrl: 0,
    put: 0,
    verify: 0,
    total: 0,
  };

  try {
    const signStart = Date.now();
    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 5 * 60 * 1000,
      contentType: 'text/plain',
    });
    timingsMs.signUrl = Date.now() - signStart;

    const putStart = Date.now();
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: `canary:${Date.now()}`,
    });
    timingsMs.put = Date.now() - putStart;

    if (!putRes.ok) {
      const bodyText = await putRes.text();
      throw new Error(`PUT failed (${putRes.status}): ${bodyText.slice(0, 200)}`);
    }

    const verifyStart = Date.now();
    const [exists] = await file.exists();
    timingsMs.verify = Date.now() - verifyStart;
    if (!exists) {
      throw new Error('Uploaded canary object was not found after PUT.');
    }

    const cleanupStart = Date.now();
    await file.delete({ ignoreNotFound: true });
    timingsMs.cleanup = Date.now() - cleanupStart;
    timingsMs.total = Date.now() - startedAt;

    return {
      ok: true,
      stage: 'cleanup',
      objectPath,
      timingsMs,
    };
  } catch (error) {
    timingsMs.total = Date.now() - startedAt;
    const message = toErrorMessage(error);
    const stage: IngestionSigningCanaryResult['stage'] =
      timingsMs.put === 0
        ? 'generate_signed_url'
        : timingsMs.verify === 0
          ? 'signed_put'
          : 'verify_exists';

    try {
      const cleanupStart = Date.now();
      await file.delete({ ignoreNotFound: true });
      timingsMs.cleanup = Date.now() - cleanupStart;
    } catch {
      // best effort cleanup only
    }

    return {
      ok: false,
      stage,
      objectPath,
      timingsMs,
      details: message,
    };
  }
}
