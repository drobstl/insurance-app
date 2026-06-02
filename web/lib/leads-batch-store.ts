import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebase-admin';

/**
 * Lead-batch tracking store (web side).
 *
 * A "lead batch" is one uploaded multi-page lead-form PDF. Each page is
 * treated as one lead form. The heavy work — split + per-page Claude
 * extraction + dedup commit — runs in the `leads-batch-processor` Cloud
 * Function, NOT on Vercel (a 49-page bundle blew the 90s function budget
 * and 504'd). This module only does the sub-second Firestore work the
 * thin Vercel routes need: create the tracking doc (which triggers the
 * GCF), read it for a status-poll fallback, and cancel it.
 *
 * Counter rollups (completedPages/failedPages/…) are owned by the GCF —
 * it patches this same doc transactionally as it processes each chunk,
 * and the dashboard watches it live via onSnapshot.
 *
 * Mirrors the proven client-ingestion batch pattern
 * (`web/lib/ingestion-v3-batch-store.ts`) but uses a page-oriented model
 * (one upload → N pages) instead of a file-oriented one (N files).
 *
 * Doc path: agents/{agentId}/leadBatches/{batchId}
 */

// ─── Types ───────────────────────────────────────────────

export type LeadBatchStatus =
  | 'splitting'   // doc created; GCF is about to split the PDF
  | 'processing'  // split done; pages are being extracted + committed
  | 'completed'   // every page produced a lead (or a clean duplicate)
  | 'partial'     // finished, but some pages failed extraction/commit
  | 'failed'      // the batch itself failed (bad PDF, download error, …)
  | 'cancelled';  // agent cancelled mid-run

export type LeadBatchPageStatus = 'pending' | 'succeeded' | 'failed' | 'duplicate';

export interface LeadBatchPageEntry {
  page: number;
  status: LeadBatchPageStatus;
  leadId?: string;
  leadCode?: string;
  name?: string;
  error?: string;
}

