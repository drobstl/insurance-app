import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminStorage } from '../../../../../lib/firebase-admin';

export const maxDuration = 60;

// 100MB ceiling — a 40-60 page scanned lead bundle runs ~20-40MB; this
// leaves headroom without inviting an unbounded upload. The per-batch
// page cap (see ../route.ts) is the real guardrail.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const SIGNED_URL_TTL_MS = 10 * 60 * 1000;
let corsConfigured = false;

interface UploadUrlBody {
  fileName?: string;
  contentType?: string;
  fileSize?: number;
}

/**
 * POST /api/leads/batch/upload-url
 *
 * Returns a short-lived v4 signed URL the browser PUTs the lead-form PDF
 * straight to GCS with — keeping the (potentially 40MB) bytes off the
 * Vercel function entirely. The object path is server-chosen and scoped
 * to the authenticated agent so one agent can't seed another's batch.
 */
export async function POST(req: NextRequest) {
  try {
    const agentId = await authAgentId(req);
    if (!agentId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as UploadUrlBody;
    const fileName = (body.fileName || '').trim();
    const contentType = (body.contentType || 'application/pdf').trim();
    const fileSize = typeof body.fileSize === 'number' ? body.fileSize : 0;

    if (!fileName) {
      return NextResponse.json({ error: 'fileName is required.' }, { status: 400 });
    }
    if (fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File size is invalid for upload.' }, { status: 400 });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const gcsPath = `agents/${agentId}/leads/_batch-uploads/${Date.now()}-${randomUUID()}-${safeName}`;
    const bucket = getAdminStorage().bucket();
    await ensureBucketCors(bucket);
    const file = bucket.file(gcsPath);

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + SIGNED_URL_TTL_MS,
      contentType,
    });

    return NextResponse.json({ uploadUrl, gcsPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create upload URL.';
    console.error('[leads/batch/upload-url] signing failure:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function authAgentId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

async function ensureBucketCors(bucket: ReturnType<ReturnType<typeof getAdminStorage>['bucket']>) {
  if (corsConfigured) return;
  try {
    await bucket.setCorsConfiguration([
      {
        origin: [
          'https://agentforlife.app',
          'https://www.agentforlife.app',
          'https://*.vercel.app',
          'http://localhost:3000',
        ],
        method: ['PUT', 'POST', 'GET', 'HEAD', 'OPTIONS'],
        responseHeader: ['Content-Type', 'Authorization', 'x-goog-resumable'],
        maxAgeSeconds: 3600,
      },
    ]);
    corsConfigured = true;
  } catch (err) {
    // Keep the route non-fatal if the signer lacks bucket-admin; the
    // signed URL still works once CORS is configured out of band.
    console.warn('[leads/batch/upload-url] Unable to set bucket CORS automatically:', err);
  }
}
