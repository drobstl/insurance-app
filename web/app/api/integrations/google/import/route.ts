import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { enqueueIngestionV3ProcessJob } from '../../../../../lib/cloud-tasks';
import { getAdminAuth, getAdminStorage } from '../../../../../lib/firebase-admin';
import { getGoogleDriveIntegration, updateGoogleDriveTokens } from '../../../../../lib/google-drive-store';
import { refreshGoogleAccessToken } from '../../../../../lib/google-oauth';
import { createBatchJob, registerBatchFile, updateBatchFileStatus } from '../../../../../lib/ingestion-v3-batch-store';
import {
  createIngestionV3Job,
  findExistingIngestionV3JobByIdempotency,
  setIngestionV3JobError,
} from '../../../../../lib/ingestion-v3-store';
import type { IngestionV3UploadPurpose } from '../../../../../lib/ingestion-v3-types';

export const maxDuration = 120;

const TOKEN_REFRESH_WINDOW_MS = 60_000;
const DOWNLOAD_CONCURRENCY = 5;
const MAX_FILES_PER_IMPORT = 50;
const DOWNLOAD_MAX_RETRIES = 3;
const DOWNLOAD_RETRY_DELAYS_MS = [500, 1500];

const PDF_MIME = 'application/pdf';
const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

const SUPPORTED_MIMES = new Set([
  'application/pdf',
  'text/csv',
  'text/tab-separated-values',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  GOOGLE_SHEET_MIME,
]);

// ─── Request / Response Types ─────────────────────────────

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

interface ResolvedFileInfo {
  id: string;
  name: string;
  mimeType: string;
  fromFolder?: string;
}

interface GoogleDriveImportRouteResponse {
  success: boolean;
  batchId?: string;
  purpose?: IngestionV3UploadPurpose;
  resolvedFiles?: ResolvedFileInfo[];
  results?: GoogleDriveImportFileResult[];
  error?: string;
}

interface NormalizedFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  sizeBytes: number;
  fromFolder?: string;
}

// ─── Auth Helpers ─────────────────────────────────────────

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

// ─── Normalization ────────────────────────────────────────

function normalizeFiles(files: GoogleDriveImportFilePayload[] | undefined): NormalizedFile[] {
  if (!Array.isArray(files)) return [];
  return files
    .map((file) => {
      const id = (file.id || '').trim();
      const name = (file.name || '').trim();
      if (!id || !name) return null;
      const mimeType = (file.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
      const modifiedTime = (file.modifiedTime || '').trim();
      const sizeBytes = typeof file.sizeBytes === 'number' && Number.isFinite(file.sizeBytes) ? file.sizeBytes : 0;
      return { id, name, mimeType, modifiedTime, sizeBytes };
    })
    .filter((file): file is NormalizedFile => !!file);
}

// ─── Folder Listing ───────────────────────────────────────

/**
 * Lists top-level files in a Google Drive folder.
 * Filters to supported MIME types only. No recursion into subfolders.
 */
async function listFolderContents(
  accessToken: string,
  folderId: string,
  folderName: string,
): Promise<NormalizedFile[]> {
  const allFiles: NormalizedFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size)',
      pageSize: '100',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      let reason = `Failed to list folder contents (${res.status}).`;
      try {
        const errJson = (await res.json()) as { error?: { message?: string } };
        if (errJson?.error?.message) reason = errJson.error.message;
      } catch {
        // Keep fallback
      }
      throw new Error(reason);
    }

    const body = (await res.json()) as {
      files?: { id?: string; name?: string; mimeType?: string; modifiedTime?: string; size?: string }[];
      nextPageToken?: string;
    };

    for (const entry of body.files || []) {
      const id = (entry.id || '').trim();
      const name = (entry.name || '').trim();
      const mimeType = (entry.mimeType || '').trim();
      if (!id || !name || !mimeType) continue;
      if (!SUPPORTED_MIMES.has(mimeType)) continue;

      allFiles.push({
        id,
        name,
        mimeType,
        modifiedTime: (entry.modifiedTime || '').trim(),
        sizeBytes: typeof entry.size === 'string' ? parseInt(entry.size, 10) || 0 : 0,
        fromFolder: folderName,
      });

      if (allFiles.length >= MAX_FILES_PER_IMPORT) break;
    }

    pageToken = body.nextPageToken;
  } while (pageToken && allFiles.length < MAX_FILES_PER_IMPORT);

  return allFiles;
}

