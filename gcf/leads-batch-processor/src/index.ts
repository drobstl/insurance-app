import Anthropic from '@anthropic-ai/sdk';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { PDFDocument } from 'pdf-lib';
import { extractLeadFromPdf } from './lead-extractor';
import { commitLead } from './lead-commit';

/**
 * leads-batch-processor — splits a multi-page lead-form PDF and extracts
 * one lead per page, off Vercel's request budget.
 *
 * Why this exists: a 49-page bundle ran 13 sequential chunks of vision
 * calls on `/api/leads/upload` and blew the 90s function limit → 504, so
 * only the first ~36 pages committed. This Cloud Function does the same
 * work with a 9-minute budget. The synchronous single-upload path
 * (close-of-sale ritual) is unchanged; only multi-page bundles route here.
 *
 * Lean single-worker design (sized to real usage — peak ~40-60 pages once
 * at onboarding, ~20-30/week after): NO per-page fan-out. One invocation
 * splits in memory, extracts pages a chunk at a time, commits each via the
 * shared dedup/commit path, and patches counters on the batch doc after
 * every chunk so the dashboard's onSnapshot shows live progress.
 *
 * Trigger: onDocumentCreated(agents/{agentId}/leadBatches/{batchId}).
 * Because that fires ONLY on create (never update), a stalled batch can't
 * be re-kicked by flipping status — so there's no resume. The scheduled
 * reconciler finalizes stuck batches from their counters instead.
 */

initializeApp();
getFirestore().settings({ ignoreUndefinedProperties: true });

const REGION = 'us-central1';
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// Safety rail: the web create-batch route already caps client-reported
// pages at 100; we re-check the authoritative count here so a client that
// lies about pageCount can't hand us a 500-page PDF.
const MAX_BATCH_PAGES = 100;
// Claude vision calls in parallel per chunk. At ~10-15s/page this clears a
// 60-page bundle in ~150s and the 100-page cap in ~300s — inside the 540s
// function budget with headroom.
const EXTRACTION_CONCURRENCY = 5;

const STALE_BATCH_TIMEOUT_MS = 15 * 60 * 1000;
const STALE_BATCH_SCAN_LIMIT = 100;

type LeadBatchStatus =
  | 'splitting'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';

type LeadBatchPageStatus = 'pending' | 'succeeded' | 'failed' | 'duplicate';

interface LockedBatch {
  agentId: string;
  batchId: string;
  gcsPath: string;
  sourceFileUrl: string;
  sourceFileStoragePath: string;
  processingToken: string;
  attempts: number;
}

interface PageOutcome {
  page: number;
  status: LeadBatchPageStatus;
  leadId?: string;
  leadCode?: string;
  name?: string;
  error?: string;
}

interface FinalRollup {
  status: LeadBatchStatus;
  totalPages: number;
  completedPages: number;
  failedPages: number;
  duplicatePages: number;
  totalLeads: number;
}

// ─── Trigger ─────────────────────────────────────────────

