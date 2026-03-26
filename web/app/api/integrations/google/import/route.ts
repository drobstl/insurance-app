import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { enqueueIngestionV3ProcessJob } from '../../../../../lib/cloud-tasks';
import { getAdminAuth, getAdminStorage } from '../../../../../lib/firebase-admin';
import { getGoogleDriveIntegration, updateGoogleDriveTokens } from '../../../../../lib/google-drive-store';
import { refreshGoogleAccessToken } from '../../../../../lib/google-oauth';
import {
  createIngestionV3Job,
  findExistingIngestionV3JobByIdempotency,
  setIngestionV3JobError,
} from '../../../../../lib/ingestion-v3-store';
import type { IngestionV3UploadPurpose } from '../../../../../lib/ingestion-v3-types';

export const maxDuration = 60;

const TOKEN_REFRESH_WINDOW_MS = 60_000;
const DOWNLOAD_CONCURRENCY = 3;
const PDF_MIME = 'application/pdf';

interface GoogleDriveImportFilePayload {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  sizeBytes?: number;
}

interface GoogleDriveImportRequestBody {
  purpose?: IngestionV3UploadPurpose;
  files?: GoogleDriveImportFilePayload[];
}

interface GoogleDriveImportFileResult {
  fileId: string;
  name: string;
  status: 'created' | 'reused' | 'failed';
  jobId?: string;
  jobStatus?: string;
  error?: string;
}

interface GoogleDriveImportRouteResponse {
  success: boolean;
  purpose?: IngestionV3UploadPurpose;
  results?: GoogleDriveImportFileResult[];
  error?: string;
}

interface NormalizedFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  sizeBytes: number;
}

function getCallbackUrl(req: NextRequest): string {
  const url = new URL(req.url);
  return `${url.origin}/api/integrations/google/callback`;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function requireAgentId(req: NextRequest): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.split('Bearer ')[1];
  const decoded = await getAdminAuth().verifyIdToken(token);
  return decoded.uid;
}

async function resolveGoogleAccessToken(req: NextRequest, agentId: string): Promise<string> {
  const integration = await getGoogleDriveIntegration(agentId);
  if (!integration?.connected) {
    throw new Error('Google Drive is not connected.');
  }

  const now = Date.now();
  const hasValidAccessToken =
    !!integration.accessToken &&
    typeof integration.expiryDateMs === 'number' &&
    integration.expiryDateMs > now + TOKEN_REFRESH_WINDOW_MS;

  if (hasValidAccessToken && integration.accessToken) {
    return integration.accessToken;
  }

  if (!integration.refreshToken) {
    throw new Error('Google token expired and no refresh token is available. Reconnect required.');
  }

  const refreshed = await refreshGoogleAccessToken({
    refreshToken: integration.refreshToken,
    redirectUri: getCallbackUrl(req),
  });

  const nextAccessToken = refreshed.accessToken || integration.accessToken;
  const nextRefreshToken = refreshed.refreshToken || integration.refreshToken;

  if (!nextAccessToken) {
    throw new Error('Unable to refresh Google access token.');
  }

  await updateGoogleDriveTokens(agentId, {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    expiryDateMs: refreshed.expiryDateMs,
    tokenType: refreshed.tokenType,
    scope: refreshed.scope,
  });

  return nextAccessToken;
}

function normalizeFiles(files: GoogleDriveImportFilePayload[] | undefined): NormalizedFile[] {
  if (!Array.isArray(files)) return [];
  return files
    .map((file) => {
      const id = (file.id || '').trim();
      const name = (file.name || '').trim();
      if (!id || !name) return null;
      const mimeType = (file.mimeType || PDF_MIME).trim() || PDF_MIME;
      const modifiedTime = (file.modifiedTime || '').trim();
      const sizeBytes = typeof file.sizeBytes === 'number' && Number.isFinite(file.sizeBytes) ? file.sizeBytes : 0;
      return { id, name, mimeType, modifiedTime, sizeBytes };
    })
    .filter((file): file is NormalizedFile => !!file);
}