// ─── File Download ────────────────────────────────────────

/**
 * Exports a native Google Sheet to CSV via the Drive export endpoint.
 * Native Google Workspace files cannot be downloaded via ?alt=media.
 */
async function exportGoogleSheet(
  accessToken: string,
  fileId: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/csv`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    let reason = `Google Sheets export failed (${res.status}).`;
    try {
      const errJson = (await res.json()) as { error?: { message?: string } };
      if (errJson?.error?.message) reason = errJson.error.message;
    } catch {
      // Keep fallback
    }
    throw new Error(reason);
  }

  const arr = await res.arrayBuffer();
  return { buffer: Buffer.from(arr), contentType: 'text/csv' };
}

/**
 * Downloads a file from Google Drive. Routes Google Sheets to the export
 * endpoint; all other file types use ?alt=media.
 *
 * Retries up to 3 times with backoff for transient errors.
 */
async function downloadDriveFile(
  accessToken: string,
  file: NormalizedFile,
): Promise<{ buffer: Buffer; contentType: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt < DOWNLOAD_MAX_RETRIES; attempt++) {
    try {
      // Google Sheets must be exported, not downloaded
      if (file.mimeType === GOOGLE_SHEET_MIME) {
        return await exportGoogleSheet(accessToken, file.id);
      }

      const downloadRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        },
      );

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
      return { buffer: Buffer.from(arr), contentType };
    } catch (err) {
      lastError = err;
      // Don't retry 4xx errors (auth, not found, etc.)
      if (err instanceof Error && /\(4\d{2}\)/.test(err.message)) throw err;
      if (attempt < DOWNLOAD_MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, DOWNLOAD_RETRY_DELAYS_MS[attempt] || 1500));
      }
    }
  }

  throw lastError;
}

// ─── Process One File ─────────────────────────────────────

async function processOneFile(params: {
  agentId: string;
  purpose: IngestionV3UploadPurpose;
  accessToken: string;
  file: NormalizedFile;
  batchId: string;
}): Promise<GoogleDriveImportFileResult> {
  const { agentId, purpose, accessToken, file, batchId } = params;
  try {
    if (!SUPPORTED_MIMES.has(file.mimeType)) {
      throw new Error(`Unsupported file type: ${file.mimeType}. Supported: PDF, CSV, TSV, Excel, Google Sheets.`);
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

    // For Google Sheets exports, ensure the filename ends in .csv so the
    // downstream processor routes to the structured (CSV) extraction branch.
    let fileName = file.name;
    let contentType = downloaded.contentType;
    if (file.mimeType === GOOGLE_SHEET_MIME) {
      if (!fileName.toLowerCase().endsWith('.csv')) {
        fileName = fileName + '.csv';
      }
      contentType = 'text/csv';
    }

    const safeName = sanitizeFileName(fileName);
    const gcsPath = `ingestion/v3/${purpose}/${Date.now()}-${randomUUID()}-${safeName}`;

    await getAdminStorage()
      .bucket()
      .file(gcsPath)
      .save(downloaded.buffer, {
        contentType: contentType || PDF_MIME,
        resumable: false,
      });

    const created = await createIngestionV3Job({
      mode: purpose,
      gcsPath,
      fileName,
      contentType: contentType || file.mimeType || PDF_MIME,
      maxAttempts: 4,
      agentId,
      idempotencyKey,
      batchId,
    });

    try {
      console.log(`[drive-import] Enqueuing Cloud Task for job ${created.id} (file: ${file.name})`);
      await enqueueIngestionV3ProcessJob(created.id);
      console.log(`[drive-import] Successfully enqueued job ${created.id} (file: ${file.name})`);
    } catch (enqueueError) {
      console.error(`[drive-import] ENQUEUE FAILED for job ${created.id} (file: ${file.name}):`, enqueueError);
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

// ─── POST Handler ─────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse<GoogleDriveImportRouteResponse>> {
  try {
    const agentId = await requireAgentId(req);
    const body = (await req.json()) as GoogleDriveImportRequestBody;
    const purpose: IngestionV3UploadPurpose = body.purpose === 'application' ? 'application' : 'bob';
    const inputFiles = normalizeFiles(body.files);

    if (inputFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No Google Drive files were selected.' },
        { status: 400 },
      );
    }

    const accessToken = await resolveGoogleAccessToken(req, agentId);

    // ── Folder expansion ──
    // Partition into folders vs direct files, expand folders, deduplicate
    const folders = inputFiles.filter((f) => f.mimeType === GOOGLE_FOLDER_MIME);
    const directFiles = inputFiles.filter((f) => f.mimeType !== GOOGLE_FOLDER_MIME);

    const resolvedFiles: NormalizedFile[] = [...directFiles];
    const seenIds = new Set(directFiles.map((f) => f.id));

    for (const folder of folders) {
      const children = await listFolderContents(accessToken, folder.id, folder.name);
      for (const child of children) {
        if (!seenIds.has(child.id)) {
          seenIds.add(child.id);
          resolvedFiles.push(child);
        }
      }
    }

    if (resolvedFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No supported files found. Folders may be empty or contain only unsupported file types.' },
        { status: 400 },
      );
    }

    if (resolvedFiles.length > MAX_FILES_PER_IMPORT) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many files (${resolvedFiles.length}). Maximum ${MAX_FILES_PER_IMPORT} files per import. Select fewer files or a smaller folder.`,
        },
        { status: 400 },
      );
    }

    // ── Create batch doc FIRST with correct totalFiles count ──
    // This gives us the real Firestore doc ID before any ingestion jobs are
    // created, so every job gets the correct batchId from the moment it's
    // written. No window where a processor can read a stale or incorrect ID.
    const batchId = await createBatchJob(agentId, 'drive', resolvedFiles.length);

    // ── Process files: download, upload to GCS, create ingestion jobs ──
    const results: GoogleDriveImportFileResult[] = new Array(resolvedFiles.length);

    let nextIndex = 0;
    const workerCount = Math.min(DOWNLOAD_CONCURRENCY, resolvedFiles.length);

    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < resolvedFiles.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const file = resolvedFiles[currentIndex];
        const result = await processOneFile({
          agentId,
          purpose,
          accessToken,
          file,
          batchId,
        });
        results[currentIndex] = result;

        // Register this file in the batch doc. For successfully enqueued
        // files, the processor will update the status on completion. For
        // files that failed at the import level (download error, unsupported
        // type, enqueue failure), we must update the batch doc here since
        // no processor will ever run for them.
        try {
          if (result.jobId && result.status !== 'failed') {
            // Successfully created & enqueued — register and let processor handle status
            await registerBatchFile(agentId, batchId, {
              jobId: result.jobId,
              driveFileId: file.id,
              fileName: file.name,
              mimeType: file.mimeType,
            });
          } else {
            // Failed at import level — register AND immediately mark failed so
            // the batch completion counter stays accurate
            const failKey = result.jobId || `import-fail-${file.id}`;
            await registerBatchFile(agentId, batchId, {
              jobId: failKey,
              driveFileId: file.id,
              fileName: file.name,
              mimeType: file.mimeType,
            });
            await updateBatchFileStatus(agentId, batchId, failKey, {
              status: 'failed',
              error: result.error || 'Failed during import.',
              retryable: false,
            });
          }
        } catch (regErr) {
          console.error(`[drive-import] Failed to register batch file for ${file.id}:`, regErr);
        }
      }
    });

    await Promise.all(workers);

    const resolvedFileInfos: ResolvedFileInfo[] = resolvedFiles.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      fromFolder: f.fromFolder,
    }));

    return NextResponse.json({
      success: true,
      batchId,
      purpose,
      resolvedFiles: resolvedFileInfos,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import files from Google Drive.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