export const processLeadBatch = onDocumentCreated(
  {
    document: 'agents/{agentId}/leadBatches/{batchId}',
    region: REGION,
    timeoutSeconds: 540,
    memory: '2GiB',
    secrets: [ANTHROPIC_API_KEY],
  },
  async (event) => {
    const snap = event.data;
    if (!snap?.exists) return;
    const created = snap.data() as Record<string, unknown>;
    const createdStatus = (created.status as LeadBatchStatus | undefined) || 'failed';
    if (createdStatus !== 'splitting') return;

    const { agentId, batchId } = event.params as { agentId: string; batchId: string };
    const lock = await lockBatch(agentId, batchId);
    if (!lock.ok) {
      emit('leads_batch_lock_skipped', { agent_id: agentId, batch_id: batchId, reason: lock.reason });
      return;
    }

    const batch = lock.batch;
    const db = getFirestore();
    const t0 = Date.now();

    try {
      const pdfBuffer = await downloadParentPdf(batch.gcsPath);

      let parentDoc: PDFDocument;
      try {
        parentDoc = await PDFDocument.load(pdfBuffer);
      } catch {
        await failBatch(batch, 'This file could not be read as a PDF.');
        emit('leads_batch_failed', { agent_id: agentId, batch_id: batchId, error: 'pdf_load_failed' });
        return;
      }

      const pageCount = parentDoc.getPageCount();
      if (pageCount < 1) {
        await failBatch(batch, 'The uploaded PDF has no pages.');
        emit('leads_batch_failed', { agent_id: agentId, batch_id: batchId, error: 'no_pages' });
        return;
      }
      if (pageCount > MAX_BATCH_PAGES) {
        await failBatch(
          batch,
          `This PDF has ${pageCount} pages; the import limit is ${MAX_BATCH_PAGES}. Split it into smaller files and try again.`,
        );
        emit('leads_batch_failed', { agent_id: agentId, batch_id: batchId, error: 'over_page_cap', page_count: pageCount });
        return;
      }

      // Stamp the authoritative page count (the create route seeded a
      // client estimate so the progress bar could render immediately).
      await setTotalPages(batch, pageCount);

      const perPageBuffers = await splitToPages(parentDoc, pageCount);
      const anthropic = getAnthropicClient();

      let stoppedEarly: 'cancelled' | 'token_lost' | null = null;

      for (let chunkStart = 0; chunkStart < perPageBuffers.length; chunkStart += EXTRACTION_CONCURRENCY) {
        // Cheap pre-chunk check so a cancelled batch doesn't keep burning
        // Claude calls (the expensive part). The counter txn below is the
        // authoritative guard against races.
        const state = await checkBatchState(agentId, batchId, batch.processingToken);
        if (state !== 'continue') {
          stoppedEarly = state === 'cancelled' ? 'cancelled' : 'token_lost';
          break;
        }

        const chunkBuffers = perPageBuffers.slice(chunkStart, chunkStart + EXTRACTION_CONCURRENCY);
        const results = await Promise.allSettled(
          chunkBuffers.map(async (buf) => {
            if (buf.byteLength === 0) throw new Error('split failed');
            // No second-pass escalation in bulk — a 60-page bundle running
            // Opus on every Mail-In page would blow the budget. The
            // synchronous close-of-sale upload keeps escalation on.
            return extractLeadFromPdf(anthropic, buf.toString('base64'), { escalate: false });
          }),
        );

        const entries: PageOutcome[] = [];
        for (let i = 0; i < results.length; i += 1) {
          const r = results[i];
          const page = chunkStart + i + 1;
          if (r.status === 'rejected') {
            entries.push({ page, status: 'failed', error: errMessage(r.reason, 'extraction failed') });
            continue;
          }
          const ex = r.value;
          if (!ex.name || !ex.phone) {
            entries.push({ page, status: 'failed', error: !ex.name ? 'no name on page' : 'no phone on page' });
            continue;
          }
          try {
            const committed = await commitLead({
              db,
              agentId,
              sourceFileUrl: batch.sourceFileUrl,
              sourceFileStoragePath: batch.sourceFileStoragePath,
              extracted: ex,
            });
            if (committed.duplicate) {
              entries.push({
                page,
                status: 'duplicate',
                name: ex.name,
                leadId: committed.existingLeadId,
                leadCode: committed.existingLeadCode,
              });
            } else {
              entries.push({
                page,
                status: 'succeeded',
                name: ex.name,
                leadId: committed.leadId,
                leadCode: committed.leadCode,
              });
            }
          } catch (commitErr) {
            entries.push({ page, status: 'failed', error: errMessage(commitErr, 'commit failed') });
          }
        }

        const apply = await applyChunkOutcomes(batch, entries);
        if (apply.stop) {
          stoppedEarly = apply.reason;
          break;
        }
      }

      if (stoppedEarly === 'token_lost') {
        emit('leads_batch_token_lost', { agent_id: agentId, batch_id: batchId });
        return; // another worker / the reconciler owns finalization now
      }
      if (stoppedEarly === 'cancelled') {
        emit('leads_batch_cancelled_midrun', { agent_id: agentId, batch_id: batchId, elapsed_ms: Date.now() - t0 });
        return; // leave the doc 'cancelled'; committed leads stay
      }

      const rollup = await finalizeBatch(batch);
      emit('leads_batch_completed', {
        agent_id: agentId,
        batch_id: batchId,
        status: rollup.status,
        total_pages: rollup.totalPages,
        completed_pages: rollup.completedPages,
        failed_pages: rollup.failedPages,
        duplicate_pages: rollup.duplicatePages,
        total_leads: rollup.totalLeads,
        elapsed_ms: Date.now() - t0,
      });
    } catch (error) {
      const message = errMessage(error, 'Batch processing failed.');
      await failBatch(batch, message).catch(() => undefined);
      emit('leads_batch_failed', { agent_id: agentId, batch_id: batchId, error: message });
    }
  },
);