export interface LeadBatchRecord {
  id: string;
  agentId: string;
  status: LeadBatchStatus;
  fileName: string;
  gcsPath: string;
  sourceFileUrl: string;
  sourceFileStoragePath: string;
  totalPages: number;
  completedPages: number;
  failedPages: number;
  duplicatePages: number;
  totalLeads: number;
  attempts: number;
  maxAttempts: number;
  pages: Record<string, LeadBatchPageEntry>;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CreateLeadBatchInput {
  fileName: string;
  gcsPath: string;
  /** Long-lived signed read URL for the parent PDF; stamped onto each lead. */
  sourceFileUrl: string;
  /** Storage object path of the parent PDF; stamped onto each lead for the archive cron. */
  sourceFileStoragePath: string;
  /**
   * Client-reported page count, used to seed the progress bar ("0 / 49")
   * the instant the doc exists. The GCF overwrites totalPages with the
   * authoritative count once it actually splits the PDF.
   */
  pageCount: number;
  maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;

// ─── Collection Helpers ──────────────────────────────────

function getLeadBatchRef(agentId: string, batchId: string) {
  return getAdminFirestore()
    .collection('agents')
    .doc(agentId)
    .collection('leadBatches')
    .doc(batchId);
}

// ─── Create ──────────────────────────────────────────────

/**
 * Creates the batch tracking doc with status 'splitting'. Creating the
 * doc is what triggers the leads-batch-processor GCF (onDocumentCreated).
 * Returns the Firestore-generated batchId so the route can hand it back
 * to the client for onSnapshot watching.
 */
export async function createLeadBatch(
  agentId: string,
  input: CreateLeadBatchInput,
): Promise<string> {
  const ref = getAdminFirestore()
    .collection('agents')
    .doc(agentId)
    .collection('leadBatches')
    .doc();

  await ref.set({
    agentId,
    status: 'splitting',
    fileName: input.fileName,
    gcsPath: input.gcsPath,
    sourceFileUrl: input.sourceFileUrl,
    sourceFileStoragePath: input.sourceFileStoragePath,
    totalPages: input.pageCount > 0 ? input.pageCount : 0,
    completedPages: 0,
    failedPages: 0,
    duplicatePages: 0,
    totalLeads: 0,
    processingToken: null,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    pages: {},
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return ref.id;
}

// ─── Cancel ──────────────────────────────────────────────

/**
 * Marks the batch cancelled unless it's already terminal. The GCF checks
 * for status === 'cancelled' between extraction chunks and stops early;
 * pages already committed stay committed (we never un-create leads).
 */
export async function cancelLeadBatch(
  agentId: string,
  batchId: string,
): Promise<{ cancelled: boolean; status: LeadBatchStatus | 'not_found' }> {
  const db = getAdminFirestore();
  const ref = getLeadBatchRef(agentId, batchId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { cancelled: false, status: 'not_found' as const };
    }
    const data = snap.data() as Record<string, unknown>;
    const current = (data.status as LeadBatchStatus | undefined) ?? 'splitting';
    if (current === 'completed' || current === 'partial' || current === 'failed' || current === 'cancelled') {
      return { cancelled: false, status: current };
    }
    tx.update(ref, {
      status: 'cancelled',
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    });
    return { cancelled: true, status: 'cancelled' as const };
  });
}

// ─── Read ────────────────────────────────────────────────

export async function getLeadBatch(
  agentId: string,
  batchId: string,
): Promise<LeadBatchRecord | null> {
  const snap = await getLeadBatchRef(agentId, batchId).get();
  if (!snap.exists) return null;
  return toLeadBatchRecord(snap.id, snap.data() as Record<string, unknown>);
}

// ─── Serialization ───────────────────────────────────────

function toLeadBatchRecord(id: string, data: Record<string, unknown>): LeadBatchRecord {
  const pagesRaw = (data.pages || {}) as Record<string, Record<string, unknown>>;
  const pages: Record<string, LeadBatchPageEntry> = {};
  for (const [key, entry] of Object.entries(pagesRaw)) {
    const page = typeof entry.page === 'number' ? entry.page : Number(key) || 0;
    pages[key] = {
      page,
      status: (entry.status as LeadBatchPageStatus) || 'pending',
      leadId: typeof entry.leadId === 'string' ? entry.leadId : undefined,
      leadCode: typeof entry.leadCode === 'string' ? entry.leadCode : undefined,
      name: typeof entry.name === 'string' ? entry.name : undefined,
      error: typeof entry.error === 'string' ? entry.error : undefined,
    };
  }

  return {
    id,
    agentId: typeof data.agentId === 'string' ? data.agentId : '',
    status: (data.status as LeadBatchStatus) || 'splitting',
    fileName: typeof data.fileName === 'string' ? data.fileName : '',
    gcsPath: typeof data.gcsPath === 'string' ? data.gcsPath : '',
    sourceFileUrl: typeof data.sourceFileUrl === 'string' ? data.sourceFileUrl : '',
    sourceFileStoragePath: typeof data.sourceFileStoragePath === 'string' ? data.sourceFileStoragePath : '',
    totalPages: typeof data.totalPages === 'number' ? data.totalPages : 0,
    completedPages: typeof data.completedPages === 'number' ? data.completedPages : 0,
    failedPages: typeof data.failedPages === 'number' ? data.failedPages : 0,
    duplicatePages: typeof data.duplicatePages === 'number' ? data.duplicatePages : 0,
    totalLeads: typeof data.totalLeads === 'number' ? data.totalLeads : 0,
    attempts: typeof data.attempts === 'number' ? data.attempts : 0,
    maxAttempts: typeof data.maxAttempts === 'number' ? data.maxAttempts : DEFAULT_MAX_ATTEMPTS,
    pages,
    error: typeof data.error === 'string' ? data.error : undefined,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    completedAt: toIsoStringOptional(data.completedAt),
  };
}

function toIsoString(value: unknown): string {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString() : new Date(0).toISOString();
}

function toIsoStringOptional(value: unknown): string | undefined {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString() : undefined;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