async function downloadDriveFile(
  accessToken: string,
  file: NormalizedFile,
): Promise<{ buffer: Buffer; contentType: string }> {
  const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!downloadRes.ok) {
    let reason = `Drive download failed (${downloadRes.status}).`;
    try {
      const errJson = (await downloadRes.json()) as { error?: { message?: string } };
      if (errJson?.error?.message) reason = errJson.error.message;
    } catch {
      // Keep fallback status text.
    }
    throw new Error(reason);
  }

  const arr = await downloadRes.arrayBuffer();
  const contentType = (downloadRes.headers.get('content-type') || file.mimeType || PDF_MIME).trim();
  return {
    buffer: Buffer.from(arr),
    contentType,
  };
}

async function processOneFile(params: {
  agentId: string;
  purpose: IngestionV3UploadPurpose;
  accessToken: string;
  file: NormalizedFile;
}): Promise<GoogleDriveImportFileResult> {
  const { agentId, purpose, accessToken, file } = params;
  try {
    if (file.mimeType !== PDF_MIME) {
      throw new Error('Only PDF files are supported for Google Drive import.');
    }

    const idempotencyKey = `drive:${file.id}:${file.modifiedTime || 'unknown'}:${Math.max(0, Math.floor(file.sizeBytes))}`;
    const existing = await findExistingIngestionV3JobByIdempotency({
      agentId,
      idempotencyKey,
    });
    if (existing) {
      return {
        fileId: file.id,
        name: file.name,
        status: 'reused',
        jobId: existing.id,
        jobStatus: existing.status,
      };
    }

    const downloaded = await downloadDriveFile(accessToken, file);
    const safeName = sanitizeFileName(file.name);
    const gcsPath = `ingestion/v3/${purpose}/${Date.now()}-${randomUUID()}-${safeName}`;

    await getAdminStorage()
      .bucket()
      .file(gcsPath)
      .save(downloaded.buffer, {
        contentType: downloaded.contentType || PDF_MIME,
        resumable: false,
      });

    const created = await createIngestionV3Job({
      mode: purpose,
      gcsPath,
      fileName: file.name,
      contentType: downloaded.contentType || file.mimeType || PDF_MIME,
      maxAttempts: 4,
      agentId,
      idempotencyKey,
    });

    try {
      await enqueueIngestionV3ProcessJob(created.id);
    } catch (enqueueError) {
      const enqueueMessage =
        enqueueError instanceof Error ? enqueueError.message : 'Failed to dispatch processing task.';
      await setIngestionV3JobError(
        created.id,
        {
          code: 'TASK_ENQUEUE_FAILED',
          message: enqueueMessage,
          retryable: true,
          terminal: false,
        },
        'failed',
      );
      return {
        fileId: file.id,
        name: file.name,
        status: 'failed',
        jobId: created.id,
        error: enqueueMessage,
      };
    }

    return {
      fileId: file.id,
      name: file.name,
      status: 'created',
      jobId: created.id,
      jobStatus: created.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import Google Drive file.';
    return {
      fileId: file.id,
      name: file.name,
      status: 'failed',
      error: message,
    };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<GoogleDriveImportRouteResponse>> {
  try {
    const agentId = await requireAgentId(req);
    const body = (await req.json()) as GoogleDriveImportRequestBody;
    const purpose: IngestionV3UploadPurpose = body.purpose === 'application' ? 'application' : 'bob';
    const files = normalizeFiles(body.files);

    if (files.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No Google Drive files were selected.',
        },
        { status: 400 },
      );
    }

    const accessToken = await resolveGoogleAccessToken(req, agentId);
    const results: GoogleDriveImportFileResult[] = new Array(files.length);

    let nextIndex = 0;
    const workerCount = Math.min(DOWNLOAD_CONCURRENCY, files.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < files.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await processOneFile({
          agentId,
          purpose,
          accessToken,
          file: files[currentIndex],
        });
      }
    });

    await Promise.all(workers);

    return NextResponse.json({
      success: true,
      purpose,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import files from Google Drive.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
