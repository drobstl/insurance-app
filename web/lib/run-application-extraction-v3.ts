/**
 * Self-contained client-side extraction driver for the Close Sale
 * ritual. Renders carrier-mapped pages → uploads JPEGs to GCS via
 * signed URLs → creates an ingestion-v3 job with carrierFormType →
 * polls for completion → returns extracted application data.
 *
 * This is a focused, tighter-scoped alternative to the 800+ line
 * `parseApplicationFile` useCallback in `web/app/dashboard/clients/
 * page.tsx`. That one carries telemetry, multiple fallback paths,
 * routing-meta logic for various entry points, retry-with-different-
 * settings, etc. — all needed by the Add Client / Add Policy surfaces.
 * Close Sale's context is narrower (single PDF, single carrier, one
 * shot, agent is live on the phone), so we trade those bells for a
 * surface area we can confidently maintain in one place.
 *
 * The dependency on `APPLICATION_PAGE_MAP` + carrierFormType is what
 * earns the carrier-specific prompt supplement on the server side
 * (see CONTEXT.md → ingestion-v3 image-first path). Without setting
 * `carrierFormType: 'unknown'` here, extraction quality matches the
 * known-carrier-supplement-aware behavior of the v3 pipeline.
 */
import type { User } from 'firebase/auth';
import {
  renderSelectedPdfPagesToJpegsTolerant,
  renderFirstPdfPagesToJpegs,
} from './pdf/render-selected-pages-to-jpeg';

// Shape of one rendered page returned by the render helpers (the
// helpers don't export this type, so we mirror it locally).
type RenderedJpegPage = { pageNumber: number; blob: Blob };
import { APPLICATION_PAGE_MAP } from './pdf/application-page-map';
import type { ExtractedApplicationData } from './types';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;
const MAX_FALLBACK_PAGES = 6;

interface ExtractOptions {
  /** Authenticated user — needed for the Bearer token on backend calls. */
  user: User;
  /** The PDF the agent picked. */
  file: File;
  /** Application-type key — must be a value from APPLICATION_TYPE_OPTIONS.
   * Maps to APPLICATION_PAGE_MAP for page rendering AND determines the
   * carrier-specific prompt supplement applied server-side. */
  carrierFormType: string;
  /** Optional abort signal so the Close Sale modal can cancel mid-flight. */
  signal?: AbortSignal;
  /** Progress reporter: 0-100 + a human-readable label. Called frequently. */
  onProgress?: (pct: number, label: string) => void;
}

export interface ExtractResult {
  data: ExtractedApplicationData;
  note?: string;
}

export async function runApplicationExtractionV3({
  user,
  file,
  carrierFormType,
  signal,
  onProgress,
}: ExtractOptions): Promise<ExtractResult> {
  const report = (pct: number, label: string) =>
    onProgress?.(Math.max(0, Math.min(100, Math.round(pct))), label);

  // ── 1. Render the carrier-mapped pages to JPEG ────────────────────
  report(5, 'Reading PDF...');
  const selectedPageNumbers = APPLICATION_PAGE_MAP[carrierFormType];
  let renderedPages: RenderedJpegPage[];
  if (Array.isArray(selectedPageNumbers) && selectedPageNumbers.length) {
    const tolerant = await renderSelectedPdfPagesToJpegsTolerant(file, selectedPageNumbers);
    renderedPages = tolerant.rendered;
  } else {
    // No mapping for this carrier (e.g. "unknown" / Other Carrier).
    // Fall back to the first N pages — same heuristic the broader
    // pipeline uses for unmapped types.
    renderedPages = await renderFirstPdfPagesToJpegs(file, MAX_FALLBACK_PAGES);
  }

  if (renderedPages.length === 0) {
    throw new Error('No pages could be rendered from this PDF.');
  }

  // ── 2. Upload each JPEG to GCS via signed URLs ────────────────────
  const token = await user.getIdToken();
  const gcsImagePaths: string[] = [];

  for (let i = 0; i < renderedPages.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const page = renderedPages[i];

    const signedRes = await fetch('/api/ingestion/v3/upload-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fileName: `page-${page.pageNumber}.jpg`,
        contentType: 'image/jpeg',
        fileSize: page.blob.size,
        purpose: 'application',
      }),
      signal,
    });
    const signedBody = (await signedRes.json()) as {
      success: boolean;
      uploadUrl?: string;
      gcsPath?: string;
      error?: { message?: string };
    };
    if (!signedRes.ok || !signedBody.success || !signedBody.uploadUrl || !signedBody.gcsPath) {
      throw new Error(signedBody.error?.message || `Could not start upload (${signedRes.status}).`);
    }

    const putRes = await fetch(signedBody.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: page.blob,
      signal,
    });
    if (!putRes.ok) {
      throw new Error(`Upload to storage failed (${putRes.status}).`);
    }

    gcsImagePaths.push(signedBody.gcsPath);
    report(
      10 + ((i + 1) / renderedPages.length) * 40,
      `Uploading pages (${i + 1}/${renderedPages.length})...`,
    );
  }

  // ── 3. Create the ingestion-v3 job ────────────────────────────────
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  report(55, 'Submitting for extraction...');
  const jobRes = await fetch('/api/ingestion/v3/jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mode: 'application',
      carrierFormType,
      gcsImagePaths,
      fileName: file.name,
    }),
    signal,
  });
  const jobBody = (await jobRes.json()) as {
    success: boolean;
    jobId?: string;
    error?: { message?: string };
  };
  if (!jobRes.ok || !jobBody.success || !jobBody.jobId) {
    throw new Error(jobBody.error?.message || `Could not start extraction (${jobRes.status}).`);
  }
  const jobId = jobBody.jobId;

  // ── 4. Poll for completion ────────────────────────────────────────
  const startedAt = Date.now();
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const statusRes = await fetch(`/api/ingestion/v3/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    const statusBody = (await statusRes.json()) as {
      success: boolean;
      job?: {
        status: string;
        result?: { application?: { data: ExtractedApplicationData; note?: string } };
        error?: { message?: string };
      };
      error?: { message?: string };
    };
    if (!statusRes.ok || !statusBody.success || !statusBody.job) {
      throw new Error(statusBody.error?.message || `Status check failed (${statusRes.status}).`);
    }

    const job = statusBody.job;
    const elapsed = Date.now() - startedAt;
    const pollProgress = Math.min(95, 60 + (elapsed / POLL_TIMEOUT_MS) * 35);
    report(pollProgress, `Reading application... (${job.status})`);

    if (job.status === 'review_ready' || job.status === 'saved') {
      report(100, 'Extraction complete');
      if (!job.result?.application) {
        throw new Error('Extraction completed but returned no application data.');
      }
      return {
        data: job.result.application.data,
        note: job.result.application.note,
      };
    }
    if (job.status === 'failed') {
      throw new Error(job.error?.message || 'Extraction failed.');
    }
  }

  throw new Error('Extraction timed out — please retry.');
}