// ─── Scheduled reconciler ────────────────────────────────

/**
 * Finalizes batches stuck in 'splitting'/'processing' past the timeout.
 * Because onDocumentCreated never re-fires, a batch whose worker died
 * can't resume — so we finalize FROM COUNTERS: any pages not yet
 * accounted for are written off as timed-out failures and the doc is
 * moved to a terminal state. Mirrors the v3 stale-batch reconciler's
 * per-agent scan (no collectionGroup → no composite-index dependency).
 */
export const reconcileStaleLeadBatches = onSchedule(
  {
    region: REGION,
    schedule: 'every 5 minutes',
    timeoutSeconds: 240,
    memory: '512MiB',
  },
  async () => {
    try {
      const db = getFirestore();
      const cutoffMs = Date.now() - STALE_BATCH_TIMEOUT_MS;
      const agentSnap = await db.collection('agents').limit(STALE_BATCH_SCAN_LIMIT).get();
      if (agentSnap.empty) {
        emit('leads_batch_reconcile', { scanned_agents: 0, scanned_batches: 0, stale_candidates: 0, reconciled_batches: 0 });
        return;
      }

      let scanned = 0;
      let staleCandidates = 0;
      let reconciled = 0;

      for (const agentDoc of agentSnap.docs) {
        const batchSnap = await agentDoc.ref.collection('leadBatches').limit(STALE_BATCH_SCAN_LIMIT).get();
        for (const doc of batchSnap.docs) {
          scanned += 1;
          const data = doc.data() as Record<string, unknown>;
          const status = (data.status as LeadBatchStatus | undefined) || 'processing';
          if (status !== 'processing' && status !== 'splitting') continue;
          const updatedAtMs = toMillisOrNull(data.updatedAt) ?? toMillisOrNull(data.createdAt);
          if (updatedAtMs == null || updatedAtMs > cutoffMs) continue;
          staleCandidates += 1;
          const didReconcile = await reconcileLeadBatchFromCounters(doc.ref.path);
          if (didReconcile) reconciled += 1;
        }
      }

      emit('leads_batch_reconcile', {
        scanned_agents: agentSnap.size,
        scanned_batches: scanned,
        stale_candidates: staleCandidates,
        reconciled_batches: reconciled,
        agent_scan_limit: STALE_BATCH_SCAN_LIMIT,
        per_agent_batch_scan_limit: STALE_BATCH_SCAN_LIMIT,
      });
    } catch (error) {
      if (isFirestoreFailedPreconditionError(error)) {
        emit('leads_batch_reconcile_failed_precondition', { message: errMessage(error, 'failed precondition') });
        return;
      }
      throw error;
    }
  },
);

// ─── Batch doc operations ────────────────────────────────

async function lockBatch(
  agentId: string,
  batchId: string,
): Promise<{ ok: true; batch: LockedBatch } | { ok: false; reason: string }> {
  const db = getFirestore();
  const ref = batchRef(db, agentId, batchId);
  return db.runTransaction(async (tx) => {
    const docSnap = await tx.get(ref);
    if (!docSnap.exists) return { ok: false as const, reason: 'not_found' };
    const data = docSnap.data() as Record<string, unknown>;
    const status = (data.status as LeadBatchStatus | undefined) || 'failed';
    if (status !== 'splitting') return { ok: false as const, reason: `status_${status}` };
    // Guard against gen2 at-least-once duplicate delivery of the same event.
    if (data.processingToken != null) return { ok: false as const, reason: 'already_locked' };
    const gcsPath = typeof data.gcsPath === 'string' ? data.gcsPath : '';
    if (!gcsPath) return { ok: false as const, reason: 'missing_gcs_path' };

    const attempts = typeof data.attempts === 'number' ? data.attempts : 0;
    const processingToken = randomToken();
    tx.update(ref, {
      status: 'processing',
      processingToken,
      attempts: attempts + 1,
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      ok: true as const,
      batch: {
        agentId,
        batchId,
        gcsPath,
        sourceFileUrl: typeof data.sourceFileUrl === 'string' ? data.sourceFileUrl : '',
        sourceFileStoragePath: typeof data.sourceFileStoragePath === 'string' ? data.sourceFileStoragePath : '',
        processingToken,
        attempts: attempts + 1,
      },
    };
  });
}

async function setTotalPages(batch: LockedBatch, pageCount: number): Promise<void> {
  const db = getFirestore();
  const ref = batchRef(db, batch.agentId, batch.batchId);
  await db.runTransaction(async (tx) => {
    const docSnap = await tx.get(ref);
    if (!docSnap.exists) return;
    const data = docSnap.data() as Record<string, unknown>;
    if (data.processingToken !== batch.processingToken) return;
    tx.update(ref, { totalPages: pageCount, updatedAt: FieldValue.serverTimestamp() });
  });
}

async function checkBatchState(
  agentId: string,
  batchId: string,
  token: string,
): Promise<'continue' | 'cancelled' | 'token_lost' | 'gone'> {
  const db = getFirestore();
  const docSnap = await batchRef(db, agentId, batchId).get();
  if (!docSnap.exists) return 'gone';
  const data = docSnap.data() as Record<string, unknown>;
  if (data.processingToken !== token) return 'token_lost';
  const status = (data.status as LeadBatchStatus | undefined) || 'processing';
  if (status === 'cancelled') return 'cancelled';
  return 'continue';
}

async function applyChunkOutcomes(
  batch: LockedBatch,
  entries: PageOutcome[],
): Promise<{ stop: false } | { stop: true; reason: 'cancelled' | 'token_lost' }> {
  const db = getFirestore();
  const ref = batchRef(db, batch.agentId, batch.batchId);
  return db.runTransaction(async (tx) => {
    const docSnap = await tx.get(ref);
    if (!docSnap.exists) return { stop: true as const, reason: 'token_lost' as const };
    const data = docSnap.data() as Record<string, unknown>;
    if (data.processingToken !== batch.processingToken) return { stop: true as const, reason: 'token_lost' as const };

    let completed = 0;
    let failed = 0;
    let duplicate = 0;
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    for (const e of entries) {
      const entry: Record<string, unknown> = { page: e.page, status: e.status };
      if (e.leadId) entry.leadId = e.leadId;
      if (e.leadCode) entry.leadCode = e.leadCode;
      if (e.name) entry.name = e.name;
      if (e.error) entry.error = e.error;
      patch[`pages.${e.page}`] = entry;
      if (e.status === 'succeeded') completed += 1;
      else if (e.status === 'duplicate') duplicate += 1;
      else failed += 1;
    }
    if (completed) {
      patch.completedPages = FieldValue.increment(completed);
      patch.totalLeads = FieldValue.increment(completed);
    }
    if (failed) patch.failedPages = FieldValue.increment(failed);
    if (duplicate) patch.duplicatePages = FieldValue.increment(duplicate);
    tx.update(ref, patch);

    // Counters reflect committed reality even on a cancel (the leads are
    // already written); we just don't flip status back out of 'cancelled'.
    const status = (data.status as LeadBatchStatus | undefined) || 'processing';
    if (status === 'cancelled') return { stop: true as const, reason: 'cancelled' as const };
    return { stop: false as const };
  });
}

async function finalizeBatch(batch: LockedBatch): Promise<FinalRollup> {
  const db = getFirestore();
  const ref = batchRef(db, batch.agentId, batch.batchId);
  return db.runTransaction(async (tx) => {
    const docSnap = await tx.get(ref);
    const data = (docSnap.exists ? docSnap.data() : {}) as Record<string, unknown>;
    const rollup: FinalRollup = {
      status: (data.status as LeadBatchStatus) || 'processing',
      totalPages: num(data.totalPages),
      completedPages: num(data.completedPages),
      failedPages: num(data.failedPages),
      duplicatePages: num(data.duplicatePages),
      totalLeads: num(data.totalLeads),
    };
    if (!docSnap.exists) return rollup;
    if (data.processingToken !== batch.processingToken) return rollup;
    if (rollup.status !== 'processing') return rollup;

    const finalStatus: LeadBatchStatus = rollup.failedPages > 0 ? 'partial' : 'completed';
    tx.update(ref, {
      status: finalStatus,
      processingToken: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    });
    rollup.status = finalStatus;
    return rollup;
  });
}

async function failBatch(batch: LockedBatch, message: string): Promise<void> {
  const db = getFirestore();
  const ref = batchRef(db, batch.agentId, batch.batchId);
  await db.runTransaction(async (tx) => {
    const docSnap = await tx.get(ref);
    if (!docSnap.exists) return;
    const data = docSnap.data() as Record<string, unknown>;
    if (data.processingToken !== batch.processingToken) return;
    const status = (data.status as LeadBatchStatus | undefined) || 'processing';
    if (status !== 'processing') return; // never override a cancel / terminal state
    tx.update(ref, {
      status: 'failed',
      error: message,
      processingToken: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function reconcileLeadBatchFromCounters(path: string): Promise<boolean> {
  const db = getFirestore();
  const ref = db.doc(path);
  return db.runTransaction(async (tx) => {
    const docSnap = await tx.get(ref);
    if (!docSnap.exists) return false;
    const data = docSnap.data() as Record<string, unknown>;
    const status = (data.status as LeadBatchStatus | undefined) || 'processing';
    if (status !== 'processing' && status !== 'splitting') return false;

    const totalPages = num(data.totalPages);
    const completedPages = num(data.completedPages);
    const failedPages = num(data.failedPages);
    const duplicatePages = num(data.duplicatePages);
    const accounted = completedPages + failedPages + duplicatePages;
    const unaccounted = Math.max(0, totalPages - accounted);
    const finalFailed = failedPages + unaccounted;
    const anySuccess = completedPages + duplicatePages > 0;

    const patch: Record<string, unknown> = {
      processingToken: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    };
    if (unaccounted > 0) patch.failedPages = FieldValue.increment(unaccounted);

    let finalStatus: LeadBatchStatus;
    if (!anySuccess) {
      finalStatus = 'failed';
      patch.error = 'Batch timed out before any pages could be imported.';
    } else {
      finalStatus = finalFailed > 0 ? 'partial' : 'completed';
    }
    patch.status = finalStatus;
    tx.update(ref, patch);

    emit('leads_batch_reconciled', {
      batch_path: path,
      status: finalStatus,
      total_pages: totalPages,
      completed_pages: completedPages,
      failed_pages: finalFailed,
      duplicate_pages: duplicatePages,
      unaccounted_pages: unaccounted,
    });
    return true;
  });
}

// ─── PDF + storage ───────────────────────────────────────

async function downloadParentPdf(gcsPath: string): Promise<Buffer> {
  const file = getStorage().bucket().file(gcsPath);
  const [exists] = await file.exists();
  if (!exists) throw new Error('The uploaded PDF was not found in storage.');
  const [buffer] = await file.download();
  return buffer;
}

async function splitToPages(parentDoc: PDFDocument, pageCount: number): Promise<Buffer[]> {
  const buffers: Buffer[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    try {
      const single = await PDFDocument.create();
      const [copied] = await single.copyPages(parentDoc, [i]);
      single.addPage(copied);
      const bytes = await single.save();
      buffers.push(Buffer.from(bytes));
    } catch (err) {
      emit('leads_batch_page_split_failed', { page: i + 1, error: errMessage(err, 'split failed') });
      buffers.push(Buffer.alloc(0)); // marker → fails extraction, counted as a failed page
    }
  }
  return buffers;
}

// ─── Helpers ─────────────────────────────────────────────

function batchRef(db: Firestore, agentId: string, batchId: string) {
  return db.collection('agents').doc(agentId).collection('leadBatches').doc(batchId);
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function errMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : typeof value === 'string' && value ? value : fallback;
}

function randomToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getAnthropicClient(): Anthropic {
  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');
  return new Anthropic({ apiKey });
}

function toMillisOrNull(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object') {
    const candidate = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      _seconds?: number;
      _nanoseconds?: number;
      seconds?: number;
      nanoseconds?: number;
    };
    if (typeof candidate.toMillis === 'function') {
      const millis = candidate.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
    if (typeof candidate.toDate === 'function') {
      const millis = candidate.toDate().getTime();
      return Number.isNaN(millis) ? null : millis;
    }
    const sec =
      typeof candidate.seconds === 'number'
        ? candidate.seconds
        : typeof candidate._seconds === 'number'
          ? candidate._seconds
          : null;
    if (sec == null) return null;
    const nanos =
      typeof candidate.nanoseconds === 'number'
        ? candidate.nanoseconds
        : typeof candidate._nanoseconds === 'number'
          ? candidate._nanoseconds
          : 0;
    return sec * 1000 + Math.floor(nanos / 1_000_000);
  }
  return null;
}

function isFirestoreFailedPreconditionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === 9 || candidate.code === '9' || candidate.code === 'failed-precondition') {
    return true;
  }
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return message.includes('failed_precondition') || message.includes('failed precondition');
}

function emit(event: string, payload: Record<string, unknown>) {
  console.log('[leads-batch-gcf]', JSON.stringify({ event, ts: new Date().toISOString(), ...payload }));
}
