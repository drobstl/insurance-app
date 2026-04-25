'use client';

import { useEffect, useState, useMemo, useCallback, useRef, type CSSProperties } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  limit as firestoreLimit,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
  updateDoc,
  setDoc,
  deleteField,
} from 'firebase/firestore';
import { auth, db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';
import ClientDetailModal from '../../../components/ClientDetailModal';
import SectionTipCard from '../../../components/SectionTipCard';
import type {
  ExtractedApplicationData,
  Beneficiary,
  IngestionV3JobStatusResponse,
  IngestionV3SubmitJobResponse,
} from '../../../lib/types';
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  getPolicyTypeIcon,
  getUpcomingAnniversaryIfEligible,
} from '../../../lib/policyUtils';
import { isTimeoutError, withTimeout } from '../../../lib/timeout';
import { captureEvent } from '../../../lib/posthog';
import { ANALYTICS_EVENTS } from '../../../lib/analytics-events';
import { useGooglePicker } from '../../../hooks/useGooglePicker';
import type { GooglePickerSelectedFile } from '../../../hooks/useGooglePicker';
import { buildWelcomeMessage, resolveClientLanguage, type SupportedLanguage } from '../../../lib/client-language';
import { fireConfetti } from '../../../lib/confetti';
import {
  renderFirstPdfPagesToJpegs,
  renderSelectedPdfPagesToJpegsTolerant,
} from '../../../lib/pdf/render-selected-pages-to-jpeg';
import { APPLICATION_PAGE_MAP } from '../../../lib/pdf/application-page-map';
import { buildRoutedPdfBuffer, detectBulkPdfRoute } from '../../../lib/pdf/bulk-pdf-routing';

// ─── Constants ─────────────────────────────────────────────

const POLICY_TYPES = ['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other'];
const POLICY_STATUSES = ['Active', 'Pending', 'Lapsed'];
const CLIENT_APP_URL = 'https://agentforlife.app/app';
const MAX_IMPORT_ROWS = 400;
const IMPORT_BATCH_SIZE = 50;
const MAX_FILES_PER_IMPORT = 50;
const RECOMMENDED_FILES_PER_IMPORT = '10-20';
const IMPORT_PARSE_TIMEOUT_MS = 120_000;
const JOB_POLL_INTERVAL_MS = 1500;
const MIN_IMPORT_ROW_QUALITY_RATIO = 0.65;
const DEFAULT_BULK_PDF_CONCURRENCY = 5;
const MAX_BULK_PDF_CONCURRENCY = 6;
const BULK_GCS_UPLOAD_TIMEOUT_MS = 120_000;
const BULK_PARSE_MAX_RETRIES = 2;
const MAX_APPLICATION_PDF_BYTES = 13 * 1024 * 1024;
const MAX_APPLICATION_RENDER_PAGES = 6;
const DEFAULT_APPLICATION_TYPE = 'unknown';
const BULK_IMPORT_SPLIT_TYPE_MESSAGE =
  'Please import spreadsheets and PDFs in separate runs for faster, more reliable processing.';
const BULK_ENCRYPTED_PDF_UNSUPPORTED_MESSAGE =
  'This PDF is encrypted/password-protected. Remove protection or upload one at a time with +Add Client one page back.';
const BULK_IMPORT_FUN_STATES = ['Processing your import...', 'Preparing client records...', 'Finalizing import data...'] as const;
const DEFAULT_WELCOME_SMS_TEMPLATE =
  'Hey {{firstName}}! {{agentName}} here. Download the AgentForLife app and use code {{code}} to connect with me. https://agentforlife.app/app';
const DEFAULT_INTRO_TEMPLATE =
  "Hey {{firstName}}, I wanted to do something for you so I put together a free app showing your policies and also a button to reach me anytime. After you download, your code {{code}} will let you in — also say yes to push notifications so I can keep you in the loop on anything important. Download here: https://agentforlife.app/app Looking forward to talking soon! — {{agentName}}";
import { KNOWN_CARRIER_NAMES } from '../../../lib/carriers';

const KNOWN_CARRIERS = KNOWN_CARRIER_NAMES;
type ApplicationFormType = string;
const APPLICATION_TYPE_OPTIONS: Array<{ label: string; value: ApplicationFormType }> = [
  { label: 'Americo - Term or CBO', value: 'americo_icc18_5160' },
  { label: 'Americo - IUL', value: 'americo_icc18_5160_iul' },
  { label: 'Americo - Whole Life', value: 'americo_icc24_5426' },
  { label: 'American-Amicable - Mortgage Protection', value: 'amam_icc15_aa9466' },
  { label: 'American-Amicable - Term', value: 'amam_icc18_aa3487' },
  { label: 'Foresters - Term Life', value: 'foresters_icc15_770825' },
  { label: 'United Home Life - Term', value: 'uhl_icc22_200_878a' },
  { label: 'Transamerica - Whole Life', value: 'transamerica_icc22_t_ap_wl11ic_0822' },
  { label: 'Corebridge/AIG', value: 'corebridge_aig_icc15_108847' },
  { label: 'SBLI - Policy Packet', value: 'sbli_policy_packet' },
  { label: 'F&G - IUL', value: 'fg_iul' },
  { label: 'Mutual of Omaha - Term Life Express / IUL Express', value: 'moo_icc22_l683a' },
  { label: 'Mutual of Omaha - Living Promise', value: 'moo_icc23_l681a' },
  { label: 'Mutual of Omaha - Accidental Death', value: 'moo_ma5981' },
  { label: 'Banner/LGA - Term', value: 'banner_lga_icc17_lia' },
  { label: 'Other Carrier', value: 'unknown' },
];

function getBulkPdfConcurrencyLimit(): number {
  const raw = process.env.NEXT_PUBLIC_IMPORT_PDF_CONCURRENCY;
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_BULK_PDF_CONCURRENCY;
  if (parsed < 1) return 1;
  if (parsed > MAX_BULK_PDF_CONCURRENCY) return MAX_BULK_PDF_CONCURRENCY;
  return parsed;
}

class BulkImportRetryableError extends Error {
  retryable: boolean;
  terminal: boolean;

  constructor(message: string, options?: { retryable?: boolean; terminal?: boolean }) {
    super(message);
    this.name = 'BulkImportRetryableError';
    this.retryable = options?.retryable === true;
    this.terminal = options?.terminal === true;
  }
}

class BulkImportTerminalError extends Error {
  reason: 'pdf_encrypted_unsupported';

  constructor(reason: 'pdf_encrypted_unsupported', message: string) {
    super(message);
    this.name = 'BulkImportTerminalError';
    this.reason = reason;
  }
}

function isRetryableBulkImportError(error: unknown): boolean {
  if (isTimeoutError(error)) return true;
  if (error instanceof BulkImportRetryableError) {
    return error.retryable && !error.terminal;
  }
  return false;
}

function getBulkImportFunLabel(progress: number): (typeof BULK_IMPORT_FUN_STATES)[number] {
  if (progress < 34) return BULK_IMPORT_FUN_STATES[0];
  if (progress < 67) return BULK_IMPORT_FUN_STATES[1];
  return BULK_IMPORT_FUN_STATES[2];
}

// ─── Interfaces ────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  clientCode?: string;
  dateOfBirth?: string;
  /** YYYY-MM-DD from application signature / relationship start; list "Client Since" prefers this over createdAt. */
  clientSinceDate?: string;
  pushToken?: string;
  createdAt: Timestamp;
  agentId: string;
  sourceReferralId?: string;
  preferredLanguage?: SupportedLanguage;
}

/** Calendar date written on the application (YYYY-MM-DD), distinct from Firestore createdAt. */
const CLIENT_SINCE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function resolveClientSinceFromExtraction(data: ExtractedApplicationData): string | null {
  if (data.applicationSignedDate && CLIENT_SINCE_ISO.test(data.applicationSignedDate)) {
    return data.applicationSignedDate;
  }
  if (data.effectiveDate && CLIENT_SINCE_ISO.test(data.effectiveDate)) {
    return data.effectiveDate;
  }
  return null;
}

function clientSinceSortMs(client: Client): number {
  if (client.clientSinceDate && CLIENT_SINCE_ISO.test(client.clientSinceDate)) {
    return new Date(`${client.clientSinceDate}T12:00:00.000Z`).getTime();
  }
  return client.createdAt?.toMillis?.() ?? 0;
}

function formatClientSinceCell(client: Client): string {
  if (client.clientSinceDate && CLIENT_SINCE_ISO.test(client.clientSinceDate)) {
    const [y, m, d] = client.clientSinceDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (client.createdAt?.toDate) {
    return client.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return '—';
}

interface Policy {
  id: string;
  policyType: string;
  policyNumber: string;
  insuranceCompany: string;
  policyOwner: string;
  beneficiary: string;
  beneficiaries?: Beneficiary[];
  coverageAmount: number;
  premiumAmount: number;
  premiumFrequency?: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  renewalDate?: string;
  amountOfProtection?: number;
  protectionUnit?: 'months' | 'years';
  effectiveDate?: string;
  status: 'Active' | 'Pending' | 'Lapsed';
  createdAt: Timestamp;
}

interface PolicyFormData {
  policyType: string;
  policyNumber: string;
  insuranceCompany: string;
  otherCarrier: string;
  policyOwner: string;
  beneficiaries: { name: string; type: 'primary' | 'contingent'; relationship?: string; percentage?: number }[];
  coverageAmount: string;
  premiumAmount: string;
  premiumFrequency: string;
  renewalDate: string;
  effectiveDate: string;
  amountOfProtection: string;
  protectionUnit: string;
  status: string;
}

type AddFlowStage = 'list' | 'upload' | 'review' | 'welcome';

interface ImportRow {
  name: string;
  owner?: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  policyNumber: string;
  carrier: string;
  policyType: string;
  effectiveDate: string;
  premium: string;
  coverageAmount: string;
  status: string;
  premiumFrequency?: string;
}

type ImportSourceType = 'local';
type ImportFileType = 'pdf' | 'spreadsheet' | 'text' | 'unknown';
type ImportFileState = 'queued' | 'parsing' | 'succeeded' | 'failed';
type ImportNoticeType = 'info' | 'warning' | 'error';
type ImportNoticeCode =
  | 'drive_connected'
  | 'files_need_review'
  | 'partial_parse'
  | 'unsupported_files'
  | 'encrypted_pdf'
  | 'mixed_batch_blocked'
  | 'file_limit'
  | 'row_limit'
  | 'drive_connect_failed'
  | 'drive_session_expired'
  | 'picker_failed'
  | 'upload_failed'
  | 'parse_failed'
  | 'import_failed'
  | 'processing_started'
  | 'ready_to_import'
  | 'files_added'
  | 'import_success';

const BATCH_RESULT_FETCH_CONCURRENCY = 5;


interface ImportSourceFile {
  sourceType: ImportSourceType;
  sourceFileId: string;
  file: File;
  fileType: ImportFileType;
}

interface ImportFileStatus {
  sourceFileId: string;
  name: string;
  fileType: ImportFileType;
  state: ImportFileState;
  loadedRows: number;
  rejectedRows: number;
  error?: string;
  notes?: string[];
}

interface ImportNotice {
  type: ImportNoticeType;
  code: ImportNoticeCode;
  title: string;
  items: string[];
}

type BatchFileStatusCounts = {
  succeeded: number;
  failed: number;
  queued: number;
  processing: number;
};

function countBatchFileStatuses(filesMap: Record<string, Record<string, unknown>>): BatchFileStatusCounts {
  return Object.values(filesMap).reduce<BatchFileStatusCounts>(
    (acc, file) => {
      const fileStatus = typeof file.status === 'string' ? file.status : 'queued';
      if (fileStatus === 'succeeded') acc.succeeded += 1;
      else if (fileStatus === 'failed') acc.failed += 1;
      else if (fileStatus === 'processing') acc.processing += 1;
      else acc.queued += 1;
      return acc;
    },
    { succeeded: 0, failed: 0, queued: 0, processing: 0 },
  );
}

function toPlainEnglishImportFailureReason(rawReason: string): string {
  const reason = (rawReason || '').trim();
  const lower = reason.toLowerCase();

  if (!reason) {
    return 'This file could not be processed. Please retry this file.';
  }
  if (lower.includes('encrypted') || lower.includes('password-protected') || lower.includes('password protected')) {
    return 'This PDF is password-protected. Remove protection or upload one at a time with +Add Client one page back.';
  }
  if (lower.includes('unsupported file type')) {
    return 'This file type is not supported for bulk import. Use PDF, CSV, TSV, Excel, or Google Sheets.';
  }
  if (lower.includes('unauthorized') || lower.includes('invalid_grant') || lower.includes('revoked') || lower.includes('expired')) {
    return 'Google Drive authorization expired. Reconnect Google Drive in Settings, then retry this file.';
  }
  if (lower.includes('failed to list folder contents')) {
    return 'We could not open one selected folder in Google Drive. Check sharing access and try again.';
  }
  if (lower.includes('drive download failed')) {
    return 'We could not download this file from Google Drive. It may have moved, changed permissions, or timed out.';
  }
  if (lower.includes('drive download step failed')) {
    return 'We could not retrieve this file from Google Drive right now. Please retry this file.';
  }
  if (lower.includes('storage upload step failed')) {
    return 'We could not stage this file for processing due to a temporary system issue. Please retry.';
  }
  if (lower.includes('job queue step failed')) {
    return 'We could not start processing this file yet due to a temporary queue issue. Please retry.';
  }
  if (lower.includes('google sheets export failed')) {
    return 'We could not export this Google Sheet as CSV right now. Please retry.';
  }
  if (
    lower === 'connection error.' ||
    lower.includes('connection error') ||
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('socket') ||
    lower.includes('timeout')
  ) {
    return 'Temporary connection issue while processing this file. Usually transient - retry this file.';
  }

  return reason;
}

function getImportRowReviewNotes(row: ImportRow): string[] {
  const notes: string[] = [];
  if (!row.effectiveDate.trim()) notes.push('No effective date found on the application.');
  if (!row.premium.trim()) notes.push('No premium amount listed in the document.');
  if (!row.email.trim()) notes.push('No email address provided.');
  return notes;
}

const IMPORT_NOTICE_COPY: Record<ImportNoticeCode, Omit<ImportNotice, 'code'>> = {
  drive_connected: {
    type: 'info',
    title: 'Google Drive connected',
    items: ['Google Drive connected.', 'Choose files to import.'],
  },
  files_need_review: {
    type: 'warning',
    title: 'Some files need review',
    items: ['A few files could not be fully processed. Review file status above and record notes below.'],
  },
  partial_parse: {
    type: 'warning',
    title: 'Partial results available',
    items: ['We captured what we could. Please review records before importing.'],
  },
  unsupported_files: {
    type: 'warning',
    title: 'Unsupported file types',
    items: ['Some files were skipped because this format is not supported.'],
  },
  encrypted_pdf: {
    type: 'warning',
    title: 'Protected PDF detected',
    items: ['Password-protected PDFs cannot be processed. Remove protection or upload one at a time with +Add Client one page back.'],
  },
  mixed_batch_blocked: {
    type: 'warning',
    title: 'Separate this upload',
    items: ['Please import spreadsheet files and PDF files in separate runs.'],
  },
  file_limit: {
    type: 'warning',
    title: 'File limit reached',
    items: [
      `You can upload up to ${MAX_FILES_PER_IMPORT} files per import.`,
      `For fastest results, upload ${RECOMMENDED_FILES_PER_IMPORT} files at a time.`,
    ],
  },
  row_limit: {
    type: 'warning',
    title: 'Import limit reached',
    items: ['This batch is over the row limit. Split into smaller imports to continue.'],
  },
  drive_connect_failed: {
    type: 'error',
    title: 'Could not connect Google Drive',
    items: ['Connection failed. Try again. If it keeps failing, reconnect in Settings.'],
  },
  drive_session_expired: {
    type: 'error',
    title: 'Google Drive session expired',
    items: ['Please reconnect Google Drive, then retry your import.'],
  },
  picker_failed: {
    type: 'error',
    title: 'Could not open Google Drive picker',
    items: ['Please try again. If this continues, refresh and retry.'],
  },
  upload_failed: {
    type: 'error',
    title: 'Upload failed',
    items: ['We could not upload one or more files. Please retry.'],
  },
  parse_failed: {
    type: 'error',
    title: 'File processing failed',
    items: ['We could not process this file. Try re-uploading or use a different file.'],
  },
  import_failed: {
    type: 'error',
    title: 'Import failed',
    items: ['No records were imported. Please retry after reviewing errors.'],
  },
  processing_started: {
    type: 'info',
    title: 'Processing files',
    items: ['Please keep this tab open while we prepare your import.'],
  },
  ready_to_import: {
    type: 'info',
    title: 'Ready to import',
    items: ['Your records are ready. Review and click Import when ready.'],
  },
  files_added: {
    type: 'info',
    title: 'Files added',
    items: ['We added your files. Review results below before importing.'],
  },
  import_success: {
    type: 'info',
    title: 'Import complete',
    items: ['Your clients were imported successfully.'],
  },
};

function buildImportNotice(
  code: ImportNoticeCode,
  overrides?: Partial<Pick<ImportNotice, 'type' | 'title' | 'items'>>,
): ImportNotice {
  const base = IMPORT_NOTICE_COPY[code];
  return {
    code,
    type: overrides?.type ?? base.type,
    title: overrides?.title ?? base.title,
    items: overrides?.items ?? base.items,
  };
}

function formatImportNoticeItems(type: ImportNoticeType, items: string[]): string[] {
  const cleanedItems = items
    .map((item) => item.replace(/^Warning:\s*/i, '').trim())
    .filter(Boolean)
    .map((item) => (item.length > 180 ? `${item.slice(0, 177)}...` : item));

  if (type !== 'warning') return cleanedItems;
  if (cleanedItems.length === 0) return ['Review file and record details below.'];
  if (cleanedItems.length === 1) return cleanedItems;
  return [cleanedItems[0], `${cleanedItems.length - 1} additional notes are listed in file status and record details below.`];
}

interface ParseBobSourceResult {
  rows: ImportRow[];
  note?: string;
  routing?: {
    carrierFormType: string;
    confidence: 'high' | 'low';
    pagesSent: number;
    usedBroaderMappedSubset: boolean;
    canRetryBroaderMappedSubset: boolean;
    subsetSkippedReason?: 'pdf_encrypted_unsupported';
  };
}

interface ParseProgressState {
  fileName: string;
  progress: number;
  label: string;
}

interface ParseApplicationOptions {
  carrierFormType?: ApplicationFormType;
  signal?: AbortSignal;
  onJobId?: (jobId: string) => void;
}

interface ParseApplicationResult {
  data: ExtractedApplicationData;
  note?: string;
  shortPdfWarning?: string;
}

interface GoogleDriveStatusResponse {
  success: boolean;
  connected: boolean;
  data?: {
    googleEmail?: string;
    connectedAt?: string;
    updatedAt?: string;
    scope?: string;
    hasRefreshToken: boolean;
  };
  error?: string;
}

interface GoogleDriveImportRouteResponse {
  success: boolean;
  batchId?: string;
  purpose?: 'bob' | 'application';
  resolvedFiles?: Array<{
    id: string;
    name: string;
    mimeType: string;
    fromFolder?: string;
  }>;
  results?: Array<{
    fileId: string;
    name: string;
    status: 'created' | 'reused' | 'failed';
    jobId?: string;
    jobStatus?: string;
    error?: string;
  }>;
  error?: string;
}

interface CancelGoogleDriveImportResponse {
  success: boolean;
  cancelled?: boolean;
  status?: string;
  jobsCancelled?: number;
  error?: string;
}

function countPolicySignals(row: ImportRow): number {
  let signals = 0;
  if (row.carrier?.trim()) signals++;
  if (row.policyType?.trim()) signals++;
  if (row.premium?.toString().trim()) signals++;
  if (row.coverageAmount?.toString().trim()) signals++;
  return signals;
}

function applyWelcomeTemplate(
  template: string,
  params: { firstName: string; code: string; agentName: string }
): string {
  return template
    .replace(/\{\{firstName\}\}/g, params.firstName)
    .replace(/\{\{code\}\}/g, params.code)
    .replace(/\{\{agentName\}\}/g, params.agentName);
}

function filterHighQualityImportRows(rows: ImportRow[]): { accepted: ImportRow[]; rejected: number; qualityRatio: number } {
  if (rows.length === 0) return { accepted: [], rejected: 0, qualityRatio: 0 };
  const accepted = rows.filter((row) => row.name.trim().length > 0 && countPolicySignals(row) >= 2);
  const rejected = rows.length - accepted.length;
  return {
    accepted,
    rejected,
    qualityRatio: accepted.length / rows.length,
  };
}

// ─── Helpers ───────────────────────────────────────────────

function normalizePolicyType(raw: string): string {
  const lower = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    'iul': 'IUL',
    'indexed universal life': 'IUL',
    'term': 'Term Life',
    'term life': 'Term Life',
    'whole life': 'Whole Life',
    'whole': 'Whole Life',
    'mortgage protection': 'Mortgage Protection',
    'mortgage': 'Mortgage Protection',
    'accidental': 'Accidental',
    'accidental death': 'Accidental',
    'ad&d': 'Accidental',
  };
  return map[lower] || (raw.trim() || 'Other');
}

function normalizeStatus(raw: string): 'Active' | 'Pending' | 'Lapsed' {
  const lower = raw.trim().toLowerCase();
  if (lower === 'pending' || lower === 'applied') return 'Pending';
  if (lower === 'lapsed' || lower === 'cancelled' || lower === 'canceled' || lower === 'terminated') return 'Lapsed';
  return 'Active';
}

function normalizeImportDate(raw: string): string | null {
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Try Date.parse as fallback
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return null;
}

function generateClientCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const emptyPolicyForm: PolicyFormData = {
  policyType: '',
  policyNumber: '',
  insuranceCompany: '',
  otherCarrier: '',
  policyOwner: '',
  beneficiaries: [{ name: '', type: 'primary', relationship: '', percentage: undefined }],
  coverageAmount: '',
  premiumAmount: '',
  premiumFrequency: 'monthly',
  renewalDate: '',
  effectiveDate: '',
  amountOfProtection: '',
  protectionUnit: 'years',
  status: 'Active',
};

function mapExtractedApplicationToPolicyFormData(data: ExtractedApplicationData): Partial<PolicyFormData> {
  const mapped: Partial<PolicyFormData> = {};
  if (data.policyType) mapped.policyType = data.policyType;
  if (data.insuranceCompany) {
    const match = KNOWN_CARRIERS.find(
      (c) => c.toLowerCase() === data.insuranceCompany!.toLowerCase()
    );
    if (match) {
      mapped.insuranceCompany = match;
    } else {
      mapped.insuranceCompany = 'Other';
      mapped.otherCarrier = data.insuranceCompany;
    }
  }
  if (data.policyOwner) mapped.policyOwner = data.policyOwner;
  if (data.beneficiaries && data.beneficiaries.length > 0) {
    mapped.beneficiaries = data.beneficiaries.map((b) => ({
      name: b.name,
      type: b.type,
      relationship: b.relationship || '',
      percentage: b.percentage,
    }));
  }
  if (data.coverageAmount != null) mapped.coverageAmount = String(data.coverageAmount);
  if (data.premiumAmount != null) mapped.premiumAmount = String(data.premiumAmount);
  if (data.premiumFrequency) mapped.premiumFrequency = data.premiumFrequency;
  if (data.renewalDate) mapped.renewalDate = data.renewalDate;
  if (data.effectiveDate) mapped.effectiveDate = data.effectiveDate;
  mapped.status = 'Active';
  return mapped;
}

// ─── Policy API helpers (Admin SDK) ────────────────────────

async function apiCreatePolicy(token: string, clientId: string, data: Record<string, unknown>): Promise<string> {
  const res = await fetch('/api/policies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ clientId, ...data }),
  });
  if (!res.ok) {
    let detail = `status ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
      else if (body?.error) detail = body.error;
    } catch {}
    throw new Error(`Policy API failed: ${detail}`);
  }
  const { id } = await res.json();
  return id;
}

async function apiUpdatePolicy(token: string, clientId: string, policyId: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/policies', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ clientId, policyId, ...data }),
  });
  if (!res.ok) throw new Error(`Failed to update policy (${res.status})`);
}

async function apiDeletePolicy(token: string, clientId: string, policyId?: string): Promise<void> {
  const res = await fetch('/api/policies', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ clientId, policyId }),
  });
  if (!res.ok) throw new Error(`Failed to delete policy (${res.status})`);
}

async function apiCancelIngestionV3Job(
  token: string,
  jobId: string,
  error: { code: string; message: string; retryable: boolean; terminal: boolean },
): Promise<void> {
  const res = await fetch(`/api/ingestion/v3/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ error }),
  });
  if (!res.ok) {
    throw new Error(`Failed to cancel processing job (${res.status}).`);
  }
}

// ─── Component ─────────────────────────────────────────────

export default function ClientsPage() {
  const { user, agentProfile, loading, dismissTip } = useDashboard();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Client state ──
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // ── Sorting state ──
  type SortKey = 'name' | 'email' | 'createdAt';
  type SortDir = 'asc' | 'desc';
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ── Pagination state ──
  const PAGE_SIZE = 25;
  const [currentPage, setCurrentPage] = useState(1);

  // ── Client form state ──
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    clientSinceDate: string;
    preferredLanguage: SupportedLanguage;
  }>({
    name: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    clientSinceDate: '',
    preferredLanguage: 'en',
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [addFlowStage, setAddFlowStage] = useState<AddFlowStage>('list');
  const [manualEntryExpanded, setManualEntryExpanded] = useState(false);
  const [addFlowPolicyForm, setAddFlowPolicyForm] = useState<PolicyFormData>({ ...emptyPolicyForm });
  const [welcomeDraft, setWelcomeDraft] = useState('');
  const [welcomeSending, setWelcomeSending] = useState(false);
  const [welcomeError, setWelcomeError] = useState('');
  const [createdClientContext, setCreatedClientContext] = useState<{
    id: string;
    name: string;
    phone: string;
  } | null>(null);
  const [addFlowToast, setAddFlowToast] = useState<{ message: string; celebrate: boolean } | null>(null);

  // ── Delete client state ──
  const [deleteConfirmClient, setDeleteConfirmClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState(false);

  // ── Policy state ──
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policiesVersion, setPoliciesVersion] = useState(0);
  const refreshPolicies = useCallback(() => setPoliciesVersion((v) => v + 1), []);

  // ── Policy form state ──
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [policyFormData, setPolicyFormData] = useState<PolicyFormData>({ ...emptyPolicyForm });
  const [policyFormError, setPolicyFormError] = useState('');
  const [policyFormSuccess, setPolicyFormSuccess] = useState('');
  const [policySubmitting, setPolicySubmitting] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);

  // ── Delete policy state ──
  const [deleteConfirmPolicy, setDeleteConfirmPolicy] = useState<Policy | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Application upload state ──
  const [pendingClientApplicationData, setPendingClientApplicationData] = useState<ExtractedApplicationData | null>(null);
  const [clientApplicationUploading, setClientApplicationUploading] = useState(false);
  const [clientApplicationNote, setClientApplicationNote] = useState<string | null>(null);
  const [clientApplicationShortPdfWarning, setClientApplicationShortPdfWarning] = useState<string | null>(null);
  const [clientApplicationType, setClientApplicationType] = useState<ApplicationFormType>(DEFAULT_APPLICATION_TYPE);
  const [clientParseProgress, setClientParseProgress] = useState<ParseProgressState | null>(null);
  const [policyApplicationUploading, setPolicyApplicationUploading] = useState(false);
  const [policyApplicationNote, setPolicyApplicationNote] = useState<string | null>(null);
  const [policyApplicationType, setPolicyApplicationType] = useState<ApplicationFormType>(DEFAULT_APPLICATION_TYPE);
  const [policyParseProgress, setPolicyParseProgress] = useState<ParseProgressState | null>(null);
  const [autoOpenPolicyUploadPicker, setAutoOpenPolicyUploadPicker] = useState(false);

  // ── Import state ──
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [importNotice, setImportNotice] = useState<ImportNotice | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importSuccess, setImportSuccess] = useState('');
  const [importFileStatuses, setImportFileStatuses] = useState<ImportFileStatus[]>([]);
  const [importSessionStartedAt, setImportSessionStartedAt] = useState<number | null>(null);
  const [importDragActive, setImportDragActive] = useState(false);
  const [selectedImportRowIndex, setSelectedImportRowIndex] = useState(0);

  // ── Background batch tracking (persists across modal open/close) ──
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [activeBatchProgress, setActiveBatchProgress] = useState<{
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    queuedFiles: number;
    processingFiles: number;
    createdAtMs: number | null;
  } | null>(null);
  const [batchClockMs, setBatchClockMs] = useState<number>(() => Date.now());
  const [cancelingBatch, setCancelingBatch] = useState(false);
  const [batchStatusNotice, setBatchStatusNotice] = useState<{ type: 'info' | 'error'; message: string } | null>(null);
  const [batchNotification, setBatchNotification] = useState<{
    batchId: string;
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    failedFileReasons: Array<{ fileName: string; reason: string }>;
    totalRows: number;
    status: 'completed' | 'partial';
    succeededJobIds: string[];
  } | null>(null);
  const batchDismissedRef = useRef(false);
  const [justImportedClients, setJustImportedClients] = useState<{ clientId: string; phone: string; firstName: string; clientCode: string }[]>([]);
  const [introMessage, setIntroMessage] = useState(DEFAULT_INTRO_TEMPLATE);
  const [sendingIntro, setSendingIntro] = useState(false);
  const [introSentCount, setIntroSentCount] = useState<number | null>(null);
  const [selectedIntroClients, setSelectedIntroClients] = useState<Set<string>>(new Set());
  const [showIntroConfirm, setShowIntroConfirm] = useState(false);
  const [googleDriveLoading, setGoogleDriveLoading] = useState(false);
  const [googleDriveConnected, setGoogleDriveConnected] = useState(false);
  const [googleDriveEmail, setGoogleDriveEmail] = useState<string | null>(null);
  const [googleDriveActionLoading, setGoogleDriveActionLoading] = useState(false);
  const {
    pickFiles: pickGoogleDriveFiles,
    loading: googlePickerLoading,
    error: googlePickerError,
    clearError: clearGooglePickerError,
  } = useGooglePicker();

  const clearImportNotice = useCallback(() => {
    setImportNotice(null);
  }, []);

  const showImportNotice = useCallback((
    code: ImportNoticeCode,
    overrides?: Partial<Pick<ImportNotice, 'type' | 'title' | 'items'>>,
  ) => {
    setImportNotice(buildImportNotice(code, overrides));
  }, []);

  useEffect(() => {
    if (importData.length === 0) {
      setSelectedImportRowIndex(0);
      return;
    }
    setSelectedImportRowIndex((current) => Math.min(current, importData.length - 1));
  }, [importData]);

  useEffect(() => {
    if (!googlePickerError) {
      setImportNotice((current) => (current?.code === 'picker_failed' ? null : current));
      return;
    }
    showImportNotice('picker_failed', { items: [googlePickerError] });
  }, [googlePickerError, showImportNotice]);

  // ── Anniversary visibility ──
  const [clientUpcomingAnniversaryCounts, setClientUpcomingAnniversaryCounts] = useState<Record<string, number>>({});
  const [startedPolicyReviewPolicyIds, setStartedPolicyReviewPolicyIds] = useState<Set<string>>(new Set());

  // ── Share toast state ──
  const [copiedClientId, setCopiedClientId] = useState<string | null>(null);

  // ── Push token cache for ClientDetailModal ──
  const [clientPushToken, setClientPushToken] = useState<string | null | undefined>(undefined);

  // ── Flag At Risk state ──
  const [flagAtRiskClient, setFlagAtRiskClient] = useState<Client | null>(null);
  const [flagAtRiskPolicies, setFlagAtRiskPolicies] = useState<Policy[]>([]);
  const [flagAtRiskPolicyId, setFlagAtRiskPolicyId] = useState<string | null>(null);
  const [flagAtRiskReason, setFlagAtRiskReason] = useState<'lapsed_payment' | 'cancellation'>('lapsed_payment');
  const [flagAtRiskLoading, setFlagAtRiskLoading] = useState(false);
  const [flagAtRiskPoliciesLoading, setFlagAtRiskPoliciesLoading] = useState(false);
  const [flagAtRiskResult, setFlagAtRiskResult] = useState<{ success: boolean; message: string } | null>(null);

  // ── Client policy summary cache ──
  const [clientPolicySummaries, setClientPolicySummaries] = useState<Record<string, { active: number; pending: number; lapsed: number; total: number }>>({});
  const [summaryVersion, setSummaryVersion] = useState(0);
  const refreshSummaries = useCallback(() => setSummaryVersion((v) => v + 1), []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const clientApplicationFileInputRef = useRef<HTMLInputElement>(null);
  const policyApplicationFileInputRef = useRef<HTMLInputElement>(null);
  const clientApplicationAbortRef = useRef<AbortController | null>(null);
  const policyApplicationAbortRef = useRef<AbortController | null>(null);
  const activeClientJobIdRef = useRef<string | null>(null);
  const activePolicyJobIdRef = useRef<string | null>(null);
  const importModalScrollRef = useRef<HTMLDivElement>(null);
  const importReviewSectionRef = useRef<HTMLDivElement>(null);
  const pendingImportReviewScrollRef = useRef(false);
  const emptyClientsStateTrackedRef = useRef(false);
  const emptyClientSearchTrackedRef = useRef<string | null>(null);
  const welcomeSmsTemplate = (agentProfile.welcomeSmsTemplate || '').trim() || DEFAULT_WELCOME_SMS_TEMPLATE;
  useEffect(() => {
    if (!activeBatchId) {
      setBatchClockMs(Date.now());
      return;
    }
    const timer = window.setInterval(() => setBatchClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeBatchId]);


  const buildWelcomeSms = useCallback((firstName: string, code: string, language: SupportedLanguage = 'en') => {
    const agentName = (agentProfile.name || 'your agent').trim() || 'your agent';
    if (language === 'es') {
      return buildWelcomeMessage({
        firstName,
        agentName,
        code,
        appUrl: CLIENT_APP_URL,
        language,
      });
    }
    return applyWelcomeTemplate(welcomeSmsTemplate, { firstName, code, agentName });
  }, [agentProfile.name, welcomeSmsTemplate]);

  // ─── Background Batch Listeners ──────────────────────────

  // Listen to active batch doc for completion
  useEffect(() => {
    if (!user || !activeBatchId) return;

    const unsubscribe = onSnapshot(
      doc(db, 'agents', user.uid, 'batchJobs', activeBatchId),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const status = data.status as string;
        const filesMap = (data.files || {}) as Record<string, Record<string, unknown>>;
        const statusCounts = countBatchFileStatuses(filesMap);
        const createdAt = data.createdAt?.toDate?.() ??
          (typeof data.createdAt?.seconds === 'number' ? new Date(data.createdAt.seconds * 1000) : null);
        setActiveBatchProgress({
          totalFiles: typeof data.totalFiles === 'number' ? data.totalFiles : statusCounts.succeeded + statusCounts.failed + statusCounts.queued + statusCounts.processing,
          completedFiles: typeof data.completedFiles === 'number' ? data.completedFiles : statusCounts.succeeded,
          failedFiles: typeof data.failedFiles === 'number' ? data.failedFiles : statusCounts.failed,
          queuedFiles: statusCounts.queued,
          processingFiles: statusCounts.processing,
          createdAtMs: createdAt ? createdAt.getTime() : null,
        });

        if (status === 'completed' || status === 'partial') {
          const failedFileReasons = Object.values(filesMap)
            .filter((f) => f.status === 'failed')
            .map((f) => ({
              fileName: typeof f.fileName === 'string' ? f.fileName : 'Unnamed file',
              reason: toPlainEnglishImportFailureReason(
                typeof f.error === 'string' && f.error.trim().length > 0
                  ? f.error.trim()
                  : 'Processing failed before records could be extracted.',
              ),
            }));
          const succeededJobIds = Object.entries(filesMap)
            .filter(([, f]) => f.status === 'succeeded' && typeof f.jobId === 'string')
            .map(([, f]) => f.jobId as string);

          setBatchNotification({
            batchId: activeBatchId,
            totalFiles: typeof data.totalFiles === 'number' ? data.totalFiles : 0,
            completedFiles: typeof data.completedFiles === 'number' ? data.completedFiles : 0,
            failedFiles: typeof data.failedFiles === 'number' ? data.failedFiles : 0,
            failedFileReasons,
            totalRows: typeof data.totalRows === 'number' ? data.totalRows : 0,
            status: status as 'completed' | 'partial',
            succeededJobIds,
          });
          setActiveBatchProgress(null);
          setActiveBatchId(null);
        } else if (status === 'cancelled') {
          setBatchStatusNotice({ type: 'info', message: 'Import cancelled. You can start a new import anytime.' });
          setActiveBatchProgress(null);
          setActiveBatchId(null);
        } else if (status === 'failed') {
          setBatchStatusNotice({ type: 'error', message: 'Import stopped because processing failed. Please try again.' });
          setActiveBatchProgress(null);
          setActiveBatchId(null);
        }
      },
    );

    return () => unsubscribe();
  }, [user, activeBatchId]);

  // Detect recent batches on page load (covers browser refresh)
  // Fetches the most recent batch doc. If it's still processing and < 30 min old,
  // resume the in-progress indicator. If it recently completed/partial, show the
  // notification banner so the user doesn't miss it.
  useEffect(() => {
    if (!user || activeBatchId || batchNotification || batchDismissedRef.current) return;

    const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

    const q = query(
      collection(db, 'agents', user.uid, 'batchJobs'),
      orderBy('createdAt', 'desc'),
      firestoreLimit(1),
    );

    // One-time check, not persistent listener
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const latestDoc = snap.docs[0];
        const data = latestDoc.data();
        const status = data.status as string;
        const createdAt = data.createdAt?.toDate?.() ?? (typeof data.createdAt?.seconds === 'number' ? new Date(data.createdAt.seconds * 1000) : null);
        const ageMs = createdAt ? Date.now() - createdAt.getTime() : Infinity;

        if (status === 'processing' && ageMs < STALE_THRESHOLD_MS) {
          // Still processing and recent — resume in-progress indicator
          const filesMap = (data.files || {}) as Record<string, Record<string, unknown>>;
          const statusCounts = countBatchFileStatuses(filesMap);
          setActiveBatchProgress({
            totalFiles: typeof data.totalFiles === 'number' ? data.totalFiles : statusCounts.succeeded + statusCounts.failed + statusCounts.queued + statusCounts.processing,
            completedFiles: typeof data.completedFiles === 'number' ? data.completedFiles : statusCounts.succeeded,
            failedFiles: typeof data.failedFiles === 'number' ? data.failedFiles : statusCounts.failed,
            queuedFiles: statusCounts.queued,
            processingFiles: statusCounts.processing,
            createdAtMs: createdAt ? createdAt.getTime() : null,
          });
          setActiveBatchId(latestDoc.id);
        } else if ((status === 'completed' || status === 'partial') && ageMs < STALE_THRESHOLD_MS) {
          // Recently finished — show the notification banner
          const filesMap = (data.files || {}) as Record<string, Record<string, unknown>>;
          const failedFileReasons = Object.values(filesMap)
            .filter((f) => f.status === 'failed')
            .map((f) => ({
              fileName: typeof f.fileName === 'string' ? f.fileName : 'Unnamed file',
              reason: toPlainEnglishImportFailureReason(
                typeof f.error === 'string' && f.error.trim().length > 0
                  ? f.error.trim()
                  : 'Processing failed before records could be extracted.',
              ),
            }));
          const succeededJobIds = Object.entries(filesMap)
            .filter(([, f]) => f.status === 'succeeded' && typeof f.jobId === 'string')
            .map(([, f]) => f.jobId as string);

          setBatchNotification({
            batchId: latestDoc.id,
            totalFiles: typeof data.totalFiles === 'number' ? data.totalFiles : 0,
            completedFiles: typeof data.completedFiles === 'number' ? data.completedFiles : 0,
            failedFiles: typeof data.failedFiles === 'number' ? data.failedFiles : 0,
            failedFileReasons,
            totalRows: typeof data.totalRows === 'number' ? data.totalRows : 0,
            status: status as 'completed' | 'partial',
            succeededJobIds,
          });
        } else if (status === 'cancelled' && ageMs < STALE_THRESHOLD_MS) {
          setBatchStatusNotice({ type: 'info', message: 'Your previous import was cancelled.' });
        } else if (status === 'failed' && ageMs < STALE_THRESHOLD_MS) {
          setBatchStatusNotice({ type: 'error', message: 'A recent import failed before completion.' });
        }
      }
      // Unsubscribe after first result — the active batch listener takes over
      unsubscribe();
    });

    return () => unsubscribe();
  }, [user, activeBatchId, batchNotification]);

  // ─── Data Fetching ───────────────────────────────────────

  // Fetch clients
  useEffect(() => {
    if (!user) return;
    setClientsLoading(true);
    const q = query(collection(db, 'agents', user.uid, 'clients'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Client)));
      setClientsLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Fetch policies for selected client via Admin SDK API route
  useEffect(() => {
    if (!user || !selectedClient) {
      setPolicies([]);
      return;
    }
    let cancelled = false;
    setPoliciesLoading(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/policies?clientId=${selectedClient.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const { policies: data } = await res.json();
        if (!cancelled) {
          setPolicies(data as Policy[]);
        }
      } catch {
        if (!cancelled) {
          setPolicies([]);
        }
      } finally {
        clearTimeout(timeout);
        if (!cancelled) {
          setPoliciesLoading(false);
        }
      }
    })();

    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); };
  }, [user, selectedClient, policiesVersion]);

  // Read push token directly from the already-loaded client snapshot data
  useEffect(() => {
    if (!selectedClient) {
      setClientPushToken(undefined);
      return;
    }
    setClientPushToken(selectedClient.pushToken || null);
  }, [selectedClient]);

  // Track policies with an existing rewrite campaign (started policy review)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'agents', user.uid, 'policyReviews'));
    return onSnapshot(q, (snap) => {
      const policyIds = new Set<string>();
      snap.docs.forEach((reviewDoc) => {
        const data = reviewDoc.data() as { policyId?: unknown };
        if (typeof data.policyId === 'string' && data.policyId.trim().length > 0) {
          policyIds.add(data.policyId);
        }
      });
      setStartedPolicyReviewPolicyIds(policyIds);
    }, () => {});
  }, [user]);

  // Fetch per-client upcoming anniversary counts for subtle row badges
  useEffect(() => {
    if (!user || clients.length === 0) {
      setClientUpcomingAnniversaryCounts({});
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const token = await user.getIdToken();
        const upcomingCounts: Record<string, number> = {};

        await Promise.all(
          clients.map(async (client) => {
            try {
              const res = await fetch(`/api/policies?clientId=${client.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) return;
              const { policies: data } = await res.json();
              let clientUpcomingCount = 0;
              (data as Policy[]).forEach((p) => {
                if (
                  getUpcomingAnniversaryIfEligible({
                    policyId: p.id,
                    createdAt: p.createdAt,
                    effectiveDate: p.effectiveDate,
                    startedPolicyReviewPolicyIds,
                  })
                ) {
                  clientUpcomingCount += 1;
                }
              });
              if (clientUpcomingCount > 0) {
                upcomingCounts[client.id] = clientUpcomingCount;
              }
            } catch {
              // skip this client on error
            }
          })
        );

        if (!cancelled) {
          setClientUpcomingAnniversaryCounts(upcomingCounts);
        }
      } catch {
        // ignore
      }
    })();

    return () => { cancelled = true; };
  }, [user, clients, startedPolicyReviewPolicyIds]);

  // ─── Fetch policy summaries for client table ──────────────
  useEffect(() => {
    if (!user || clients.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await user.getIdToken();
        const summaries: Record<string, { active: number; pending: number; lapsed: number; total: number }> = {};

        await Promise.all(
          clients.map(async (client) => {
            try {
              const res = await fetch(`/api/policies?clientId=${client.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) return;
              const { policies: data } = await res.json();
              const pols = data as Policy[];
              summaries[client.id] = {
                active: pols.filter((p) => p.status === 'Active').length,
                pending: pols.filter((p) => p.status === 'Pending').length,
                lapsed: pols.filter((p) => p.status === 'Lapsed').length,
                total: pols.length,
              };
            } catch { /* skip */ }
          })
        );

        if (!cancelled) setClientPolicySummaries(summaries);
      } catch { /* ignore */ }
    })();

    return () => { cancelled = true; };
  }, [user, clients, summaryVersion]);

  // ─── Flag At Risk handlers ──────────────────────────────
  const handleOpenFlagAtRisk = useCallback(async (client: Client) => {
    setFlagAtRiskClient(client);
    setFlagAtRiskPolicyId(null);
    setFlagAtRiskReason('lapsed_payment');
    setFlagAtRiskResult(null);
    setFlagAtRiskPoliciesLoading(true);

    if (user) {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/policies?clientId=${client.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const { policies: data } = await res.json();
          const pols = data as Policy[];
          setFlagAtRiskPolicies(pols);
          if (pols.length === 1) setFlagAtRiskPolicyId(pols[0].id);
        }
      } catch { /* ignore */ }
    }
    setFlagAtRiskPoliciesLoading(false);
  }, [user]);

  const handleCloseFlagAtRisk = useCallback(() => {
    setFlagAtRiskClient(null);
    setFlagAtRiskPolicies([]);
    setFlagAtRiskPolicyId(null);
    setFlagAtRiskResult(null);
  }, []);

  const handleSubmitFlagAtRisk = useCallback(async () => {
    if (!user || !flagAtRiskClient || !flagAtRiskPolicyId) return;
    setFlagAtRiskLoading(true);
    setFlagAtRiskResult(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/conservation/flag-at-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clientId: flagAtRiskClient.id,
          policyId: flagAtRiskPolicyId,
          reason: flagAtRiskReason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFlagAtRiskResult({
          success: true,
          message: data.alert?.isChargebackRisk
            ? 'Alert created — chargeback risk detected. Outreach scheduled in 2 hours.'
            : 'Alert created. You can manage it from the Retention page.',
        });
        refreshPolicies();
        setTimeout(() => handleCloseFlagAtRisk(), 3000);
      } else {
        setFlagAtRiskResult({ success: false, message: data.error || 'Failed to create alert.' });
      }
    } catch {
      setFlagAtRiskResult({ success: false, message: 'Something went wrong. Please try again.' });
    } finally {
      setFlagAtRiskLoading(false);
    }
  }, [user, flagAtRiskClient, flagAtRiskPolicyId, flagAtRiskReason, refreshPolicies, handleCloseFlagAtRisk]);

  // ─── Filtered + Sorted Clients ────────────────────────────

  const filteredClients = useMemo(() => {
    let result = clients;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.clientCode?.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'email') cmp = (a.email || '').localeCompare(b.email || '');
      else if (sortKey === 'createdAt') {
        const aT = clientSinceSortMs(a);
        const bT = clientSinceSortMs(b);
        cmp = aT - bT;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [clients, searchQuery, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredClients.slice(start, start + PAGE_SIZE);
  }, [filteredClients, currentPage]);

  useEffect(() => {
    if (clientsLoading) return;
    if (clients.length === 0 && !emptyClientsStateTrackedRef.current) {
      captureEvent(ANALYTICS_EVENTS.EMPTY_STATE_SEEN, {
        area: 'clients_list',
      });
      emptyClientsStateTrackedRef.current = true;
      return;
    }
    if (clients.length > 0) {
      emptyClientsStateTrackedRef.current = false;
    }
  }, [clientsLoading, clients.length]);

  useEffect(() => {
    if (clientsLoading) return;
    const normalizedSearch = searchQuery.trim().toLowerCase();
    if (
      normalizedSearch &&
      filteredClients.length === 0 &&
      emptyClientSearchTrackedRef.current !== normalizedSearch
    ) {
      captureEvent(ANALYTICS_EVENTS.EMPTY_STATE_SEEN, {
        area: 'clients_search',
        context: 'no_results',
      });
      emptyClientSearchTrackedRef.current = normalizedSearch;
      return;
    }
    if (!normalizedSearch || filteredClients.length > 0) {
      emptyClientSearchTrackedRef.current = null;
    }
  }, [clientsLoading, filteredClients.length, searchQuery]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, sortKey, sortDir]);

  useEffect(() => {
    if (!addFlowToast) return;
    if (addFlowToast.celebrate) {
      fireConfetti();
    }
    const timeoutId = window.setTimeout(() => {
      setAddFlowToast(null);
    }, 4200);
    return () => window.clearTimeout(timeoutId);
  }, [addFlowToast]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => (
    <svg className={`w-3.5 h-3.5 inline ml-1 ${sortKey === column ? 'text-[#005851]' : 'text-[#d0d0d0]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {sortKey === column && sortDir === 'asc'
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        : sortKey === column && sortDir === 'desc'
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      }
    </svg>
  );

  // ─── Client Handlers ─────────────────────────────────────

  const resetAddFlowState = useCallback(() => {
    clientApplicationAbortRef.current?.abort();
    clientApplicationAbortRef.current = null;
    activeClientJobIdRef.current = null;
    setFormData({ name: '', email: '', phone: '', dateOfBirth: '', clientSinceDate: '', preferredLanguage: 'en' });
    setFormError('');
    setFormSuccess('');
    setPendingClientApplicationData(null);
    setClientApplicationNote(null);
    setClientApplicationShortPdfWarning(null);
    setClientApplicationType(DEFAULT_APPLICATION_TYPE);
    setClientApplicationUploading(false);
    setClientParseProgress(null);
    setManualEntryExpanded(false);
    setAddFlowPolicyForm({ ...emptyPolicyForm });
    setCreatedClientContext(null);
    setWelcomeDraft('');
    setWelcomeError('');
    setWelcomeSending(false);
  }, []);

  const handleStartAddFlow = useCallback(() => {
    resetAddFlowState();
    setAddFlowStage('upload');
  }, [resetAddFlowState]);

  const handleCloseAddFlow = useCallback(() => {
    resetAddFlowState();
    setAddFlowStage('list');
  }, [resetAddFlowState]);

  const handleOpenModal = useCallback(() => {
    setEditingClient(null);
    handleStartAddFlow();
  }, [handleStartAddFlow]);

  const handleCloseModal = useCallback(() => {
    clientApplicationAbortRef.current?.abort();
    clientApplicationAbortRef.current = null;
    activeClientJobIdRef.current = null;
    setIsModalOpen(false);
    setEditingClient(null);
    setFormError('');
    setFormSuccess('');
  }, []);

  const handleEditClient = useCallback((client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      dateOfBirth: client.dateOfBirth || '',
      clientSinceDate: client.clientSinceDate || '',
      preferredLanguage: resolveClientLanguage(client.preferredLanguage),
    });
    setFormError('');
    setFormSuccess('');
    setIsModalOpen(true);
  }, []);

  const handleInlineUpdateClient = useCallback(async (
    clientId: string,
    updates: {
      name: string;
      email: string;
      phone: string;
      dateOfBirth: string;
      clientSinceDate: string;
      preferredLanguage?: SupportedLanguage;
    },
  ) => {
    if (!user) {
      throw new Error('Not authenticated');
    }

    const sinceTrim = updates.clientSinceDate.trim();
    const clientSincePatch: Record<string, unknown> = {};
    if (!sinceTrim) {
      clientSincePatch.clientSinceDate = deleteField();
    } else if (CLIENT_SINCE_ISO.test(sinceTrim)) {
      clientSincePatch.clientSinceDate = sinceTrim;
    }

    const agentClientPatch: Record<string, unknown> = {
      name: updates.name,
      email: updates.email,
      phone: updates.phone,
      dateOfBirth: updates.dateOfBirth || null,
      ...clientSincePatch,
    };
    if (updates.preferredLanguage) {
      agentClientPatch.preferredLanguage = resolveClientLanguage(updates.preferredLanguage);
    }

    await updateDoc(doc(db, 'agents', user.uid, 'clients', clientId), agentClientPatch);
    try {
      const topLevelPatch: Record<string, unknown> = {
        name: updates.name,
        email: updates.email,
        phone: updates.phone,
        dateOfBirth: updates.dateOfBirth || null,
        ...clientSincePatch,
      };
      if (updates.preferredLanguage) {
        topLevelPatch.preferredLanguage = resolveClientLanguage(updates.preferredLanguage);
      }
      await updateDoc(doc(db, 'clients', clientId), topLevelPatch);
    } catch (mirrorErr) {
      console.error('Top-level client mirror update failed (non-blocking):', mirrorErr);
    }

    const nextClientSinceLocal = (prev: string | undefined): string | undefined => {
      if (!sinceTrim) return undefined;
      if (CLIENT_SINCE_ISO.test(sinceTrim)) return sinceTrim;
      return prev;
    };

    setSelectedClient((prev) => (
      prev && prev.id === clientId
        ? {
            ...prev,
            name: updates.name,
            email: updates.email,
            phone: updates.phone,
            dateOfBirth: updates.dateOfBirth || '',
            clientSinceDate: nextClientSinceLocal(prev.clientSinceDate),
            preferredLanguage: resolveClientLanguage(updates.preferredLanguage ?? prev.preferredLanguage),
          }
        : prev
    ));

    setClients((prev) => prev.map((client) => (
      client.id === clientId
        ? {
            ...client,
            name: updates.name,
            email: updates.email,
            phone: updates.phone,
            dateOfBirth: updates.dateOfBirth || '',
            clientSinceDate: nextClientSinceLocal(client.clientSinceDate),
            preferredLanguage: resolveClientLanguage(updates.preferredLanguage ?? client.preferredLanguage),
          }
        : client
    )));
  }, [user]);

  const handleSubmitClient = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formData.name.trim()) {
      setFormError('Client name is required.');
      return;
    }
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    try {
      if (!editingClient) {
        return;
      }
      const editSinceTrim = formData.clientSinceDate.trim();
      const editSincePatch: Record<string, unknown> = {};
      if (!editSinceTrim) {
        editSincePatch.clientSinceDate = deleteField();
      } else if (CLIENT_SINCE_ISO.test(editSinceTrim)) {
        editSincePatch.clientSinceDate = editSinceTrim;
      }

      const editSinceLocal = (prev: string | undefined): string | undefined => {
        if (!editSinceTrim) return undefined;
        if (CLIENT_SINCE_ISO.test(editSinceTrim)) return editSinceTrim;
        return prev;
      };

      await updateDoc(doc(db, 'agents', user.uid, 'clients', editingClient.id), {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        dateOfBirth: formData.dateOfBirth || null,
        preferredLanguage: formData.preferredLanguage,
        ...editSincePatch,
      });
      try {
        await updateDoc(doc(db, 'clients', editingClient.id), {
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          dateOfBirth: formData.dateOfBirth || null,
          preferredLanguage: formData.preferredLanguage,
          ...editSincePatch,
        });
      } catch (mirrorErr) {
        console.error('Top-level client mirror update failed (non-blocking):', mirrorErr);
      }
      if (selectedClient?.id === editingClient.id) {
        setSelectedClient((prev) =>
          prev
            ? {
                ...prev,
                name: formData.name.trim(),
                email: formData.email.trim(),
                phone: formData.phone.trim(),
                dateOfBirth: formData.dateOfBirth || '',
                clientSinceDate: editSinceLocal(prev.clientSinceDate),
                preferredLanguage: formData.preferredLanguage,
              }
            : null
        );
      }
      setClients((prev) =>
        prev.map((c) =>
          c.id === editingClient.id
            ? {
                ...c,
                name: formData.name.trim(),
                email: formData.email.trim(),
                phone: formData.phone.trim(),
                dateOfBirth: formData.dateOfBirth || '',
                clientSinceDate: editSinceLocal(c.clientSinceDate),
                preferredLanguage: formData.preferredLanguage,
              }
            : c,
        ),
      );
      setFormSuccess('Client updated!');
      setTimeout(() => handleCloseModal(), 800);
    } catch (err) {
      console.error('Error saving client:', err);
      captureEvent(ANALYTICS_EVENTS.ACTION_FAILED, {
        action: editingClient ? 'update_client' : 'create_client',
        surface: 'clients',
        reason: 'save_failed',
      });
      setFormError('Failed to save client. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [user, formData, editingClient, selectedClient, handleCloseModal]);

  const hasAddFlowPolicyInput = useCallback((data: PolicyFormData) => {
    if (data.policyType.trim()) return true;
    if (data.insuranceCompany.trim()) return true;
    if (data.otherCarrier.trim()) return true;
    if (data.policyOwner.trim()) return true;
    if (data.coverageAmount.trim()) return true;
    if (data.premiumAmount.trim()) return true;
    return data.beneficiaries.some((b) => b.name.trim() || (b.relationship || '').trim() || typeof b.percentage === 'number');
  }, []);

  const createClientFromAddFlow = useCallback(async (
    source: 'manual' | 'pdf_parse'
  ): Promise<{ id: string; name: string; phone: string; code: string }> => {
    if (!user) {
      throw new Error('You must be signed in to add a client.');
    }
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      throw new Error('Client name is required.');
    }

    const code = generateClientCode();
    const newClient: Record<string, unknown> = {
      name: trimmedName,
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      clientCode: code,
      agentId: user.uid,
      createdAt: serverTimestamp(),
      preferredLanguage: formData.preferredLanguage,
    };
    if (formData.dateOfBirth) newClient.dateOfBirth = formData.dateOfBirth;
    const manualSince = formData.clientSinceDate.trim();
    let resolvedClientSince: string | null = null;
    if (manualSince && CLIENT_SINCE_ISO.test(manualSince)) {
      resolvedClientSince = manualSince;
    } else if (pendingClientApplicationData) {
      resolvedClientSince = resolveClientSinceFromExtraction(pendingClientApplicationData);
    }
    if (resolvedClientSince) newClient.clientSinceDate = resolvedClientSince;

    const docRef = await addDoc(collection(db, 'agents', user.uid, 'clients'), newClient);
    captureEvent(ANALYTICS_EVENTS.CLIENT_ADDED, { method: source });

    try {
      await Promise.all([
        setDoc(doc(db, 'clients', docRef.id), {
          name: trimmedName,
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          clientCode: code,
          agentId: user.uid,
          createdAt: serverTimestamp(),
          preferredLanguage: formData.preferredLanguage,
          ...(resolvedClientSince ? { clientSinceDate: resolvedClientSince } : {}),
        }),
        setDoc(doc(db, 'clientCodes', code), { agentId: user.uid, clientId: docRef.id }),
      ]);
    } catch (mirrorErr) {
      console.error('Top-level client mirror failed (non-blocking):', mirrorErr);
    }

    if (formData.phone.trim()) {
      try {
        const matchToken = await user.getIdToken();
        await fetch('/api/clients/match-referral', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${matchToken}` },
          body: JSON.stringify({ clientId: docRef.id, clientPhone: formData.phone.trim() }),
        });
      } catch (matchErr) {
        console.error('Referral match failed (non-blocking):', matchErr);
      }
    }

    if (hasAddFlowPolicyInput(addFlowPolicyForm)) {
      const policyData: Record<string, unknown> = {
        policyType: addFlowPolicyForm.policyType.trim(),
        insuranceCompany: addFlowPolicyForm.insuranceCompany === 'Other'
          ? addFlowPolicyForm.otherCarrier.trim()
          : addFlowPolicyForm.insuranceCompany.trim(),
        policyOwner: addFlowPolicyForm.policyOwner.trim() || trimmedName,
        beneficiaries: addFlowPolicyForm.beneficiaries
          .filter((b) => b.name.trim())
          .map((b) => ({
            name: b.name.trim(),
            type: b.type,
            relationship: b.relationship?.trim() || '',
            ...(typeof b.percentage === 'number' ? { percentage: b.percentage } : {}),
          })),
        coverageAmount: addFlowPolicyForm.coverageAmount ? parseFloat(addFlowPolicyForm.coverageAmount) : 0,
        premiumAmount: addFlowPolicyForm.premiumAmount ? parseFloat(addFlowPolicyForm.premiumAmount) : 0,
        premiumFrequency: addFlowPolicyForm.premiumFrequency || 'monthly',
        renewalDate: addFlowPolicyForm.renewalDate || '',
        effectiveDate: addFlowPolicyForm.effectiveDate || null,
        status: 'Active',
      };
      const token = await user.getIdToken();
      await apiCreatePolicy(token, docRef.id, policyData);
      refreshSummaries();
    }

    return {
      id: docRef.id,
      name: trimmedName,
      phone: formData.phone.trim(),
      code,
    };
  }, [user, formData, pendingClientApplicationData, hasAddFlowPolicyInput, addFlowPolicyForm, refreshSummaries]);

  const handleManualCreateAndContinue = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    try {
      const created = await createClientFromAddFlow('manual');
      const firstName = created.name.split(' ')[0] || created.name;
      setCreatedClientContext({ id: created.id, name: created.name, phone: created.phone });
      setWelcomeDraft(buildWelcomeSms(firstName, created.code, formData.preferredLanguage));
      setWelcomeError('');
      setAddFlowStage('welcome');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save client. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, createClientFromAddFlow, buildWelcomeSms, formData.preferredLanguage]);

  const handleReviewConfirmAndCreate = useCallback(async () => {
    if (submitting) return;
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    try {
      const created = await createClientFromAddFlow('pdf_parse');
      const firstName = created.name.split(' ')[0] || created.name;
      setCreatedClientContext({ id: created.id, name: created.name, phone: created.phone });
      setWelcomeDraft(buildWelcomeSms(firstName, created.code, formData.preferredLanguage));
      setWelcomeError('');
      setAddFlowStage('welcome');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save client. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, createClientFromAddFlow, buildWelcomeSms, formData.preferredLanguage]);

  const finishAddFlow = useCallback((message: string, celebrate: boolean) => {
    handleCloseAddFlow();
    setAddFlowToast({ message, celebrate });
  }, [handleCloseAddFlow]);

  const handleSkipWelcome = useCallback(() => {
    if (!createdClientContext) {
      handleCloseAddFlow();
      return;
    }
    finishAddFlow(`${createdClientContext.name} added — welcome message not sent`, false);
  }, [createdClientContext, finishAddFlow, handleCloseAddFlow]);

  const handleSendWelcome = useCallback(async () => {
    if (!user || !createdClientContext?.phone.trim()) {
      handleSkipWelcome();
      return;
    }
    if (welcomeSending) return;
    setWelcomeSending(true);
    setWelcomeError('');
    try {
      const token = await user.getIdToken();
      await fetch('/api/client/welcome-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clientPhone: createdClientContext.phone.trim(),
          message: welcomeDraft.trim(),
        }),
      });
      finishAddFlow(`${createdClientContext.name} added successfully!`, true);
    } catch (err) {
      setWelcomeError(err instanceof Error ? err.message : 'Failed to send welcome text.');
    } finally {
      setWelcomeSending(false);
    }
  }, [user, createdClientContext, welcomeDraft, welcomeSending, handleSkipWelcome, finishAddFlow]);

  const handleDeleteClient = useCallback(async () => {
    if (!user || !deleteConfirmClient) return;
    setDeletingClient(true);
    try {
      // Delete all policies under this client first (via Admin SDK)
      const token = await user.getIdToken();
      await apiDeletePolicy(token, deleteConfirmClient.id);
      await deleteDoc(doc(db, 'agents', user.uid, 'clients', deleteConfirmClient.id));
      captureEvent(ANALYTICS_EVENTS.CLIENT_REMOVED, {});
      // Also delete top-level client doc and client code index
      try {
        const deletes: Promise<void>[] = [deleteDoc(doc(db, 'clients', deleteConfirmClient.id))];
        if (deleteConfirmClient.clientCode) {
          deletes.push(deleteDoc(doc(db, 'clientCodes', deleteConfirmClient.clientCode)));
        }
        await Promise.all(deletes);
      } catch { /* may not exist */ }

      if (selectedClient?.id === deleteConfirmClient.id) {
        setSelectedClient(null);
      }
      setDeleteConfirmClient(null);
    } catch (err) {
      console.error('Error deleting client:', err);
      captureEvent(ANALYTICS_EVENTS.ACTION_FAILED, {
        action: 'delete_client',
        surface: 'clients',
        reason: 'delete_failed',
      });
    } finally {
      setDeletingClient(false);
    }
  }, [user, deleteConfirmClient, selectedClient]);

  // ─── Client Selection ────────────────────────────────────

  const handleSelectClient = useCallback((client: Client) => {
    setSelectedClient(client);
  }, []);

  const handleCloseClientView = useCallback(() => {
    setSelectedClient(null);
    setPolicies([]);
  }, []);

  // ─── Policy Handlers ─────────────────────────────────────

  const handleOpenPolicyModal = useCallback((options?: { openUploadPicker?: boolean }) => {
    setEditingPolicy(null);
    setPolicyFormData({ ...emptyPolicyForm });
    setPolicyFormError('');
    setPolicyFormSuccess('');
    setPolicyApplicationNote(null);
    setPolicyApplicationType(DEFAULT_APPLICATION_TYPE);
    setPolicyApplicationUploading(false);
    setPolicyParseProgress(null);
    activePolicyJobIdRef.current = null;
    setAutoOpenPolicyUploadPicker(options?.openUploadPicker === true);
    setIsPolicyModalOpen(true);
  }, []);

  const handleClosePolicyModal = useCallback(() => {
    policyApplicationAbortRef.current?.abort();
    policyApplicationAbortRef.current = null;
    activePolicyJobIdRef.current = null;
    setIsPolicyModalOpen(false);
    setEditingPolicy(null);
    setPolicyFormData({ ...emptyPolicyForm });
    setPolicyFormError('');
    setPolicyFormSuccess('');
    setPolicyApplicationNote(null);
    setPolicyApplicationType(DEFAULT_APPLICATION_TYPE);
    setPolicyApplicationUploading(false);
    setPolicyParseProgress(null);
    setAutoOpenPolicyUploadPicker(false);
  }, []);

  const handleSubmitPolicy = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedClient) return;
    if (!policyFormData.policyType) {
      setPolicyFormError('Policy type is required.');
      return;
    }
    if (policyFormData.policyType === 'Mortgage Protection' && !policyFormData.amountOfProtection) {
      setPolicyFormError('Coverage duration is required for Mortgage Protection policies. Your client will see this in their app.');
      return;
    }
    setPolicyFormError('');
    setPolicyFormSuccess('');
    setPolicySubmitting(true);

    try {
      const carrier =
        policyFormData.insuranceCompany === 'Other'
          ? policyFormData.otherCarrier.trim()
          : policyFormData.insuranceCompany;

      const policyPayload: Record<string, unknown> = {
        policyType: policyFormData.policyType,
        insuranceCompany: carrier,
        policyOwner: policyFormData.policyOwner.trim(),
        beneficiaries: policyFormData.beneficiaries.filter((b) => b.name.trim()),
        coverageAmount: policyFormData.coverageAmount ? parseFloat(policyFormData.coverageAmount) : 0,
        premiumAmount: policyFormData.premiumAmount ? parseFloat(policyFormData.premiumAmount) : 0,
        premiumFrequency: policyFormData.premiumFrequency,
        renewalDate: policyFormData.renewalDate,
        effectiveDate: policyFormData.effectiveDate || null,
        status: policyFormData.status,
      };

      if (policyFormData.policyType === 'Mortgage Protection') {
        policyPayload.amountOfProtection = policyFormData.amountOfProtection
          ? parseFloat(policyFormData.amountOfProtection)
          : 0;
        policyPayload.protectionUnit = policyFormData.protectionUnit;
      }

      const token = await user.getIdToken();
      if (editingPolicy) {
        await apiUpdatePolicy(token, selectedClient.id, editingPolicy.id, policyPayload);
        setPolicyFormSuccess('Policy updated!');
      } else {
        await apiCreatePolicy(token, selectedClient.id, policyPayload);
        setPolicyFormSuccess('Policy added!');
      }
      refreshPolicies();
      refreshSummaries();
      setTimeout(() => handleClosePolicyModal(), 800);
    } catch (err) {
      console.error('Error saving policy:', err);
      setPolicyFormError('Failed to save policy. Please try again.');
    } finally {
      setPolicySubmitting(false);
    }
  }, [user, selectedClient, policyFormData, editingPolicy, handleClosePolicyModal, refreshPolicies]);

  const handleDeletePolicy = useCallback(async () => {
    if (!user || !selectedClient || !deleteConfirmPolicy) return;
    setDeleting(true);
    try {
      const token = await user.getIdToken();
      await apiDeletePolicy(token, selectedClient.id, deleteConfirmPolicy.id);
      setDeleteConfirmPolicy(null);
      refreshPolicies();
    } catch (err) {
      console.error('Error deleting policy:', err);
    } finally {
      setDeleting(false);
    }
  }, [user, selectedClient, deleteConfirmPolicy, refreshPolicies]);

  // ─── Application Upload Handlers ─────────────────────────

  const handleClientApplicationExtracted = useCallback((data: ExtractedApplicationData) => {
    setPendingClientApplicationData(data);
    const mappedPolicy = mapExtractedApplicationToPolicyFormData(data);
    const fromPdf = resolveClientSinceFromExtraction(data);
    setFormData((prev) => ({
      ...prev,
      name: data.insuredName || prev.name,
      email: data.insuredEmail || prev.email,
      phone: data.insuredPhone || prev.phone,
      dateOfBirth: data.insuredDateOfBirth || prev.dateOfBirth,
      clientSinceDate: fromPdf || prev.clientSinceDate,
    }));
    setAddFlowPolicyForm((prev) => ({
      ...prev,
      ...mappedPolicy,
      beneficiaries: mappedPolicy.beneficiaries || prev.beneficiaries,
    }));
    setManualEntryExpanded(false);
    setAddFlowStage('review');
  }, []);

  const parseApplicationFile = useCallback(async (
    file: File,
    onProgress?: (state: ParseProgressState) => void,
    options?: ParseApplicationOptions,
  ): Promise<ParseApplicationResult> => {
    const signal = options?.signal;
    const carrierFormType = options?.carrierFormType ?? DEFAULT_APPLICATION_TYPE;
    const applicationTypeLabel = APPLICATION_TYPE_OPTIONS.find((option) => option.value === carrierFormType)?.label || 'Selected carrier';
    let currentJobId: string | null = null;
    let token: string | null = null;
    let shortPdfWarning: string | undefined;
    let localInfoNote: string | undefined;
    const reportProgress = (progress: number, label: string) => {
      onProgress?.({
        fileName: file.name,
        progress: Math.max(0, Math.min(100, Math.round(progress))),
        label,
      });
    };
    const markJobFailed = async (error: { code: string; message: string; retryable: boolean; terminal: boolean }) => {
      if (!currentJobId || !token) return;
      try {
        await apiCancelIngestionV3Job(token, currentJobId, error);
      } catch {
        // Ignore cleanup failures and preserve original parse flow behavior.
      }
    };

    if (!user) {
      throw new Error('You must be signed in to parse application files.');
    }
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      throw new Error('Please upload a PDF file.');
    }
    if (file.size > MAX_APPLICATION_PDF_BYTES) {
      throw new Error('File is too large. Maximum size is 13MB.');
    }

    const runDirectParseFallback = async (): Promise<ParseApplicationResult> => {
      reportProgress(55, 'Retrying with direct parser...');
      const fallbackForm = new FormData();
      fallbackForm.append('file', file, file.name);
      const fallbackRes = await fetch('/api/parse-application', {
        method: 'POST',
        body: fallbackForm,
        signal,
      });
      const fallbackBody = (await fallbackRes.json()) as {
        success: boolean;
        data?: ExtractedApplicationData;
        note?: string;
        error?: string;
      };
      if (!fallbackRes.ok || !fallbackBody.success || !fallbackBody.data) {
        throw new Error(fallbackBody.error || `Direct parser failed (${fallbackRes.status}).`);
      }
      reportProgress(100, 'Extraction complete');
      const mergedNote = [fallbackBody.note, localInfoNote].filter(Boolean).join(' ').trim();
      return { data: fallbackBody.data, note: mergedNote || undefined, shortPdfWarning };
    };

    reportProgress(8, 'Preparing file...');
    token = await user.getIdToken();
    reportProgress(14, 'Rendering PDF pages...');
    try {
      const selectedPageNumbers = APPLICATION_PAGE_MAP[carrierFormType];
      let renderedPages: Array<{ pageNumber: number; blob: Blob }>;
      if (Array.isArray(selectedPageNumbers) && selectedPageNumbers.length) {
        const tolerantResult = await renderSelectedPdfPagesToJpegsTolerant(file, selectedPageNumbers);
        renderedPages = tolerantResult.rendered;
        if (tolerantResult.skipped.length) {
          const warningMessage = `We need ${tolerantResult.requested.length} specific pages for "${applicationTypeLabel}", but only ${tolerantResult.rendered.length} were found in this PDF. We'll extract what we can, and you can fill missing fields in review.`;
          const proceed = window.confirm(`${warningMessage}\n\nClick OK to Extract Anyway, or Cancel to change Application Type.`);
          captureEvent(ANALYTICS_EVENTS.INGESTION_V3_PAGE_MAP_CLAMPED, {
            carrier_form_type: carrierFormType,
            requested_count: tolerantResult.requested.length,
            rendered_count: tolerantResult.rendered.length,
            skipped_pages: tolerantResult.skipped.join(','),
            user_proceeded: proceed,
          });
          if (!proceed) {
            throw new Error('Upload cancelled. You can change Application Type and retry.');
          }
          shortPdfWarning = warningMessage;
        }
      } else {
        renderedPages = await renderFirstPdfPagesToJpegs(file, MAX_APPLICATION_RENDER_PAGES);
        localInfoNote = `Using the first ${renderedPages.length} page(s) because carrier/form type is set to Other Carrier.`;
      }
      if (!renderedPages.length) {
        throw new Error('No pages could be rendered from this PDF.');
      }

      const baseFileName = file.name.replace(/\.pdf$/i, '') || 'application';
      const gcsImagePaths: string[] = [];
      for (let index = 0; index < renderedPages.length; index += 1) {
        if (signal?.aborted) {
          throw new Error('Cancelled by agent.');
        }

        const page = renderedPages[index];
        const uploadProgress = 20 + Math.round(((index + 1) / renderedPages.length) * 30);
        reportProgress(uploadProgress, `Uploading rendered page ${page.pageNumber}/${renderedPages.length}...`);

        const signedRes = await fetch('/api/ingestion/v3/upload-url', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileName: `${baseFileName}-page-${page.pageNumber}.jpg`,
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
          throw new Error(signedBody.error?.message || `Failed to start file upload (${signedRes.status}).`);
        }

        await withTimeout(
          fetch(signedBody.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: page.blob,
            signal,
          }).then((res) => {
            if (!res.ok) {
              throw new Error(`Upload failed (${res.status}).`);
            }
          }),
          BULK_GCS_UPLOAD_TIMEOUT_MS,
          'Upload timed out while sending rendered pages.',
        );

        gcsImagePaths.push(signedBody.gcsPath);
      }

      reportProgress(52, 'Queueing parser...');
      const createRes = await fetch('/api/ingestion/v3/jobs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'application',
          gcsImagePaths,
          fileName: file.name,
          contentType: 'image/jpeg',
          idempotencyKey: `application-v3:${file.name}:${file.size}:${file.lastModified}:pages-${gcsImagePaths.length}`,
          carrierFormType,
        }),
        signal,
      });
      const created = (await createRes.json()) as IngestionV3SubmitJobResponse;
      if (!createRes.ok || !created.success || !created.jobId) {
        throw new Error(created.error?.message || `Failed to start parsing job (${createRes.status}).`);
      }
      currentJobId = created.jobId;
      options?.onJobId?.(created.jobId);

      const startedAt = Date.now();
      reportProgress(62, 'Extracting data...');
      while (Date.now() - startedAt < IMPORT_PARSE_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
        const elapsedMs = Date.now() - startedAt;
        reportProgress(62 + Math.min(30, (elapsedMs / IMPORT_PARSE_TIMEOUT_MS) * 30), 'Extracting data...');

        const statusRes = await fetch(`/api/ingestion/v3/jobs/${encodeURIComponent(created.jobId)}`, {
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          signal,
        });
        const contentType = statusRes.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Unexpected response while checking parse status. Please try again.');
        }

        const statusBody = (await statusRes.json()) as IngestionV3JobStatusResponse;
        if (!statusRes.ok || !statusBody.success || !statusBody.job) {
          throw new Error(statusBody.error?.message || `Failed to check parsing status (${statusRes.status}).`);
        }

        if (statusBody.job.status === 'review_ready' || statusBody.job.status === 'saved') {
          const data = statusBody.job.result?.application?.data;
          if (!data) {
            throw new Error('Could not extract application data from this file. Please try another PDF.');
          }
          reportProgress(100, 'Extraction complete');
          const mergedNote = [statusBody.job.result?.application?.note, localInfoNote].filter(Boolean).join(' ').trim();
          return { data, note: mergedNote || undefined, shortPdfWarning };
        }

        if (statusBody.job.status === 'failed') {
          const code = statusBody.job.error?.code || '';
          if (code === 'DOCUMENT_NOT_APPLICATION') {
            throw new Error('This file was not recognized as an insurance application. Please upload an application PDF.');
          }
          if (code === 'INTERNAL_ERROR' || code === 'CLAUDE_SCHEMA_INVALID') {
            return runDirectParseFallback();
          }
          const codeSuffix = code ? ` [${code}]` : '';
          throw new Error(`${statusBody.job.error?.message || 'Failed to parse file. Please try again.'}${codeSuffix}`);
        }
      }

      await markJobFailed({
        code: 'CLIENT_TIMEOUT',
        message: 'Processing timed out. Please retry.',
        retryable: false,
        terminal: true,
      });
      throw new Error('Parsing timed out. Please retry the file.');
    } catch (v3Error) {
      if (signal?.aborted) {
        await markJobFailed({
          code: 'USER_CANCELLED',
          message: 'Cancelled by agent.',
          retryable: false,
          terminal: true,
        });
        throw new Error('Cancelled by agent.');
      }
      const message = v3Error instanceof Error ? v3Error.message : String(v3Error);
      if (message.includes('None of the requested pages exist in the uploaded PDF.')) {
        throw new Error(
          'This PDF does not include the key pages for the selected application type. Try a different Application Type, or choose "Other Carrier" to extract from the first pages.',
        );
      }
      const shouldFallback =
        message.includes('Upload failed (403)') ||
        message.includes('Invalid JWT Signature') ||
        message.includes('SignatureDoesNotMatch');
      if (!shouldFallback) {
        throw v3Error;
      }
      return runDirectParseFallback();
    }
  }, [user]);

  const handleClientApplicationFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setClientApplicationUploading(true);
    setClientApplicationNote(null);
    setClientApplicationShortPdfWarning(null);
    setClientParseProgress({ fileName: file.name, progress: 5, label: 'Preparing file...' });
    setFormError('');
    setFormSuccess('');
    const controller = new AbortController();
    clientApplicationAbortRef.current = controller;
    activeClientJobIdRef.current = null;

    try {
      const parsed = await parseApplicationFile(file, setClientParseProgress, {
        carrierFormType: clientApplicationType,
        signal: controller.signal,
        onJobId: (jobId) => {
          activeClientJobIdRef.current = jobId;
        },
      });
      handleClientApplicationExtracted(parsed.data);
      setClientApplicationNote(parsed.note || null);
      setClientApplicationShortPdfWarning(parsed.shortPdfWarning || null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to parse application PDF.');
    } finally {
      clientApplicationAbortRef.current = null;
      activeClientJobIdRef.current = null;
      setClientApplicationUploading(false);
      setClientParseProgress(null);
    }
  }, [clientApplicationType, handleClientApplicationExtracted, parseApplicationFile]);

  const handleClickClientApplicationUpload = useCallback(() => {
    if (clientApplicationUploading) return;
    clientApplicationFileInputRef.current?.click();
  }, [clientApplicationUploading]);

  const handleCancelClientApplicationUpload = useCallback(async () => {
    if (!user) return;
    const jobId = activeClientJobIdRef.current;
    const controller = clientApplicationAbortRef.current;
    controller?.abort();
    if (jobId) {
      try {
        const token = await user.getIdToken();
        await apiCancelIngestionV3Job(token, jobId, {
          code: 'USER_CANCELLED',
          message: 'Cancelled by agent.',
          retryable: false,
          terminal: true,
        });
      } catch {}
    }
    activeClientJobIdRef.current = null;
    clientApplicationAbortRef.current = null;
    setClientApplicationUploading(false);
    setClientParseProgress(null);
    setFormError('Cancelled by agent.');
  }, [user]);

  const handlePolicyApplicationFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setPolicyApplicationUploading(true);
    setPolicyApplicationNote(null);
    setPolicyParseProgress({ fileName: file.name, progress: 5, label: 'Preparing file...' });
    setPolicyFormError('');
    setPolicyFormSuccess('');
    const controller = new AbortController();
    policyApplicationAbortRef.current = controller;
    activePolicyJobIdRef.current = null;

    try {
      const parsed = await parseApplicationFile(file, setPolicyParseProgress, {
        carrierFormType: policyApplicationType,
        signal: controller.signal,
        onJobId: (jobId) => {
          activePolicyJobIdRef.current = jobId;
        },
      });
      const mapped = mapExtractedApplicationToPolicyFormData(parsed.data);
      setPolicyFormData((prev) => ({ ...prev, ...mapped }));
      setPolicyApplicationNote(parsed.note || null);
    } catch (err) {
      setPolicyFormError(err instanceof Error ? err.message : 'Failed to parse application PDF.');
    } finally {
      policyApplicationAbortRef.current = null;
      activePolicyJobIdRef.current = null;
      setPolicyApplicationUploading(false);
      setPolicyParseProgress(null);
    }
  }, [parseApplicationFile, policyApplicationType]);

  const handleClickPolicyApplicationUpload = useCallback(() => {
    if (policyApplicationUploading) return;
    policyApplicationFileInputRef.current?.click();
  }, [policyApplicationUploading]);

  const handleCancelPolicyApplicationUpload = useCallback(async () => {
    if (!user) return;
    const jobId = activePolicyJobIdRef.current;
    const controller = policyApplicationAbortRef.current;
    controller?.abort();
    if (jobId) {
      try {
        const token = await user.getIdToken();
        await apiCancelIngestionV3Job(token, jobId, {
          code: 'USER_CANCELLED',
          message: 'Cancelled by agent.',
          retryable: false,
          terminal: true,
        });
      } catch {}
    }
    activePolicyJobIdRef.current = null;
    policyApplicationAbortRef.current = null;
    setPolicyApplicationUploading(false);
    setPolicyParseProgress(null);
    setPolicyFormError('Cancelled by agent.');
  }, [user]);

  useEffect(() => {
    if (!isPolicyModalOpen || !autoOpenPolicyUploadPicker || editingPolicy) return;
    policyApplicationFileInputRef.current?.click();
    setAutoOpenPolicyUploadPicker(false);
  }, [isPolicyModalOpen, autoOpenPolicyUploadPicker, editingPolicy]);

  // ─── BOB Import Handlers ─────────────────────────────────

  const [parsingBob, setParsingBob] = useState(false);
  const [driveImportInFlight, setDriveImportInFlight] = useState(false);
  const bulkPdfConcurrencyLimit = getBulkPdfConcurrencyLimit();

  const loadGoogleDriveStatus = useCallback(async () => {
    if (!user) return;
    setGoogleDriveLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/integrations/google/status', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const body = (await res.json()) as GoogleDriveStatusResponse;
      if (!res.ok || !body.success) {
        throw new Error(body.error || 'Failed to load Google Drive status.');
      }
      setGoogleDriveConnected(body.connected);
      setGoogleDriveEmail(body.connected ? body.data?.googleEmail || null : null);
    } catch (err) {
      setGoogleDriveConnected(false);
      setGoogleDriveEmail(null);
      showImportNotice('drive_connect_failed', {
        items: [err instanceof Error ? err.message : 'Failed to load Google Drive status.'],
      });
    } finally {
      setGoogleDriveLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isImportModalOpen || !user) return;
    void loadGoogleDriveStatus();
  }, [isImportModalOpen, loadGoogleDriveStatus, user]);

  const handleConnectGoogleDrive = useCallback(async () => {
    if (!user) return;
    setGoogleDriveActionLoading(true);
    clearImportNotice();
    clearGooglePickerError();
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/integrations/google/auth', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          returnTo: '/dashboard/clients?bulkImport=1',
        }),
      });
      const body = (await res.json()) as { success: boolean; authUrl?: string; error?: string };
      if (!res.ok || !body.success || !body.authUrl) {
        throw new Error(body.error || 'Failed to connect Google Drive.');
      }
      window.location.href = body.authUrl;
    } catch (err) {
      showImportNotice('drive_connect_failed', {
        items: [err instanceof Error ? err.message : 'Failed to connect Google Drive.'],
      });
      setGoogleDriveActionLoading(false);
    }
  }, [clearGooglePickerError, clearImportNotice, showImportNotice, user]);

  useEffect(() => {
    const shouldOpenBulkImport = searchParams.get('bulkImport') === '1';
    if (!shouldOpenBulkImport) return;

    const driveStatus = searchParams.get('google_drive');
    const reason = searchParams.get('reason');

    setIsImportModalOpen(true);
    if (driveStatus === 'success') {
      showImportNotice('drive_connected');
      void loadGoogleDriveStatus();
    } else if (driveStatus === 'error') {
      const detail = reason ? `Google Drive connection failed: ${reason}` : 'Google Drive connection failed.';
      showImportNotice('drive_connect_failed', { items: [detail] });
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('bulkImport');
    params.delete('google_drive');
    params.delete('reason');
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname);
  }, [loadGoogleDriveStatus, pathname, router, searchParams, showImportNotice]);

  const parseCsvLine = useCallback((line: string, delimiter: string = ','): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }, []);

  const parseSingleCsv = useCallback((text: string, fileName: string): { rows: ImportRow[]; error?: string } => {
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) {
      return { rows: [], error: `${fileName}: must have a header row and at least one data row.` };
    }

    const tabCols = lines[0].split('\t').length;
    const commaCols = lines[0].split(',').length;
    const delimiter = tabCols > commaCols ? '\t' : ',';

    const headers = parseCsvLine(lines[0], delimiter).map((h) => h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim());

    const claimed = new Set<number>();
    const match = (aliases: string[]) => {
      const sorted = [...aliases].sort((a, b) => b.length - a.length);
      for (const a of sorted) {
        const idx = headers.findIndex((h, i) => !claimed.has(i) && h === a);
        if (idx !== -1) { claimed.add(idx); return idx; }
      }
      for (const a of sorted) {
        const idx = headers.findIndex((h, i) => !claimed.has(i) && h.includes(a));
        if (idx !== -1) { claimed.add(idx); return idx; }
      }
      return -1;
    };

    const nameIdx = match(['insured nme', 'insured name', 'full name', 'client name', 'name', 'applicant', 'policy holder', 'assured name', 'member name', 'insured']);
    const ownerIdx = match(['owner nme', 'owner name', 'policy owner', 'owner']);
    const emailIdx = match(['insured email address', 'email address', 'insured email', 'email', 'e-mail']);
    const phoneIdx = match(['insured party phone', 'insured phone', 'phone number', 'phone', 'mobile', 'cell', 'telephone']);
    const dobIdx = match(['insured dob', 'date of birth', 'birth date', 'birthdate', 'dob', 'birthday']);
    const carrierIdx = match(['carrier name', 'carrier', 'insurance company', 'company name', 'company', 'insurer', 'insurance carrier']);
    const policyTypeIdx = match(['product type nme', 'product desc', 'product type', 'policy type', 'product', 'plan type', 'line of business nme', 'line of business']);
    const effectiveDateIdx = match(['policy effective dte', 'policy issue dte', 'effective date', 'issue date', 'start date', 'policy date', 'effectivedate', 'inception date']);
    const premiumIdx = match(['monthly premium', 'premium amount', 'premium', 'modal premium', 'payment']);
    const annualPremiumIdx = match(['annual premium']);
    const coverageIdx = match(['face amt', 'face amount', 'face value', 'coverage amount', 'death benefit', 'benefit amount', 'coverage', 'specified amount']);
    const statusIdx = match(['policy status nme', 'policy status', 'status']);
    const billModeIdx = match(['bill mode', 'billing mode', 'payment mode', 'payment frequency']);

    if (nameIdx === -1) {
      return { rows: [], error: `${fileName}: no "Name" column found. Accepted: Name, Full Name, Client Name, Insured Name, Insured NME.` };
    }

    const rows: ImportRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i], delimiter);
      const name = cols[nameIdx] || '';
      if (!name) continue;

      let premium = premiumIdx !== -1 ? (cols[premiumIdx] || '') : '';
      let premiumFrequency = billModeIdx !== -1 ? (cols[billModeIdx] || '').toLowerCase().trim() : '';

      if (!premium && annualPremiumIdx !== -1) {
        const annual = parseFloat((cols[annualPremiumIdx] || '0').replace(/[,$]/g, ''));
        if (!isNaN(annual) && annual > 0) {
          premium = (annual / 12).toFixed(2);
          premiumFrequency = premiumFrequency || 'monthly';
        }
      }

      let freq: string | undefined;
      if (premiumFrequency.includes('month') || premiumFrequency === 'mon') freq = 'monthly';
      else if (premiumFrequency.includes('quarter') || premiumFrequency === 'qtr') freq = 'quarterly';
      else if (premiumFrequency.includes('semi')) freq = 'semi-annual';
      else if (premiumFrequency.includes('annual') || premiumFrequency === 'ann') freq = 'annual';

      rows.push({
        name,
        owner: ownerIdx !== -1 ? (cols[ownerIdx] || '') : '',
        email: emailIdx !== -1 ? (cols[emailIdx] || '') : '',
        phone: phoneIdx !== -1 ? (cols[phoneIdx] || '') : '',
        dateOfBirth: dobIdx !== -1 ? (cols[dobIdx] || '') : '',
        policyNumber: '',
        carrier: carrierIdx !== -1 ? (cols[carrierIdx] || '') : '',
        policyType: policyTypeIdx !== -1 ? (cols[policyTypeIdx] || '') : '',
        effectiveDate: effectiveDateIdx !== -1 ? (cols[effectiveDateIdx] || '') : '',
        premium,
        coverageAmount: coverageIdx !== -1 ? (cols[coverageIdx] || '') : '',
        status: statusIdx !== -1 ? (cols[statusIdx] || '') : '',
        premiumFrequency: freq,
      });
    }
    return { rows };
  }, [parseCsvLine]);

  const mapBobRowsToImportRows = useCallback((rows: any[]): ImportRow[] => {
    return (rows || []).map((row) => ({
      name: [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || row.firstName || row.lastName || '',
      owner: '',
      email: row.email || '',
      phone: row.phone || '',
      dateOfBirth: row.dateOfBirth || '',
      policyNumber: '',
      carrier: row.carrier || '',
      policyType: row.policyType || '',
      effectiveDate: '',
      premium: row.premiumAmount != null ? String(row.premiumAmount) : '',
      coverageAmount: row.coverageAmount != null ? String(row.coverageAmount) : '',
      status: 'Active',
      premiumFrequency: undefined,
    }));
  }, []);

  const waitForBobIngestionRows = useCallback(async (
    jobId: string,
    firebaseIdToken: string,
  ): Promise<{ rows: ImportRow[]; note?: string }> => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < IMPORT_PARSE_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, JOB_POLL_INTERVAL_MS));
      const statusRes = await fetch(`/api/ingestion/v3/jobs/${encodeURIComponent(jobId)}`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${firebaseIdToken}`,
          Accept: 'application/json',
        },
      });
      const contentType = statusRes.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new BulkImportRetryableError('Unexpected response while checking parse status. Please retry.', {
          retryable: true,
          terminal: false,
        });
      }
      const statusBody = (await statusRes.json()) as IngestionV3JobStatusResponse;

      if (!statusRes.ok || !statusBody.success || !statusBody.job) {
        throw new BulkImportRetryableError(
          statusBody.error?.message || `Failed to check parse status (${statusRes.status}).`,
          {
            retryable: statusBody.error?.retryable === true,
            terminal: statusBody.error?.terminal === true,
          },
        );
      }

      if (statusBody.job.status === 'review_ready' || statusBody.job.status === 'saved') {
        const v3Rows = statusBody.job.result?.bob?.rows || [];
        return {
          rows: mapBobRowsToImportRows(v3Rows as any[]),
          note: statusBody.job.result?.bob?.note,
        };
      }

      if (statusBody.job.status === 'failed') {
        throw new BulkImportRetryableError(
          statusBody.job.error?.message || 'Failed to parse file. Please try again.',
          {
            retryable: statusBody.job.error?.retryable === true,
            terminal: statusBody.job.error?.terminal === true,
          },
        );
      }
    }

    throw new BulkImportRetryableError('Parsing timed out. Please retry this file.', {
      retryable: true,
      terminal: false,
    });
  }, [mapBobRowsToImportRows]);

  const parseBobSourceFile = useCallback(async (file: File, attempt = 0): Promise<ParseBobSourceResult> => {
    if (!user) {
      throw new Error('You must be signed in to import files.');
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    let uploadFile = file;
    let routeMeta: ParseBobSourceResult['routing'];
    if (isPdf) {
      const route = detectBulkPdfRoute(file.name);
      const useBroaderMappedSubset = route.confidence === 'high' && attempt > 0;
      const targetPages = useBroaderMappedSubset ? route.broaderMappedPages : route.selectedPages;
      const routedBuffer = await buildRoutedPdfBuffer(new Uint8Array(await file.arrayBuffer()), targetPages);
      if (routedBuffer.subsetSkippedReason === null) {
        const routedArrayBuffer = routedBuffer.pdfBytes.buffer.slice(
          routedBuffer.pdfBytes.byteOffset,
          routedBuffer.pdfBytes.byteOffset + routedBuffer.pdfBytes.byteLength,
        ) as ArrayBuffer;
        uploadFile = new File([routedArrayBuffer], file.name, {
          type: 'application/pdf',
          lastModified: file.lastModified,
        });
      }
      routeMeta = {
        carrierFormType: route.carrierFormType,
        confidence: route.confidence,
        pagesSent: routedBuffer.pageCount,
        usedBroaderMappedSubset: useBroaderMappedSubset,
        canRetryBroaderMappedSubset: route.confidence === 'high' && route.broaderMappedPages.length > 0,
        subsetSkippedReason: routedBuffer.subsetSkippedReason || undefined,
      };
      captureEvent(ANALYTICS_EVENTS.INGESTION_V3_PAGE_MAP_CLAMPED, {
        carrier_form_type: route.carrierFormType,
        confidence: route.confidence,
        bulk_pdf_route: useBroaderMappedSubset ? 'broader_mapped_subset' : route.confidence === 'high' ? 'mapped' : 'unknown_capped',
        rendered_count: routedBuffer.pageCount,
        subset_skipped_reason: routedBuffer.subsetSkippedReason || undefined,
        source: 'local_bulk',
      });
      if (routedBuffer.subsetSkippedReason) {
        throw new BulkImportTerminalError('pdf_encrypted_unsupported', BULK_ENCRYPTED_PDF_UNSUPPORTED_MESSAGE);
      }
    }

    const token = await user.getIdToken();
    const signedRes = await fetch('/api/ingestion/v3/upload-url', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: uploadFile.name,
        contentType: uploadFile.type || 'application/octet-stream',
        fileSize: uploadFile.size,
        purpose: 'bob',
      }),
    });
    const signedBody = (await signedRes.json()) as {
      success: boolean;
      uploadUrl?: string;
      gcsPath?: string;
      error?: { message?: string };
    };
    if (!signedRes.ok || !signedBody.success || !signedBody.uploadUrl || !signedBody.gcsPath) {
      throw new Error(signedBody.error?.message || `Failed to start file upload (${signedRes.status}).`);
    }

    await withTimeout(
      fetch(signedBody.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': uploadFile.type || 'application/octet-stream' },
        body: uploadFile,
      }).then((res) => {
        if (!res.ok) {
          throw new Error(`Upload failed (${res.status}).`);
        }
      }),
      BULK_GCS_UPLOAD_TIMEOUT_MS,
      'Upload timed out while sending file.',
    );

    const createRes = await fetch('/api/ingestion/v3/jobs', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'bob',
        gcsPath: signedBody.gcsPath,
        fileName: uploadFile.name,
        contentType: uploadFile.type || undefined,
        idempotencyKey: `bob-v3:${file.name}:${file.size}:${file.lastModified}:attempt-${attempt}:pages-${routeMeta?.pagesSent || 0}`,
      }),
    });
    const created = (await createRes.json()) as IngestionV3SubmitJobResponse;
    if (!createRes.ok || !created.success || !created.jobId) {
      throw new Error(created.error?.message || `Failed to start parse job (${createRes.status}).`);
    }

    const parsed = await waitForBobIngestionRows(created.jobId, token);
    return {
      ...parsed,
      routing: routeMeta,
    };
  }, [user, waitForBobIngestionRows]);

  const getImportFileType = useCallback((file: File): ImportFileType => {
    const name = file.name.toLowerCase();
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'spreadsheet';
    if (name.endsWith('.csv') || name.endsWith('.tsv') || file.type.startsWith('text/')) return 'text';
    return 'unknown';
  }, []);

  const getBulkBatchMixValidationError = useCallback((fileTypes: ImportFileType[]): string | null => {
    if (fileTypes.length === 0) return null;
    const hasPdf = fileTypes.includes('pdf');
    const hasStructured = fileTypes.some((fileType) => fileType !== 'pdf');
    if (hasPdf && hasStructured) {
      return BULK_IMPORT_SPLIT_TYPE_MESSAGE;
    }
    return null;
  }, []);

  const getImportFileTypeFromGoogleMime = useCallback((mimeType: string): ImportFileType | null => {
    const normalized = (mimeType || '').toLowerCase().trim();
    if (!normalized || normalized === 'application/vnd.google-apps.folder') return null;
    if (normalized === 'application/pdf') return 'pdf';
    if (
      normalized === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      normalized === 'application/vnd.ms-excel' ||
      normalized === 'application/vnd.google-apps.spreadsheet'
    ) {
      return 'spreadsheet';
    }
    if (normalized === 'text/csv' || normalized === 'text/tab-separated-values' || normalized.startsWith('text/')) {
      return 'text';
    }
    return 'unknown';
  }, []);

  const updateImportFileStatus = useCallback((sourceFileId: string, patch: Partial<ImportFileStatus>) => {
    setImportFileStatuses((prev) =>
      prev.map((status) => (status.sourceFileId === sourceFileId ? { ...status, ...patch } : status)),
    );
  }, []);

  const addImportFileNote = useCallback((sourceFileId: string, note: string) => {
    const cleaned = note.trim();
    if (!cleaned) return;
    setImportFileStatuses((prev) =>
      prev.map((status) => {
        if (status.sourceFileId !== sourceFileId) return status;
        const existing = status.notes || [];
        if (existing.includes(cleaned)) return status;
        return { ...status, notes: [...existing, cleaned] };
      }),
    );
  }, []);

  const processImportSources = useCallback(async (sources: ImportSourceFile[]) => {
    if (!user || sources.length === 0) return;
    if (sources.length > MAX_FILES_PER_IMPORT) {
      showImportNotice('file_limit');
      setImportSuccess('');
      return;
    }

    const startedAt = Date.now();
    setParsingBob(true);
    clearImportNotice();
    showImportNotice('processing_started');
    setImportSuccess('');
    setImportData([]);
    setImportProgress(0);
    setImportSessionStartedAt(startedAt);
    setImportFileStatuses(
      sources.map((source) => ({
        sourceFileId: source.sourceFileId,
        name: source.file.name,
        fileType: source.fileType,
        state: 'queued',
        loadedRows: 0,
        rejectedRows: 0,
        notes: [],
      })),
    );

    const fileTypeCounts = {
      pdf: sources.filter((s) => s.fileType === 'pdf').length,
      spreadsheet: sources.filter((s) => s.fileType === 'spreadsheet').length,
      text: sources.filter((s) => s.fileType === 'text').length,
      unknown: sources.filter((s) => s.fileType === 'unknown').length,
    };

    captureEvent(ANALYTICS_EVENTS.BULK_IMPORT_SESSION_STARTED, {
      source: 'local_bulk',
      total_files: sources.length,
      pdf_files: fileTypeCounts.pdf,
      spreadsheet_files: fileTypeCounts.spreadsheet,
      text_files: fileTypeCounts.text + fileTypeCounts.unknown,
    });

    let completed = 0;
    let parsedFiles = 0;
    let failedFiles = 0;
    let loadedRows = 0;
    const warnings: string[] = [];
    const warningFiles = new Set<string>();

    const bumpProgress = () => {
      completed += 1;
      setImportProgress(Math.round((completed / sources.length) * 100));
    };

    const processSingleSource = async (source: ImportSourceFile) => {
      updateImportFileStatus(source.sourceFileId, { state: 'parsing', error: undefined });
      let retryAttemptCount = 0;
      try {
        let parsedRows: ImportRow[] = [];
        let parseRouting: ParseBobSourceResult['routing'];

        if (source.fileType === 'pdf' || source.fileType === 'spreadsheet' || source.fileType === 'text') {
          let attempt = 0;
          while (true) {
            try {
              const result = await parseBobSourceFile(source.file, attempt);
              parsedRows = result.rows;
              parseRouting = result.routing;
              const quality = filterHighQualityImportRows(parsedRows);
              const qualityTooLow = quality.accepted.length === 0 || quality.qualityRatio < MIN_IMPORT_ROW_QUALITY_RATIO;
              if (
                qualityTooLow &&
                source.fileType === 'pdf' &&
                parseRouting?.canRetryBroaderMappedSubset &&
                !parseRouting.usedBroaderMappedSubset &&
                !parseRouting.subsetSkippedReason &&
                attempt < BULK_PARSE_MAX_RETRIES
              ) {
                attempt += 1;
                continue;
              }
              retryAttemptCount = attempt;
              break;
            } catch (error) {
              if (!isRetryableBulkImportError(error) || attempt >= BULK_PARSE_MAX_RETRIES) {
                retryAttemptCount = attempt;
                throw error;
              }
              attempt += 1;
            }
          }
        } else {
          const parsed = parseSingleCsv(await source.file.text(), source.file.name);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          parsedRows = parsed.rows;
        }

        if (parsedRows.length === 0) {
          throw new Error('No valid rows found.');
        }

        const quality = filterHighQualityImportRows(parsedRows);
        if (quality.accepted.length === 0 || quality.qualityRatio < MIN_IMPORT_ROW_QUALITY_RATIO) {
          throw new Error(
            `Parsing quality too low (${Math.round(quality.qualityRatio * 100)}% usable rows). Please review this source file.`,
          );
        }

        if (quality.rejected > 0) {
          const note = `${quality.rejected} row${quality.rejected !== 1 ? 's were' : ' was'} skipped due to low-confidence policy data.`;
          warnings.push(note);
          warningFiles.add(source.sourceFileId);
          addImportFileNote(source.sourceFileId, note);
        }
        if (parseRouting?.subsetSkippedReason) {
          const note = `PDF preprocessing fallback (${parseRouting.subsetSkippedReason}).`;
          warnings.push(note);
          warningFiles.add(source.sourceFileId);
          addImportFileNote(source.sourceFileId, note);
        }
        setImportData((prev) => [...prev, ...quality.accepted]);
        loadedRows += quality.accepted.length;
        parsedFiles += 1;
        updateImportFileStatus(source.sourceFileId, {
          state: 'succeeded',
          loadedRows: quality.accepted.length,
          rejectedRows: quality.rejected,
        });
        captureEvent(ANALYTICS_EVENTS.BULK_IMPORT_FILE_PARSED, {
          source: 'local_bulk',
          file_type: source.fileType,
          file_size_bytes: source.file.size,
          success: true,
          retry_attempt_count: retryAttemptCount,
          rows_loaded: quality.accepted.length,
          rejected_rows: quality.rejected,
        });
      } catch (err) {
        failedFiles += 1;
        let message = 'Failed to parse file. Please try again.';
        if (isTimeoutError(err)) {
          message = 'Request timed out while parsing this file. Please retry.';
        } else if (err instanceof BulkImportTerminalError && err.reason === 'pdf_encrypted_unsupported') {
          message = BULK_ENCRYPTED_PDF_UNSUPPORTED_MESSAGE;
        } else if (err instanceof Error) {
          if (err.message.includes('client token') || err.message.includes('Vercel Blob')) {
            message = 'Upload service temporarily unavailable. Please try again.';
          } else {
            message = err.message;
          }
        }
        updateImportFileStatus(source.sourceFileId, { state: 'failed', error: message });
        captureEvent(ANALYTICS_EVENTS.BULK_IMPORT_FILE_PARSED, {
          source: 'local_bulk',
          file_type: source.fileType,
          file_size_bytes: source.file.size,
          success: false,
          retry_attempt_count: retryAttemptCount,
          error: message,
          reason: err instanceof BulkImportTerminalError ? err.reason : undefined,
        });
      } finally {
        bumpProgress();
      }
    };

    const nonPdfSources = sources.filter((source) => source.fileType !== 'pdf');
    for (const source of nonPdfSources) {
      await processSingleSource(source);
    }

    const pdfSources = sources.filter((source) => source.fileType === 'pdf');
    if (pdfSources.length > 0) {
      let nextIndex = 0;
      const workers = Array.from(
        { length: Math.min(bulkPdfConcurrencyLimit, pdfSources.length) },
        async () => {
          while (nextIndex < pdfSources.length) {
            const current = pdfSources[nextIndex];
            nextIndex += 1;
            await processSingleSource(current);
          }
        },
      );
      await Promise.all(workers);
    }

    if (parsedFiles === 0) {
      showImportNotice('import_failed', {
        items: ['No valid rows found. Please review your files and try again.'],
      });
    } else if (failedFiles > 0) {
      showImportNotice('files_need_review', {
        items: [
          `${parsedFiles} of ${sources.length} file${sources.length !== 1 ? 's parsed' : ' parsed'} successfully.`,
          'Review failed files in the file status list above, then retry those files.',
        ],
      });
    } else if (warnings.length > 0) {
      showImportNotice('files_need_review', {
        items: [
          `${warningFiles.size} file${warningFiles.size !== 1 ? 's' : ''} have parser notes.`,
          'Review file status above and record notes below before importing.',
        ],
      });
    } else {
      showImportNotice('ready_to_import');
    }

    captureEvent(ANALYTICS_EVENTS.BULK_IMPORT_SESSION_COMPLETED, {
      source: 'local_bulk',
      total_files: sources.length,
      parsed_files: parsedFiles,
      failed_files: failedFiles,
      loaded_rows: loadedRows,
      elapsed_ms: Date.now() - startedAt,
    });

    setParsingBob(false);
  }, [addImportFileNote, bulkPdfConcurrencyLimit, clearImportNotice, parseBobSourceFile, parseSingleCsv, showImportNotice, updateImportFileStatus, user]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const sources: ImportSourceFile[] = Array.from(files).map((file, idx) => ({
      sourceType: 'local',
      sourceFileId: `local:${file.name}:${file.size}:${file.lastModified}:${idx}`,
      file,
      fileType: getImportFileType(file),
    }));
    const mixValidationError = getBulkBatchMixValidationError(sources.map((source) => source.fileType));
    if (mixValidationError) {
      showImportNotice('mixed_batch_blocked', {
        items: [mixValidationError],
      });
      setImportSuccess('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    await processImportSources(sources);

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [getBulkBatchMixValidationError, getImportFileType, processImportSources]);

  const handleImportDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setImportDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length === 0) return;

    const sources: ImportSourceFile[] = droppedFiles.map((file, idx) => ({
      sourceType: 'local',
      sourceFileId: `local:${file.name}:${file.size}:${file.lastModified}:${idx}`,
      file,
      fileType: getImportFileType(file),
    }));
    const mixValidationError = getBulkBatchMixValidationError(sources.map((source) => source.fileType));
    if (mixValidationError) {
      showImportNotice('mixed_batch_blocked', {
        items: [mixValidationError],
      });
      setImportSuccess('');
      return;
    }
    await processImportSources(sources);
  }, [getBulkBatchMixValidationError, getImportFileType, processImportSources, showImportNotice]);

  const handleImportFromGoogleDrive = useCallback(async () => {
    if (!user) return;
    clearImportNotice();
    setImportSuccess('');
    setBatchStatusNotice(null);
    clearGooglePickerError();

    try {
      const token = await user.getIdToken();
      showImportNotice('processing_started', {
        title: 'Opening Google Drive',
        items: ['Select one or more files to continue.'],
      });
      const selectedFiles = await pickGoogleDriveFiles(token);
      if (selectedFiles.length === 0) return;
      if (selectedFiles.length > MAX_FILES_PER_IMPORT) {
        showImportNotice('file_limit', {
          items: [
            `You selected ${selectedFiles.length} files. You can import up to ${MAX_FILES_PER_IMPORT} files at a time.`,
            `For fastest results, upload ${RECOMMENDED_FILES_PER_IMPORT} files per run.`,
          ],
        });
        return;
      }
      showImportNotice('files_added');
      const selectedFileTypes = selectedFiles
        .map((file) => getImportFileTypeFromGoogleMime(file.mimeType))
        .filter((value): value is ImportFileType => value !== null);
      const mixValidationError = getBulkBatchMixValidationError(selectedFileTypes);
      if (mixValidationError) {
        showImportNotice('mixed_batch_blocked', {
          items: [mixValidationError],
        });
        return;
      }

      setDriveImportInFlight(true);
      setParsingBob(true); // Show spinner while POST is in flight

      const importRes = await fetch('/api/integrations/google/import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ purpose: 'bob', files: selectedFiles }),
      });
      const importBody = (await importRes.json()) as GoogleDriveImportRouteResponse;
      if (!importRes.ok || !importBody.success || !importBody.batchId) {
        throw new Error(importBody.error || 'Failed to import files from Google Drive.');
      }

      // Start background listener — the component-level useEffect picks this up
      setActiveBatchId(importBody.batchId);

      // Show confirmation — agent can close the modal whenever they want
      const fileCount = importBody.resolvedFiles?.length || selectedFiles.length;
      setImportSuccess(
        `${fileCount} file${fileCount !== 1 ? 's' : ''} received. We'll process them in the background \u2014 this usually takes about 1 minute per file. You can close this and keep working. We'll notify you when your import is ready for review.`,
      );

      captureEvent(ANALYTICS_EVENTS.BULK_IMPORT_SESSION_STARTED, {
        source: 'drive',
        total_files: fileCount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import from Google Drive.';
      const lower = message.toLowerCase();
      if (
        lower.includes('invalid_grant') ||
        lower.includes('reconnect') ||
        lower.includes('revoked') ||
        lower.includes('expired')
      ) {
        showImportNotice('drive_session_expired');
      } else {
        showImportNotice('upload_failed', { items: [message] });
      }
      if (
        lower.includes('invalid_grant') ||
        lower.includes('reconnect') ||
        lower.includes('revoked') ||
        lower.includes('expired')
      ) {
        setGoogleDriveConnected(false);
        setGoogleDriveEmail(null);
        void loadGoogleDriveStatus();
      }
    } finally {
      setParsingBob(false);
      setDriveImportInFlight(false);
    }
  }, [clearGooglePickerError, clearImportNotice, getBulkBatchMixValidationError, getImportFileTypeFromGoogleMime, loadGoogleDriveStatus, pickGoogleDriveFiles, showImportNotice, user]);

  const handleDriveImportAction = useCallback(() => {
    if (googleDriveConnected) {
      void handleImportFromGoogleDrive();
      return;
    }
    void handleConnectGoogleDrive();
  }, [googleDriveConnected, handleConnectGoogleDrive, handleImportFromGoogleDrive]);

  const handleCancelActiveBatch = useCallback(async () => {
    if (!user || !activeBatchId || cancelingBatch) return;
    clearImportNotice();
    setCancelingBatch(true);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/integrations/google/import/cancel', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchId: activeBatchId }),
      });
      const body = (await res.json()) as CancelGoogleDriveImportResponse;
      if (!res.ok || !body.success) {
        throw new Error(body.error || 'Failed to cancel import.');
      }

      setActiveBatchId(null);
      if (body.cancelled) {
        const jobsCancelled = typeof body.jobsCancelled === 'number' ? body.jobsCancelled : 0;
        setBatchStatusNotice({
          type: 'info',
          message:
            jobsCancelled > 0
              ? `Import cancelled. Stopped ${jobsCancelled} queued file${jobsCancelled !== 1 ? 's' : ''}.`
              : 'Import cancelled.',
        });
      } else {
        setBatchStatusNotice({ type: 'info', message: 'Import is no longer running.' });
      }
    } catch (err) {
      showImportNotice('import_failed', {
        items: [err instanceof Error ? err.message : 'Failed to cancel import.'],
      });
    } finally {
      setCancelingBatch(false);
    }
  }, [user, activeBatchId, cancelingBatch, clearImportNotice, showImportNotice]);

  const handleReviewBatchResults = useCallback(async () => {
    if (!batchNotification || !user) return;

    setIsImportModalOpen(true);
    setImportSuccess('');
    setParsingBob(true);
    showImportNotice('processing_started', {
      title: 'Loading import results',
      items: [`Loading ${batchNotification.totalRows} row${batchNotification.totalRows !== 1 ? 's' : ''} from ${batchNotification.completedFiles} file${batchNotification.completedFiles !== 1 ? 's' : ''}...`],
    });
    setImportData([]);
    setImportFileStatuses([]);

    try {
      const token = await user.getIdToken();
      const allRows: ImportRow[] = [];
      const warnings: string[] = [];
      let fetchNextIndex = 0;
      const jobIds = batchNotification.succeededJobIds;

      const fetchWorkers = Array.from(
        { length: Math.min(BATCH_RESULT_FETCH_CONCURRENCY, jobIds.length) },
        async () => {
          while (fetchNextIndex < jobIds.length) {
            const jobId = jobIds[fetchNextIndex];
            fetchNextIndex += 1;
            try {
              const parsed = await waitForBobIngestionRows(jobId, token);
              if (parsed.rows.length > 0) {
                const quality = filterHighQualityImportRows(parsed.rows);
                if (quality.accepted.length > 0) allRows.push(...quality.accepted);
                if (quality.rejected > 0) warnings.push(`${quality.rejected} rows skipped.`);
                if (parsed.note) warnings.push(parsed.note);
              }
            } catch (err) {
              console.error(`[Drive import] Failed to fetch rows for job ${jobId}:`, err);
            }
          }
        },
      );
      await Promise.all(fetchWorkers);

      pendingImportReviewScrollRef.current = allRows.length > 0;
      setImportData(allRows);
      if (batchNotification.failedFileReasons.length > 0) {
        setImportFileStatuses(
          batchNotification.failedFileReasons.map((failed, idx) => ({
            sourceFileId: `batch-failed-${idx}`,
            name: failed.fileName,
            fileType: 'pdf',
            state: 'failed',
            loadedRows: 0,
            rejectedRows: 0,
            error: failed.reason,
            notes: [],
          })),
        );
      }
      if (warnings.length > 0) {
        showImportNotice('partial_parse', {
          items: [
            `${warnings.length} parser note${warnings.length !== 1 ? 's' : ''} found while loading results.`,
            'Review flagged records in the list below.',
          ],
        });
      } else if (batchNotification.failedFileReasons.length > 0) {
        showImportNotice('partial_parse', {
          items: [
            `${batchNotification.failedFileReasons.length} file${batchNotification.failedFileReasons.length !== 1 ? 's' : ''} failed during processing.`,
            ...batchNotification.failedFileReasons
              .slice(0, 3)
              .map((failed) => `${failed.fileName}: ${failed.reason}`),
          ],
        });
      } else {
        showImportNotice('ready_to_import');
      }
      setBatchNotification(null);

      if (allRows.length === 0) {
        showImportNotice('import_failed', {
          items: ['No valid rows found. Please review your files and try again.'],
        });
      }
    } catch (err) {
      showImportNotice('import_failed', {
        items: [err instanceof Error ? err.message : 'Failed to load import results.'],
      });
    } finally {
      setParsingBob(false);
    }
  }, [batchNotification, showImportNotice, user, waitForBobIngestionRows]);

  const handleImportClients = useCallback(async () => {
    if (!user || importData.length === 0) return;
    if (importData.length > MAX_IMPORT_ROWS) {
      showImportNotice('row_limit');
      return;
    }
    const preflight = filterHighQualityImportRows(importData);
    if (preflight.accepted.length !== importData.length) {
      showImportNotice('partial_parse', {
        items: ['Some rows no longer meet quality checks. Please re-upload and review before importing.'],
      });
      return;
    }
    setImporting(true);
    setImportProgress(0);
    clearImportNotice();
    setImportSuccess('');
    setJustImportedClients([]);
    setIntroSentCount(null);

    const allCreated: { clientId: string; phone: string; firstName: string; clientCode: string }[] = [];
    const chunks: ImportRow[][] = [];
    let serverPolicyCount = 0;
    for (let i = 0; i < importData.length; i += IMPORT_BATCH_SIZE) {
      chunks.push(importData.slice(i, i + IMPORT_BATCH_SIZE));
    }

    try {
      const token = await user.getIdToken();
      for (let c = 0; c < chunks.length; c++) {
        const res = await fetch('/api/clients/import-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ rows: chunks[c] }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Import failed (${res.status})`);
        }
        const data = await res.json();
        if (Array.isArray(data.created)) allCreated.push(...data.created);
        if (typeof data.totalPolicies === 'number') serverPolicyCount += data.totalPolicies;
        setImportProgress(Math.round(((c + 1) / chunks.length) * 100));
      }

      const clientCount = allCreated.length;
      const policyCount = serverPolicyCount;
      if (clientCount > 0) {
        captureEvent(ANALYTICS_EVENTS.CLIENT_ADDED, {
          method: 'book_of_business',
          imported_count: clientCount,
          import_source: 'local_bulk',
        });
        if (importSessionStartedAt) {
          captureEvent(ANALYTICS_EVENTS.BULK_IMPORT_ACTIVATED, {
            source: 'local_bulk',
            time_to_first_client_created_ms: Date.now() - importSessionStartedAt,
            imported_count: clientCount,
            policy_count: policyCount,
          });
        }
      }
      const parts = [`${clientCount} client${clientCount !== 1 ? 's' : ''}`];
      if (policyCount > 0) parts.push(`${policyCount} ${policyCount !== 1 ? 'policies' : 'policy'}`);
      setImportSuccess(`Successfully imported ${parts.join(' and ')}!`);
      setJustImportedClients(allCreated);
      setSelectedIntroClients(new Set(allCreated.filter((r) => r.phone.trim()).map((r) => r.clientId)));
      setShowIntroConfirm(false);
      setImportData([]);
      setImportFileStatuses([]);
      clearImportNotice();
      if (policyCount > 0) refreshSummaries();
    } catch (err) {
      console.error('Error importing clients:', err);
      showImportNotice('import_failed', {
        items: [err instanceof Error ? err.message : 'Failed to import some records. Please try again.'],
      });
    } finally {
      setImporting(false);
    }
  }, [user, importData, importSessionStartedAt, refreshSummaries, clearImportNotice, showImportNotice]);

  useEffect(() => {
    if (importSuccess && importModalScrollRef.current) {
      importModalScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [importSuccess]);

  useEffect(() => {
    if (!pendingImportReviewScrollRef.current) return;
    if (!isImportModalOpen || parsingBob || importData.length === 0) return;
    pendingImportReviewScrollRef.current = false;
    window.requestAnimationFrame(() => {
      importReviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [importData.length, isImportModalOpen, parsingBob]);

  const handleSendBulkIntro = useCallback(async () => {
    const selected = justImportedClients.filter((r) => r.phone.trim() && selectedIntroClients.has(r.clientId));
    if (!user || selected.length === 0) return;
    setSendingIntro(true);
    const messageToSend = introMessage.trim() || DEFAULT_INTRO_TEMPLATE;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/client/send-bulk-intro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messageTemplate: messageToSend,
          recipients: selected.map((r) => ({ phone: r.phone, firstName: r.firstName, code: r.clientCode })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Send failed (${res.status})`);
      }
      const data = await res.json();
      setIntroSentCount(data.sent ?? 0);
    } catch (err) {
      console.error('Send bulk intro error:', err);
      showImportNotice('import_failed', {
        items: [err instanceof Error ? err.message : 'Failed to send intro messages.'],
      });
    } finally {
      setSendingIntro(false);
    }
  }, [user, justImportedClients, introMessage, selectedIntroClients, showImportNotice]);

  // ─── Share Code Handler ──────────────────────────────────

  const handleShareCode = useCallback(async (client: Client) => {
    const firstName = client.name.split(' ')[0];
    const message = buildWelcomeMessage({
      firstName,
      agentName: (agentProfile.name || 'your agent').trim() || 'your agent',
      code: client.clientCode || '',
      appUrl: CLIENT_APP_URL,
      language: resolveClientLanguage(client.preferredLanguage),
    });
    try {
      await navigator.clipboard.writeText(message);
      captureEvent(ANALYTICS_EVENTS.REFERRAL_LINK_SHARED, { channel: 'client_code_copy' });
      setCopiedClientId(client.id);
      setTimeout(() => setCopiedClientId(null), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = message;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      captureEvent(ANALYTICS_EVENTS.REFERRAL_LINK_SHARED, { channel: 'client_code_copy' });
      setCopiedClientId(client.id);
      setTimeout(() => setCopiedClientId(null), 2000);
    }
  }, [agentProfile.name]);

  const renderAddFlowPolicyInputs = () => (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col">
          <label className="text-xs font-medium text-[#707070] mb-1">Client Since</label>
          <input
            type="date"
            value={formData.clientSinceDate}
            onChange={(e) => setFormData((f) => ({ ...f, clientSinceDate: e.target.value }))}
            className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm"
          />
        </div>
        <select
          value={addFlowPolicyForm.policyType}
          onChange={(e) => setAddFlowPolicyForm((f) => ({ ...f, policyType: e.target.value }))}
          className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm"
        >
          <option value="">Policy Type</option>
          {POLICY_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <select
          value={addFlowPolicyForm.insuranceCompany}
          onChange={(e) => setAddFlowPolicyForm((f) => ({ ...f, insuranceCompany: e.target.value }))}
          className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm"
        >
          <option value="">Insurance Company</option>
          {KNOWN_CARRIERS.map((carrier) => (
            <option key={carrier} value={carrier}>{carrier}</option>
          ))}
          <option value="Other">Other</option>
        </select>
        {addFlowPolicyForm.insuranceCompany === 'Other' && (
          <input
            type="text"
            value={addFlowPolicyForm.otherCarrier}
            onChange={(e) => setAddFlowPolicyForm((f) => ({ ...f, otherCarrier: e.target.value }))}
            placeholder="Carrier Name"
            className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm sm:col-span-2"
          />
        )}
        <input
          type="text"
          value={addFlowPolicyForm.policyOwner}
          onChange={(e) => setAddFlowPolicyForm((f) => ({ ...f, policyOwner: e.target.value }))}
          placeholder="Policy Owner"
          className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm"
        />
        <input
          type="number"
          value={addFlowPolicyForm.coverageAmount}
          onChange={(e) => setAddFlowPolicyForm((f) => ({ ...f, coverageAmount: e.target.value }))}
          placeholder="Coverage Amount"
          className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm"
        />
        <input
          type="number"
          value={addFlowPolicyForm.premiumAmount}
          onChange={(e) => setAddFlowPolicyForm((f) => ({ ...f, premiumAmount: e.target.value }))}
          placeholder="Premium Amount"
          className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm"
        />
        <select
          value={addFlowPolicyForm.premiumFrequency}
          onChange={(e) => setAddFlowPolicyForm((f) => ({ ...f, premiumFrequency: e.target.value }))}
          className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm"
        >
          <option value="monthly">Premium Frequency: Monthly</option>
          <option value="quarterly">Premium Frequency: Quarterly</option>
          <option value="semi-annual">Premium Frequency: Semi-Annual</option>
          <option value="annual">Premium Frequency: Annual</option>
        </select>
        <div className="flex flex-col">
          <label className="text-xs font-medium text-[#707070] mb-1">Effective Date</label>
          <input
            type="date"
            value={addFlowPolicyForm.effectiveDate}
            onChange={(e) => setAddFlowPolicyForm((f) => ({ ...f, effectiveDate: e.target.value }))}
            className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium text-[#707070] mb-1">Renewal Date</label>
          <input
            type="date"
            value={addFlowPolicyForm.renewalDate}
            onChange={(e) => setAddFlowPolicyForm((f) => ({ ...f, renewalDate: e.target.value }))}
            className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm"
          />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[#000000]">Beneficiaries</label>
          <button
            type="button"
            onClick={() => {
              setAddFlowPolicyForm((f) => ({
                ...f,
                beneficiaries: [...f.beneficiaries, { name: '', type: 'primary', relationship: '', percentage: undefined }],
              }));
            }}
            className="text-xs text-[#005851] font-semibold hover:underline"
          >
            + Add Beneficiary
          </button>
        </div>
        <div className="space-y-2">
          {addFlowPolicyForm.beneficiaries.map((beneficiary, index) => (
            <div key={index} className="rounded-[5px] border border-[#d0d0d0] bg-[#f8f8f8] p-3">
              <div className="grid gap-2 sm:grid-cols-4">
                <input
                  type="text"
                  value={beneficiary.name}
                  onChange={(e) => {
                    const next = [...addFlowPolicyForm.beneficiaries];
                    next[index] = { ...next[index], name: e.target.value };
                    setAddFlowPolicyForm((f) => ({ ...f, beneficiaries: next }));
                  }}
                  placeholder="Name"
                  className="px-2 py-1.5 border border-[#d0d0d0] rounded-[5px] text-xs sm:col-span-2"
                />
                <input
                  type="text"
                  value={beneficiary.relationship || ''}
                  onChange={(e) => {
                    const next = [...addFlowPolicyForm.beneficiaries];
                    next[index] = { ...next[index], relationship: e.target.value };
                    setAddFlowPolicyForm((f) => ({ ...f, beneficiaries: next }));
                  }}
                  placeholder="Relationship"
                  className="px-2 py-1.5 border border-[#d0d0d0] rounded-[5px] text-xs"
                />
                <input
                  type="number"
                  value={beneficiary.percentage ?? ''}
                  onChange={(e) => {
                    const next = [...addFlowPolicyForm.beneficiaries];
                    next[index] = {
                      ...next[index],
                      percentage: e.target.value ? Number(e.target.value) : undefined,
                    };
                    setAddFlowPolicyForm((f) => ({ ...f, beneficiaries: next }));
                  }}
                  placeholder="%"
                  className="px-2 py-1.5 border border-[#d0d0d0] rounded-[5px] text-xs"
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <select
                  value={beneficiary.type}
                  onChange={(e) => {
                    const next = [...addFlowPolicyForm.beneficiaries];
                    next[index] = { ...next[index], type: e.target.value as 'primary' | 'contingent' };
                    setAddFlowPolicyForm((f) => ({ ...f, beneficiaries: next }));
                  }}
                  className="px-2 py-1.5 border border-[#d0d0d0] rounded-[5px] text-xs"
                >
                  <option value="primary">Primary</option>
                  <option value="contingent">Contingent</option>
                </select>
                {addFlowPolicyForm.beneficiaries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = addFlowPolicyForm.beneficiaries.filter((_, i) => i !== index);
                      setAddFlowPolicyForm((f) => ({ ...f, beneficiaries: next }));
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── Loading State ───────────────────────────────────────

  if (loading) return null;
  const isAddFlowActive = addFlowStage !== 'list';
  const addFlowSlideIndex = 0;
  const incomingSurfaceMotionClass = 'absolute inset-x-0 top-0 z-20 transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]';
  const addFlowIncomingSurfaceMotionClass = 'absolute inset-x-0 top-[4rem] z-20 transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]';
  const incomingSurfaceShellClass = 'relative w-full max-w-4xl mx-auto bg-white rounded-[5px] border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] overflow-hidden';
  const addFlowSurfaceShellClass = 'relative w-full max-w-4xl mx-auto bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] overflow-hidden';
  const incomingSurfaceHeaderClass = 'sticky top-0 z-10 flex items-center justify-between p-6 border-b border-gray-200 bg-white';
  const addFlowBeltStepPercent = 72;
  const addFlowBeltStepRem = 14;
  const addFlowInterCardGapRem = 1.25;
  const getBeltTranslate = (steps: number, remPerStep: number) => {
    if (steps === 0) return 'translateX(0)';
    const absSteps = Math.abs(steps);
    const percent = absSteps * addFlowBeltStepPercent;
    const rem = absSteps * remPerStep;
    if (steps < 0) return `translateX(calc(-${percent}% - ${rem}rem))`;
    return `translateX(calc(${percent}% + ${rem}rem))`;
  };
  const addFlowStageIndex = (
    addFlowStage === 'upload' ? 0
      : addFlowStage === 'review' ? 1
        : addFlowStage === 'welcome' ? 2
          : -1
  );
  const addFlowBeltPosition = addFlowStageIndex + 1;
  const addFlowSurfaceMinHeight = (
    addFlowStage === 'review' ? 1050
      : addFlowStage === 'welcome' ? 760
        : addFlowStage === 'upload' ? 560
          : 0
  );
  const listSurfaceTransform = isImportModalOpen
    ? getBeltTranslate(-1, addFlowBeltStepRem + addFlowInterCardGapRem)
    : addFlowBeltPosition > 0
      ? getBeltTranslate(-addFlowBeltPosition, addFlowBeltStepRem + addFlowInterCardGapRem)
      : 'translateX(0)';
  const getAddFlowSurfaceStyle = (panelIndex: number): CSSProperties => {
    const delta = panelIndex - addFlowStageIndex;
    return {
      transform: getBeltTranslate(delta, addFlowBeltStepRem + addFlowInterCardGapRem),
      opacity: delta === 0 || delta === -1 ? 1 : 0,
      pointerEvents: delta === 0 ? 'auto' : 'none',
    };
  };
  const selectedImportRow = importData[selectedImportRowIndex] ?? null;
  const selectedImportRowNotes = selectedImportRow ? getImportRowReviewNotes(selectedImportRow) : [];
  const importFileStatusSummary = useMemo(() => {
    const succeeded = importFileStatuses.filter((s) => s.state === 'succeeded').length;
    const failed = importFileStatuses.filter((s) => s.state === 'failed').length;
    const parsing = importFileStatuses.filter((s) => s.state === 'parsing').length;
    const queued = importFileStatuses.filter((s) => s.state === 'queued').length;
    return { succeeded, failed, parsing, queued };
  }, [importFileStatuses]);
  const importNoticeStyleByType: Record<ImportNoticeType, { shell: string; icon: string; title: string }> = {
    info: {
      shell: 'bg-[#daf3f0]/45 border border-[#45bcaa]/40 text-[#0D4D4D]',
      icon: 'text-[#0D4D4D]',
      title: 'text-[#0D4D4D]',
    },
    warning: {
      shell: 'bg-amber-50 border border-amber-200 text-amber-800',
      icon: 'text-amber-700',
      title: 'text-amber-800',
    },
    error: {
      shell: 'bg-red-50 border border-red-200 text-red-700',
      icon: 'text-red-600',
      title: 'text-red-700',
    },
  };
  const importNoticeStyle = importNotice ? importNoticeStyleByType[importNotice.type] : null;
  const displayedImportNoticeItems = useMemo(
    () => (importNotice ? formatImportNoticeItems(importNotice.type, importNotice.items) : []),
    [importNotice],
  );

  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#000000]">Clients</h1>
        <p className="text-[#707070] text-sm mt-1">Manage your clients, policies, and applications.</p>
      </div>

      {!agentProfile.tipsSeen?.clients && (
        <SectionTipCard onDismiss={() => dismissTip('clients')}>
          Add clients here &mdash; each gets a unique code. Use the Share button to text them the download link for your branded app.
        </SectionTipCard>
      )}

      {/* Batch Processing In-Progress Banner */}
      {activeBatchId && !batchNotification && (
        <div className="mb-4 px-4 py-3 bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-[#45bcaa] shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <div className="space-y-1">
                <p className="text-sm font-medium text-[#005851]">Processing your import&hellip; we&apos;ll notify you when it&apos;s ready.</p>
                {activeBatchProgress && (
                  <p className="text-xs text-[#5f5f5f]">
                    {activeBatchProgress.completedFiles + activeBatchProgress.failedFiles}/{Math.max(1, activeBatchProgress.totalFiles)} files finished
                    {' · '}
                    {activeBatchProgress.processingFiles} processing
                    {' · '}
                    {activeBatchProgress.queuedFiles} queued
                    {' · '}
                    {activeBatchProgress.failedFiles} failed
                    {activeBatchProgress.createdAtMs
                      ? ` · elapsed ${Math.max(0, Math.floor((batchClockMs - activeBatchProgress.createdAtMs) / 60_000))}:${String(Math.max(0, Math.floor((batchClockMs - activeBatchProgress.createdAtMs) / 1000) % 60)).padStart(2, '0')}`
                      : ''}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleCancelActiveBatch}
              disabled={cancelingBatch}
              className="px-3 py-1.5 rounded-[5px] text-xs font-semibold border border-[#1A1A1A] text-[#000000] bg-white hover:bg-[#f8f8f8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {cancelingBatch ? 'Cancelling...' : 'Cancel Import'}
            </button>
          </div>
          {!!activeBatchProgress && (
            <div className="mt-3 h-2 bg-[#e8e8e8] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#45bcaa] rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      ((activeBatchProgress.completedFiles + activeBatchProgress.failedFiles) /
                        Math.max(1, activeBatchProgress.totalFiles)) * 100,
                    ),
                  )}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {batchStatusNotice && (
        <div
          className={`mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-[5px] border ${
            batchStatusNotice.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <p className="text-sm">{batchStatusNotice.message}</p>
          <button
            onClick={() => setBatchStatusNotice(null)}
            className="p-1 rounded hover:bg-black/5 transition-colors"
            aria-label="Dismiss status notice"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Batch Import Ready Banner */}
      {batchNotification && (
        <div className="mb-4 flex items-center justify-between px-4 py-3 bg-[#daf3f0] border border-[#45bcaa]/30 rounded-[5px]">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-[#45bcaa] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-[#005851]">
              Your import is ready for review
              {batchNotification.failedFiles > 0
                ? ` (${batchNotification.completedFiles} succeeded, ${batchNotification.failedFiles} failed).`
                : ` \u2014 ${batchNotification.completedFiles} file${batchNotification.completedFiles !== 1 ? 's' : ''} processed successfully.`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleReviewBatchResults}
              className="px-4 py-1.5 bg-[#45bcaa] hover:bg-[#005751] text-white text-sm font-semibold rounded-[5px] transition-colors"
            >
              Review
            </button>
            <button
              onClick={() => { batchDismissedRef.current = true; setBatchNotification(null); }}
              className="p-1 rounded hover:bg-[#45bcaa]/20 text-[#005851] transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className={isImportModalOpen || isAddFlowActive ? 'overflow-x-visible' : 'overflow-x-clip'}>
        <div
          className="flex transition-transform duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translateX(-${addFlowSlideIndex * 100}%)` }}
        >
          <div className="w-full shrink-0">
      {/* Action Bar */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6 transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isImportModalOpen || isAddFlowActive
          ? 'opacity-75 pointer-events-none select-none'
          : 'translate-x-0 opacity-100'
      }`}
      style={{ transform: listSurfaceTransform }}>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenModal}
              className="px-4 py-2.5 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Client
            </button>
            <button
              onClick={() => {
                setIsImportModalOpen(true);
                setImportData([]);
                clearImportNotice();
                setImportSuccess('');
                setImportProgress(0);
                setImportFileStatuses([]);
                setImportSessionStartedAt(null);
                setSelectedImportRowIndex(0);
                setJustImportedClients([]);
                setIntroMessage(DEFAULT_INTRO_TEMPLATE);
                setIntroSentCount(null);
              }}
              className="px-4 py-2.5 bg-white hover:bg-gray-50 text-[#000000] font-semibold rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Bulk Import
            </button>
            {addFlowToast && (
              <div className={`px-3 py-2 rounded-[5px] border text-xs font-medium ${
                addFlowToast.celebrate
                  ? 'bg-[#daf3f0] border-[#45bcaa]/40 text-[#005851]'
                  : 'bg-white border-[#d0d0d0] text-[#444]'
              }`}>
                {addFlowToast.message}
              </div>
            )}
          </div>
        <div className="flex-1" />
          <div className="relative w-full sm:w-72">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] text-sm text-[#000000] placeholder-[#707070] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
            />
          </div>
      </div>

      <div
        className="relative mb-6 overflow-visible"
        style={{
          minHeight: isImportModalOpen
            ? '640px'
            : isAddFlowActive
              ? `${addFlowSurfaceMinHeight}px`
              : undefined,
        }}
      >
      {/* ── Bulk Import Surface ── */}
      <div
        className={`${incomingSurfaceMotionClass} ${
          isImportModalOpen
            ? 'translate-x-0 opacity-100'
            : 'translate-x-[112%] opacity-0 pointer-events-none'
        }`}
        aria-hidden={!isImportModalOpen}
      >
        <div
          ref={importModalScrollRef}
          className={`${incomingSurfaceShellClass} max-w-5xl`}
        >
            <div className={incomingSurfaceHeaderClass}>
              <div>
                <h3 className="text-2xl font-bold text-[#000000]">Bulk Import</h3>
                <p className="text-sm text-[#5f5f5f] mt-1">Bring in spreadsheets and PDFs from Google Drive or your computer.</p>
              </div>
              <button
                onClick={() => !importing && !parsingBob && setIsImportModalOpen(false)}
                className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-7 md:p-8 space-y-6">
              {importSuccess && activeBatchId ? (
                /* Background processing confirmation — agent can close and go */
                <div className="text-center space-y-4 py-4">
                  <div className="w-14 h-14 bg-[#daf3f0] rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-7 h-7 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm text-[#707070] max-w-sm mx-auto">{importSuccess}</p>
                  <button
                    onClick={() => {
                      setIsImportModalOpen(false);
                      setImportSuccess('');
                    }}
                    className="px-6 py-2.5 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors text-sm"
                  >
                    Got it
                  </button>
                </div>
              ) : importSuccess ? (
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-lg font-bold text-[#000000] mb-2">{importSuccess}</p>
                  </div>
                  {introSentCount !== null ? (
                    <div className="text-center">
                      <p className="text-[#0D4D4D] font-semibold mb-4">Sent to {introSentCount} client{introSentCount !== 1 ? 's' : ''}.</p>
                      <button
                        onClick={() => {
                          setIsImportModalOpen(false);
                          setImportSuccess('');
                          setJustImportedClients([]);
                          setIntroMessage(DEFAULT_INTRO_TEMPLATE);
                          setIntroSentCount(null);
                          setSelectedIntroClients(new Set());
                          setShowIntroConfirm(false);
                        }}
                        className="px-6 py-2.5 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors text-sm"
                      >
                        Done
                      </button>
                    </div>
                  ) : (() => {
                    const withPhone = justImportedClients.filter((r) => r.phone.trim());
                    if (withPhone.length === 0) {
                      return (
                        <button
                          onClick={() => {
                            setIsImportModalOpen(false);
                            setImportSuccess('');
                            setJustImportedClients([]);
                            setIntroMessage(DEFAULT_INTRO_TEMPLATE);
                            setIntroSentCount(null);
                            setSelectedIntroClients(new Set());
                            setShowIntroConfirm(false);
                          }}
                          className="w-full px-6 py-2.5 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors text-sm"
                        >
                          Done
                        </button>
                      );
                    }
                    const selectedCount = withPhone.filter((r) => selectedIntroClients.has(r.clientId)).length;
                    if (showIntroConfirm) {
                      return (
                        <div className="space-y-4">
                          <div className="bg-amber-50 border border-amber-200 rounded-[5px] p-4 text-center">
                            <p className="text-sm font-semibold text-amber-800 mb-1">Confirm Send</p>
                            <p className="text-sm text-amber-700">
                              This will text <strong>{selectedCount} client{selectedCount !== 1 ? 's' : ''}</strong> the intro message with their app download link and unique code.
                            </p>
                          </div>
                          <div className="flex gap-3">
                            <button
                              onClick={() => setShowIntroConfirm(false)}
                              disabled={sendingIntro}
                              className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors text-sm"
                            >
                              Go back
                            </button>
                            <button
                              onClick={handleSendBulkIntro}
                              disabled={sendingIntro}
                              className="flex-1 py-2.5 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-gray-300 text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2 text-sm"
                            >
                              {sendingIntro ? (
                                <>
                                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                  Sending...
                                </>
                              ) : (
                                'Yes, send'
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        <p className="text-sm text-[#707070]">
                          Send a custom intro to clients with phone numbers. Use <strong>{'{{firstName}}'}</strong>, <strong>{'{{code}}'}</strong>, and <strong>{'{{agentName}}'}</strong> in your message.
                        </p>
                        <textarea
                          value={introMessage}
                          onChange={(e) => setIntroMessage(e.target.value)}
                          rows={6}
                          className="w-full px-3 py-2 border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] placeholder-[#707070] focus:outline-none focus:border-[#45bcaa] resize-y"
                          placeholder={DEFAULT_INTRO_TEMPLATE}
                        />
                        <p className="text-xs text-[#707070]">If you leave this blank, we&apos;ll send the default message above.</p>
                        <div className="border border-[#d0d0d0] rounded-[5px] overflow-hidden">
                          <div className="flex items-center justify-between bg-[#f8f8f8] px-3 py-2 border-b border-[#d0d0d0]">
                            <span className="text-xs font-semibold text-[#707070]">{selectedCount} of {withPhone.length} selected</span>
                            <button
                              onClick={() => {
                                if (selectedCount === withPhone.length) {
                                  setSelectedIntroClients(new Set());
                                } else {
                                  setSelectedIntroClients(new Set(withPhone.map((r) => r.clientId)));
                                }
                              }}
                              className="text-xs font-medium text-[#005851] hover:text-[#003d3d] transition-colors"
                            >
                              {selectedCount === withPhone.length ? 'Deselect all' : 'Select all'}
                            </button>
                          </div>
                          <div className="max-h-48 overflow-y-auto divide-y divide-[#f0f0f0]">
                            {withPhone.map((client) => (
                              <label key={client.clientId} className="flex items-center gap-3 px-3 py-2 hover:bg-[#f8f8f8] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedIntroClients.has(client.clientId)}
                                  onChange={() => {
                                    setSelectedIntroClients((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(client.clientId)) {
                                        next.delete(client.clientId);
                                      } else {
                                        next.add(client.clientId);
                                      }
                                      return next;
                                    });
                                  }}
                                  className="w-4 h-4 rounded border-[#d0d0d0] text-[#44bbaa] focus:ring-[#44bbaa] shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm text-[#000000] font-medium">{client.firstName || '—'}</span>
                                  <span className="text-xs text-[#707070] ml-2">{client.phone}</span>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => {
                              setIsImportModalOpen(false);
                              setImportSuccess('');
                              setJustImportedClients([]);
                              setIntroMessage(DEFAULT_INTRO_TEMPLATE);
                              setIntroSentCount(null);
                              setSelectedIntroClients(new Set());
                              setShowIntroConfirm(false);
                            }}
                            className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors text-sm"
                          >
                            Skip
                          </button>
                          <button
                            onClick={() => setShowIntroConfirm(true)}
                            disabled={selectedCount === 0}
                            className="flex-1 py-2.5 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-[5px] transition-colors text-sm"
                          >
                            {`Send intro to ${selectedCount} client${selectedCount !== 1 ? 's' : ''}`}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : driveImportInFlight ? (
                /* Google Drive import POST in flight — show loading instead of the form */
                <div className="text-center space-y-4 py-8">
                  <div className="w-14 h-14 bg-[#daf3f0] rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-7 h-7 text-[#45bcaa] animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                  <p className="text-sm text-[#707070] font-medium">{BULK_IMPORT_FUN_STATES[0]}</p>
                  <p className="text-xs text-[#999999]">You can keep working while this runs in the background.</p>
                </div>
              ) : (
                <>
                  <div className="rounded-[5px] border border-[#d9d9d9] bg-[#f8f8f8] px-5 py-3.5">
                    <p className="text-sm font-medium text-[#3f3f3f]">
                      Up to <span className="font-semibold text-[#2f2f2f]">50 files</span> per import
                      <span className="mx-2 text-[#9a9a9a]">•</span>
                      Best with <span className="font-semibold text-[#2f2f2f]">10-20 files</span>
                      <span className="mx-2 text-[#9a9a9a]">•</span>
                      CSV, TSV, Excel, PDF
                    </p>
                  </div>

                  <div className="rounded-[5px] border border-amber-200 bg-amber-50/70 px-4 py-2.5">
                    <p className="text-sm font-medium leading-relaxed text-amber-800">
                      Password-protected files can&apos;t be processed. Remove protection or upload one at a time with +Add Client one page back.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={handleDriveImportAction}
                      disabled={googleDriveActionLoading || googlePickerLoading || parsingBob || importing}
                      className="text-left border border-[#d0d0d0] rounded-[5px] bg-white p-5 hover:border-[#45bcaa]/60 hover:bg-[#daf3f0]/20 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      <div className="inline-flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-[6px] bg-[#f5f5f5] border border-[#e5e5e5] flex items-center justify-center">
                          <img
                            src="https://www.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png"
                            alt=""
                            width={20}
                            height={20}
                            className="block"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-semibold text-[#005851]">
                            {googleDriveActionLoading
                              ? 'Connecting to Google Drive...'
                              : googlePickerLoading
                                ? 'Opening Google Drive...'
                                : googleDriveConnected
                                  ? 'Choose from Google Drive'
                                  : 'Connect Google Drive'}
                          </span>
                          {!googleDriveActionLoading && !googlePickerLoading && googleDriveConnected && (
                            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                              Connected
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-[#6a6a6a] mt-2.5">Pick files from your Google Drive.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={parsingBob || importing}
                      className="text-left border border-[#d0d0d0] rounded-[5px] bg-white p-5 hover:border-[#45bcaa]/60 hover:bg-[#daf3f0]/20 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      <div className="inline-flex items-center gap-2.5 text-base font-semibold text-[#005851]">
                        <div className="w-8 h-8 rounded-[6px] bg-[#f5f5f5] border border-[#e5e5e5] flex items-center justify-center">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        </div>
                        <span>Upload from Computer</span>
                      </div>
                      <p className="text-sm text-[#6a6a6a] mt-2.5">Select files from your computer.</p>
                    </button>
                  </div>

                  <div className="border border-[#d0d0d0] rounded-[5px] bg-white p-4 space-y-3">
                    {!googleDriveConnected ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-600">
                            {googleDriveLoading ? 'Checking connection' : 'Drive disconnected'}
                          </span>
                        </div>
                      <div className="rounded-[5px] border border-amber-200 bg-amber-50/70 px-3 py-2.5">
                        <p className="text-xs leading-relaxed text-amber-800">
                          Google may show an "unverified app" screen during review. You can continue by choosing
                          <span className="font-semibold"> Advanced</span> then
                          <span className="font-semibold"> Go to AgentForLife</span>.
                        </p>
                      </div>
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-green-50 text-green-700">
                          Drive connected
                        </span>
                        {googleDriveEmail && (
                          <span className="inline-flex items-center rounded-full bg-[#f3f7f7] px-2.5 py-1 text-xs font-medium text-[#005851]">
                            {googleDriveEmail}
                          </span>
                        )}
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.tsv,.xlsx,.xls,.pdf,text/csv,text/tab-separated-values,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>

                  <div
                    onDrop={handleImportDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setImportDragActive(true);
                    }}
                    onDragLeave={() => setImportDragActive(false)}
                    className={`rounded-[5px] border-2 border-dashed p-9 transition-colors ${
                      importDragActive
                        ? 'border-[#45bcaa] bg-[#daf3f0]/45'
                        : 'border-[#bfcfcf] bg-[#fcfefe]'
                    }`}
                  >
                    <div className="flex justify-center">
                      <div className="w-11 h-11 rounded-full bg-[#eaf4f3] border border-[#cfe2e0] flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#1f6e65]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-base font-semibold text-[#345f5a] text-center mt-3">Drop files here to start import</p>
                    <p className="text-xs text-[#7d8c8a] text-center mt-1">Up to 50 files • CSV, TSV, Excel, PDF • Best with 10-20 files</p>
                  </div>

                  {importFileStatuses.length > 0 && (
                    <div className="border border-[#d0d0d0] rounded-[5px] overflow-hidden">
                      <div className="bg-[#f8f8f8] px-4 py-2 border-b border-[#d0d0d0] flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#707070]">File status</p>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-green-50 text-green-700">{importFileStatusSummary.succeeded} ready to import</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700">{importFileStatusSummary.failed} needs review</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700">{importFileStatusSummary.parsing} processing</span>
                          {importFileStatusSummary.queued > 0 && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">{importFileStatusSummary.queued} queued</span>
                          )}
                        </div>
                      </div>
                      <div className="divide-y divide-[#f0f0f0]">
                        {importFileStatuses.map((status) => (
                          <div key={status.sourceFileId} className="px-4 py-2 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[#000000] truncate">{status.name}</p>
                              {status.error ? (
                                <p className="text-[11px] text-red-600 leading-relaxed">{toPlainEnglishImportFailureReason(status.error)}</p>
                              ) : (
                                <p className="text-[11px] text-[#707070]">
                                  {status.loadedRows > 0 ? `${status.loadedRows} rows loaded` : 'Awaiting parse'}
                                  {status.rejectedRows > 0 ? ` · ${status.rejectedRows} skipped` : ''}
                                </p>
                              )}
                              {!!status.notes?.length && (
                                <div className="mt-1.5 space-y-1">
                                  {status.notes.slice(0, 2).map((note, noteIdx) => (
                                    <p key={`${status.sourceFileId}-note-${noteIdx}`} className="text-[11px] text-amber-700 leading-relaxed">
                                      - {note}
                                    </p>
                                  ))}
                                  {status.notes.length > 2 && (
                                    <p className="text-[11px] text-[#707070]">+{status.notes.length - 2} more note{status.notes.length - 2 !== 1 ? 's' : ''}</p>
                                  )}
                                </div>
                              )}
                            </div>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                              status.state === 'succeeded'
                                ? 'bg-green-50 text-green-700'
                                : status.state === 'failed'
                                  ? 'bg-red-50 text-red-700'
                                  : status.state === 'parsing'
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'bg-gray-100 text-gray-600'
                            }`}>
                              {status.state === 'queued'
                                ? 'queued'
                                : status.state === 'parsing'
                                  ? 'processing'
                                  : status.state}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {parsingBob && (
                    <div className="space-y-2">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#45bcaa] rounded-full transition-all duration-300"
                          style={{ width: `${importProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-[#707070] text-center">{getBulkImportFunLabel(importProgress)} {importProgress}%</p>
                    </div>
                  )}

                  {importNotice && importNoticeStyle && importNotice.type !== 'warning' && (
                    <div className={`px-3 py-2 rounded-[5px] text-xs ${importNoticeStyle.shell}`}>
                      <div className="flex items-center gap-2">
                        <svg className={`w-4 h-4 shrink-0 ${importNoticeStyle.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className={`font-semibold ${importNoticeStyle.title}`}>{importNotice.title}</span>
                      </div>
                      <div className="mt-2 space-y-1 max-w-2xl">
                        {displayedImportNoticeItems.map((item, idx) => (
                          <p key={`${item}-${idx}`} className="leading-relaxed">- {item}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {importData.length > 0 && (
                    <>
                      {/* Summary of detected fields */}
                      {(() => {
                        const withPolicy = importData.filter(r => r.carrier || r.policyType || r.premium || r.coverageAmount).length;
                        const withEffDate = importData.filter(r => r.effectiveDate).length;
                        return (
                          <div ref={importReviewSectionRef} className="space-y-2">
                            <p className="text-sm font-semibold text-[#2f2f2f]">Step 2: Review parsed records</p>
                            <div className="flex flex-wrap gap-2">
                              <span className="px-2.5 py-1 bg-[#daf3f0] text-[#005851] text-xs font-semibold rounded-[5px]">
                                {importData.length} client{importData.length !== 1 ? 's' : ''}
                              </span>
                              {withPolicy > 0 && (
                                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-[5px]">
                                  {withPolicy} {withPolicy !== 1 ? 'policies' : 'policy'}
                                </span>
                              )}
                              {withEffDate > 0 && (
                                <span className="px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded-[5px]">
                                  {withEffDate} with effective date
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="border border-[#d0d0d0] rounded-[5px] overflow-hidden">
                        <div className="bg-[#f8f8f8] px-4 py-2 border-b border-[#d0d0d0]">
                          <p className="text-xs font-semibold text-[#707070]">
                            Review records ({importData.length})
                          </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr]">
                          <div className="min-h-[22rem] divide-y divide-[#f0f0f0] border-b md:border-b-0 md:border-r border-[#f0f0f0]">
                            {importData.slice(0, 50).map((row, i) => {
                              const hasPolicy = row.carrier || row.policyType;
                              const rowNotes = getImportRowReviewNotes(row);
                              const isSelected = selectedImportRowIndex === i;
                              return (
                                <button
                                  key={`${row.name}-${i}`}
                                  type="button"
                                  onClick={() => setSelectedImportRowIndex(i)}
                                  className={`w-full px-4 py-2.5 flex items-start gap-3 text-left transition-colors ${
                                    isSelected ? 'bg-[#daf3f0]/35' : 'hover:bg-[#f8f8f8]'
                                  }`}
                                >
                                  <span className="text-xs text-[#707070] w-6 pt-0.5 shrink-0">{i + 1}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[#000000] truncate">{row.name || 'Unnamed client'}</p>
                                    <p className="text-xs text-[#707070] truncate">
                                      {[row.email, row.phone].filter(Boolean).join(' · ') || 'No contact info'}
                                    </p>
                                    {hasPolicy && (
                                      <p className="text-[10px] text-blue-700 truncate mt-1">
                                        {[row.policyType, row.carrier].filter(Boolean).join(' · ')}
                                      </p>
                                    )}
                                    {rowNotes.length > 0 && (
                                      <p className="text-[10px] text-amber-700 truncate mt-1">
                                        {rowNotes[0]}
                                      </p>
                                    )}
                                  </div>
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                    rowNotes.length > 0
                                      ? 'bg-amber-50 text-amber-700'
                                      : 'bg-[#f3f7f7] text-[#005851]'
                                  }`}>
                                    {rowNotes.length > 0
                                      ? `Needs review${rowNotes.length > 1 ? ` (${rowNotes.length})` : ''}`
                                      : (row.email || row.phone ? 'Ready' : 'Review')}
                                  </span>
                                </button>
                              );
                            })}
                            {importData.length > 50 && (
                              <div className="px-4 py-2 text-xs text-[#707070] text-center">
                                +{importData.length - 50} more rows
                              </div>
                            )}
                          </div>

                          <div className="p-4 bg-white">
                            {selectedImportRow ? (
                              <div className="space-y-3">
                                <p className="text-xs font-semibold text-[#707070] uppercase tracking-wide">Selected record</p>
                                <div className="space-y-1.5 text-xs text-[#444] max-w-[34ch]">
                                  <p><span className="font-semibold text-[#000]">Name:</span> {selectedImportRow.name || '—'}</p>
                                  <p><span className="font-semibold text-[#000]">Email:</span> {selectedImportRow.email || '—'}</p>
                                  <p><span className="font-semibold text-[#000]">Phone:</span> {selectedImportRow.phone || '—'}</p>
                                  <p><span className="font-semibold text-[#000]">DOB:</span> {selectedImportRow.dateOfBirth || '—'}</p>
                                  <p><span className="font-semibold text-[#000]">Carrier:</span> {selectedImportRow.carrier || '—'}</p>
                                  <p><span className="font-semibold text-[#000]">Policy type:</span> {selectedImportRow.policyType || '—'}</p>
                                  <p><span className="font-semibold text-[#000]">Effective date:</span> {selectedImportRow.effectiveDate || '—'}</p>
                                  <p><span className="font-semibold text-[#000]">Premium:</span> {selectedImportRow.premium || '—'}</p>
                                  <p><span className="font-semibold text-[#000]">Coverage:</span> {selectedImportRow.coverageAmount || '—'}</p>
                                </div>
                                {selectedImportRowNotes.length > 0 && (
                                  <div className="rounded-[5px] border border-amber-200 bg-amber-50 px-3 py-2.5">
                                    <p className="text-[11px] font-semibold text-amber-800 mb-1">Record notes</p>
                                    <div className="space-y-1">
                                      {selectedImportRowNotes.map((note, noteIdx) => (
                                        <p key={`selected-note-${noteIdx}`} className="text-[11px] text-amber-700 leading-relaxed">- {note}</p>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-[#707070]">Select a record to see details.</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {importing && (
                        <div className="space-y-2">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#44bbaa] rounded-full transition-all duration-300"
                              style={{ width: `${importProgress}%` }}
                            />
                          </div>
                          <p className="text-xs text-[#707070] text-center">{importProgress}% complete</p>
                        </div>
                      )}

                      {importData.length > MAX_IMPORT_ROWS && (
                        <p className="text-xs text-red-600">Maximum {MAX_IMPORT_ROWS} clients per import. Split your file or import in multiple runs.</p>
                      )}
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setImportData([]);
                            clearImportNotice();
                            setImportFileStatuses([]);
                            setSelectedImportRowIndex(0);
                            batchDismissedRef.current = true;
                            setBatchNotification(null);
                          }}
                          disabled={importing || parsingBob}
                          className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors text-sm"
                        >
                          Reset
                        </button>
                        <button
                          onClick={handleImportClients}
                          disabled={importing || parsingBob || importData.length > MAX_IMPORT_ROWS}
                          className="flex-1 py-2.5 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-gray-300 text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                          {importing ? (
                            <>
                              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Importing...
                            </>
                          ) : (
                            `Import ${importData.length} Client${importData.length !== 1 ? 's' : ''}`
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
        </div>
      </div>
      {/* Client Table */}
      <div className={`relative z-10 transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isImportModalOpen || isAddFlowActive
          ? 'opacity-75 scale-[0.985] pointer-events-none select-none'
          : 'translate-x-0 opacity-100 scale-100'
      }`}
      style={{ transform: listSurfaceTransform }}>
      {clientsLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <svg className="animate-spin w-10 h-10 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-[#707070]">Loading clients...</p>
          </div>
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-12 text-center">
          <div className="w-16 h-16 bg-[#daf3f0] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-[#000000] mb-2">No clients yet</h3>
          <p className="text-[#707070] text-sm mb-6 max-w-md mx-auto">
            Add your first client to get started. Each client gets a unique code to connect with you through the app.
          </p>
          <button
            onClick={handleOpenModal}
            className="px-6 py-3 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors"
          >
            Add Your First Client
          </button>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-12 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-[#000000] mb-2">No results found</h3>
          <p className="text-[#707070] text-sm">
            No clients match &ldquo;{searchQuery}&rdquo;. Try a different search term.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#d0d0d0] bg-[#f8f8f8]">
                  <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3 cursor-pointer select-none hover:text-[#005851] transition-colors" onClick={() => handleSort('name')}>
                    Name<SortIcon column="name" />
                  </th>
                  <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3 cursor-pointer select-none hover:text-[#005851] transition-colors" onClick={() => handleSort('createdAt')}>
                    Client Since<SortIcon column="createdAt" />
                  </th>
                  <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3">Policies</th>
                  <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-right text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f0]">
                {paginatedClients.map((client) => {
                  const summary = clientPolicySummaries[client.id];
                  const hasLapsed = summary && summary.lapsed > 0;
                  const upcomingAnniversaryCount = clientUpcomingAnniversaryCounts[client.id] || 0;
                  return (
                  <tr
                    key={client.id}
                    className="hover:bg-[#f8f8f8] transition-colors cursor-pointer"
                    onClick={() => handleSelectClient(client)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#005851] rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-[#000000] block truncate">{client.name}</span>
                            {upcomingAnniversaryCount > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] rounded-full font-semibold shrink-0">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {upcomingAnniversaryCount} Upcoming
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-[#a0a0a0] truncate block">{client.email || client.phone || ''}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-[#707070]">
                      {formatClientSinceCell(client)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[#707070]">
                      {summary ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {summary.active > 0 && <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full font-medium">{summary.active} Active</span>}
                          {summary.pending > 0 && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full font-medium">{summary.pending} Pending</span>}
                          {summary.lapsed > 0 && <span className="px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-full font-medium">{summary.lapsed} Lapsed</span>}
                          {summary.total === 0 && <span className="text-xs text-[#a0a0a0] italic">No policies</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-[#d0d0d0]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {hasLapsed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-full font-semibold">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          At Risk
                        </span>
                      ) : summary && summary.total > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full font-medium">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Good
                        </span>
                      ) : (
                        <span className="text-xs text-[#d0d0d0]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleOpenFlagAtRisk(client)}
                          className="p-1.5 rounded-[5px] hover:bg-amber-50 text-[#707070] hover:text-amber-600 transition-colors"
                          title="Flag policy at risk"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleEditClient(client)}
                          className="p-1.5 rounded-[5px] hover:bg-gray-100 text-[#707070] hover:text-[#000000] transition-colors"
                          title="Edit client"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteConfirmClient(client)}
                          className="p-1.5 rounded-[5px] hover:bg-red-50 text-[#707070] hover:text-red-600 transition-colors"
                          title="Delete client"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-[#f0f0f0]">
            {paginatedClients.map((client) => {
              const summary = clientPolicySummaries[client.id];
              const hasLapsed = summary && summary.lapsed > 0;
              const upcomingAnniversaryCount = clientUpcomingAnniversaryCounts[client.id] || 0;
              return (
              <div
                key={client.id}
                className="p-4 hover:bg-[#f8f8f8] transition-colors cursor-pointer"
                onClick={() => handleSelectClient(client)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#005851] rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#000000] truncate">{client.name}</p>
                      {upcomingAnniversaryCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] rounded-full font-semibold shrink-0">
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Upcoming
                        </span>
                      )}
                      {hasLapsed && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] rounded-full font-semibold shrink-0">
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          At Risk
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#707070] truncate">
                      {summary ? (
                        <>
                          {summary.active > 0 && `${summary.active} Active`}
                          {summary.active > 0 && summary.lapsed > 0 && ', '}
                          {summary.lapsed > 0 && `${summary.lapsed} Lapsed`}
                          {summary.total === 0 && 'No policies'}
                        </>
                      ) : (
                        client.email || client.phone || 'No contact info'
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleOpenFlagAtRisk(client)}
                      className="p-1.5 rounded-[5px] hover:bg-amber-50 text-[#707070] hover:text-amber-600 transition-colors"
                      title="Flag at risk"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleEditClient(client)}
                      className="p-1.5 rounded-[5px] hover:bg-gray-100 text-[#707070] hover:text-[#000000] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteConfirmClient(client)}
                      className="p-1.5 rounded-[5px] hover:bg-red-50 text-[#707070] hover:text-red-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          {/* Table footer with pagination */}
          <div className="px-5 py-3 border-t border-[#d0d0d0] bg-[#f8f8f8] flex items-center justify-between">
            <p className="text-xs text-[#707070]">
              Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredClients.length)}&ndash;{Math.min(currentPage * PAGE_SIZE, filteredClients.length)} of {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
              {filteredClients.length !== clients.length && ` (filtered from ${clients.length})`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 text-xs font-medium rounded-[5px] border border-[#d0d0d0] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 5) { page = i + 1; }
                  else if (currentPage <= 3) { page = i + 1; }
                  else if (currentPage >= totalPages - 2) { page = totalPages - 4 + i; }
                  else { page = currentPage - 2 + i; }
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-7 h-7 text-xs font-medium rounded-[5px] transition-colors ${
                        currentPage === page
                          ? 'bg-[#005851] text-white'
                          : 'hover:bg-gray-100 text-[#707070]'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 text-xs font-medium rounded-[5px] border border-[#d0d0d0] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
      </div>
          </div>
          <div
            className={addFlowIncomingSurfaceMotionClass}
            style={getAddFlowSurfaceStyle(0)}
            aria-hidden={addFlowStage !== 'upload'}
          >
            <div className={addFlowSurfaceShellClass}>
              <div className={incomingSurfaceHeaderClass}>
                <div>
                  <h3 className="text-xl font-bold text-[#000000]">Add Client</h3>
                  <p className="text-xs text-[#707070] mt-0.5">Upload an application or expand manual entry.</p>
                </div>
                <button type="button" onClick={handleCloseAddFlow} className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Application Type</label>
                  <select
                    value={clientApplicationType}
                    onChange={(e) => setClientApplicationType(e.target.value as ApplicationFormType)}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
                    disabled={clientApplicationUploading}
                  >
                    {APPLICATION_TYPE_OPTIONS.map((option) => (
                      <option key={option.label} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleClickClientApplicationUpload}
                  disabled={clientApplicationUploading}
                  className="w-full px-4 py-3 border-2 border-dashed border-[#45bcaa]/40 hover:border-[#45bcaa] bg-[#daf3f0]/30 hover:bg-[#daf3f0]/60 rounded-[5px] text-sm font-medium text-[#005851] transition-all"
                >
                  {clientApplicationUploading ? 'Reading application PDF...' : 'Upload Application PDF'}
                </button>
                <input ref={clientApplicationFileInputRef} type="file" accept=".pdf,application/pdf" onChange={handleClientApplicationFileSelect} className="hidden" />
                {clientApplicationUploading && clientParseProgress && (
                  <div className="rounded-[5px] border border-[#45bcaa]/30 bg-[#daf3f0]/40 p-3">
                    <div className="flex items-center justify-between text-xs text-[#005851] mb-1">
                      <span className="font-medium truncate pr-2">{clientParseProgress.fileName}</span>
                      <span>{clientParseProgress.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/80 rounded-full overflow-hidden">
                      <div className="h-full bg-[#45bcaa] transition-all duration-300 ease-out" style={{ width: `${clientParseProgress.progress}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-[#005851]/80">{clientParseProgress.label}</p>
                  </div>
                )}
                {clientApplicationNote && (
                  <p className="text-xs text-[#707070]">{clientApplicationNote}</p>
                )}
                {formError && !manualEntryExpanded && (
                  <p className="text-xs text-red-600">{formError}</p>
                )}
                <div className="border-t border-[#ececec] pt-4">
                  <button type="button" onClick={() => setManualEntryExpanded((prev) => !prev)} className="w-full px-4 py-2.5 bg-white hover:bg-gray-50 text-[#000000] font-semibold rounded-[5px] border border-[#d0d0d0] text-sm">
                    {manualEntryExpanded ? 'Hide Manual Entry' : 'Expand Manual Entry'}
                  </button>
                  {manualEntryExpanded && (
                    <form onSubmit={handleManualCreateAndContinue} className="mt-4 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input type="text" value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} placeholder="Name *" className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm" />
                        <input type="tel" value={formData.phone} onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm" />
                        <input type="email" value={formData.email} onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm" />
                        <div className="flex flex-col">
                          <label className="text-xs font-medium text-[#707070] mb-1">Date of Birth</label>
                          <input type="date" value={formData.dateOfBirth} onChange={(e) => setFormData((f) => ({ ...f, dateOfBirth: e.target.value }))} className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm" />
                        </div>
                      </div>
                      {renderAddFlowPolicyInputs()}
                      {formError && <p className="text-xs text-red-600">{formError}</p>}
                      <div className="flex gap-3">
                        <button type="button" onClick={handleCloseAddFlow} className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-[5px] border border-gray-200 text-sm">Cancel</button>
                        <button type="submit" disabled={submitting} className="flex-1 py-2.5 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-gray-300 text-white font-semibold rounded-[5px] text-sm">{submitting ? 'Saving...' : 'Create Client'}</button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div
            className={addFlowIncomingSurfaceMotionClass}
            style={getAddFlowSurfaceStyle(1)}
            aria-hidden={addFlowStage !== 'review'}
          >
            <div className={addFlowSurfaceShellClass}>
              <div className={incomingSurfaceHeaderClass}>
                <div>
                  <h3 className="text-xl font-bold text-[#000000]">Review & Confirm</h3>
                  <p className="text-xs text-[#707070] mt-0.5">Step 1 of 2</p>
                </div>
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#45bcaa]" /><span className="h-2.5 w-2.5 rounded-full bg-[#d0d0d0]" /></div>
              </div>
              <div className="p-6 space-y-4">
                  {clientApplicationShortPdfWarning ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#fff7db] border border-[#f5c451]/50 rounded-[5px] text-xs text-[#8a5a00]">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 4h.01M10.29 3.86l-8.5 14.5A1 1 0 002.64 20h16.72a1 1 0 00.85-1.64l-8.5-14.5a1 1 0 00-1.72 0z" /></svg>
                      <span className="font-medium">Heads-up: this PDF was shorter than expected. Some fields may be missing - please verify before confirming.</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#daf3f0] border border-[#45bcaa]/30 rounded-[5px] text-xs text-[#005851]">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="font-medium">Extraction complete. Review and confirm.</span>
                    </div>
                  )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <input type="text" value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} placeholder="Name *" className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm" />
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm" />
                  <input type="email" value={formData.email} onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm" />
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-[#707070] mb-1">Date of Birth</label>
                    <input type="date" value={formData.dateOfBirth} onChange={(e) => setFormData((f) => ({ ...f, dateOfBirth: e.target.value }))} className="px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm" />
                  </div>
                </div>
                {renderAddFlowPolicyInputs()}
                {formError && <p className="text-xs text-red-600">{formError}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setAddFlowStage('upload')} className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-[5px] border border-gray-200 text-sm">Cancel</button>
                  <button type="button" onClick={handleReviewConfirmAndCreate} disabled={submitting} className="flex-1 py-2.5 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-gray-300 text-white font-semibold rounded-[5px] text-sm">{submitting ? 'Creating...' : 'Confirm & Create'}</button>
                </div>
              </div>
            </div>
          </div>
          <div
            className={addFlowIncomingSurfaceMotionClass}
            style={getAddFlowSurfaceStyle(2)}
            aria-hidden={addFlowStage !== 'welcome'}
          >
            <div className={addFlowSurfaceShellClass}>
              <div className={incomingSurfaceHeaderClass}>
                <div>
                  <h3 className="text-xl font-bold text-[#000000]">Welcome Message</h3>
                  <p className="text-xs text-[#707070] mt-0.5">Step 2 of 2</p>
                </div>
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#d0d0d0]" /><span className="h-2.5 w-2.5 rounded-full bg-[#45bcaa]" /></div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-[#444]"><span className="font-semibold">Client:</span> {createdClientContext?.name || '—'}<br /><span className="font-semibold">Phone:</span> {createdClientContext?.phone || '—'}</p>
                <textarea value={welcomeDraft} onChange={(e) => setWelcomeDraft(e.target.value)} rows={7} className="w-full px-3 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm" />
                {welcomeError && <p className="text-xs text-red-600">{welcomeError}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={handleSkipWelcome} className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-[5px] border border-gray-200 text-sm">Skip</button>
                  <button type="button" onClick={handleSendWelcome} disabled={welcomeSending || !createdClientContext?.phone} className="flex-1 py-2.5 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-gray-300 text-white font-semibold rounded-[5px] text-sm">{welcomeSending ? 'Sending...' : 'Send Welcome Text'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          MODALS
          ═══════════════════════════════════════════════════════ */}

      {/* ── Add/Edit Client Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCloseModal} />
          {editingClient && (
            <div className="relative w-full max-w-md bg-white rounded-[5px] border border-gray-200 shadow-2xl">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h3 className="text-xl font-bold text-[#000000]">Edit Client</h3>
                <button
                  onClick={handleCloseModal}
                  className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleSubmitClient} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                    placeholder="Full name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData((f) => ({ ...f, dateOfBirth: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Client since</label>
                  <input
                    type="date"
                    value={formData.clientSinceDate}
                    onChange={(e) => setFormData((f) => ({ ...f, clientSinceDate: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                  />
                  <p className="mt-1 text-xs text-[#707070]">
                    When they became your client (often the application signature date). Filled automatically from PDFs when found. Leave blank to show the date they were added here.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Preferred Language</label>
                  <select
                    value={formData.preferredLanguage}
                    onChange={(e) => setFormData((f) => ({ ...f, preferredLanguage: resolveClientLanguage(e.target.value) }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                  </select>
                </div>

                {formError && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-[5px] text-xs text-red-600">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {formError}
                  </div>
                )}

                {formSuccess && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-[5px] text-xs text-green-700">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {formSuccess}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-gray-300 text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Saving...
                      </>
                    ) : (
                      'Update Client'
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}



      {/* ── Add/Edit Policy Modal ── */}
      {isPolicyModalOpen && selectedClient && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClosePolicyModal} />
          <div className="relative w-full max-w-lg bg-white rounded-[5px] border border-gray-200 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-bold text-[#000000]">
                  {editingPolicy ? 'Edit Policy' : 'Add Policy'}
                </h3>
                <p className="text-gray-500 text-sm">For {selectedClient.name}</p>
              </div>
              <button
                onClick={handleClosePolicyModal}
                className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmitPolicy} className="p-6 space-y-4">
              {/* Upload Application Button */}
              {!editingPolicy && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-sm font-medium text-[#000000] mb-1">Application Type</label>
                    <select
                      value={policyApplicationType}
                      onChange={(e) => setPolicyApplicationType(e.target.value as ApplicationFormType)}
                      className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                      disabled={policyApplicationUploading}
                    >
                      {APPLICATION_TYPE_OPTIONS.map((option) => (
                        <option key={option.label} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleClickPolicyApplicationUpload}
                    disabled={policyApplicationUploading}
                    className="w-full px-4 py-3 border-2 border-dashed border-[#0099FF]/30 hover:border-[#0099FF] bg-[#0099FF]/5 hover:bg-[#0099FF]/10 rounded-[5px] text-sm font-medium text-[#0099FF] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    {policyApplicationUploading ? 'Reading application PDF...' : 'Upload Application PDF to Auto-Fill'}
                  </button>
                  <input
                    ref={policyApplicationFileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handlePolicyApplicationFileSelect}
                    className="hidden"
                  />
                  <p className="text-xs text-[#707070]">
                    AI will extract client info and policy details in one step. Max 13MB.
                  </p>
                  {policyApplicationUploading && policyParseProgress && (
                    <div className="rounded-[5px] border border-[#0099FF]/25 bg-[#0099FF]/5 p-3">
                      <div className="flex items-center justify-between text-xs text-[#0A5CA8] mb-1">
                        <span className="font-medium truncate pr-2">{policyParseProgress.fileName}</span>
                        <span>{policyParseProgress.progress}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-white rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#0099FF] transition-all duration-300 ease-out"
                          style={{ width: `${policyParseProgress.progress}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-[#0A5CA8]/80">{policyParseProgress.label}</p>
                      <button
                        type="button"
                        onClick={handleCancelPolicyApplicationUpload}
                        className="mt-2 px-3 py-1.5 text-xs font-semibold rounded-[5px] border border-[#0A5CA8]/30 text-[#0A5CA8] hover:bg-[#e8f4ff] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {policyApplicationNote && (
                    <p className="text-xs text-[#707070]">{policyApplicationNote}</p>
                  )}
                </div>
              )}

              {/* Policy Type */}
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Policy Type *</label>
                <select
                  value={policyFormData.policyType}
                  onChange={(e) => setPolicyFormData((f) => ({ ...f, policyType: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                >
                  <option value="">Select type...</option>
                  {POLICY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Insurance Company */}
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Insurance Company</label>
                <select
                  value={policyFormData.insuranceCompany}
                  onChange={(e) => setPolicyFormData((f) => ({ ...f, insuranceCompany: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                >
                  <option value="">Select carrier...</option>
                  {KNOWN_CARRIERS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="Other">Other</option>
                </select>
              </div>

              {policyFormData.insuranceCompany === 'Other' && (
                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Carrier Name</label>
                  <input
                    type="text"
                    value={policyFormData.otherCarrier}
                    onChange={(e) => setPolicyFormData((f) => ({ ...f, otherCarrier: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                    placeholder="Enter carrier name"
                  />
                </div>
              )}

              {/* Policy Owner */}
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Policy Owner</label>
                <input
                  type="text"
                  value={policyFormData.policyOwner}
                  onChange={(e) => setPolicyFormData((f) => ({ ...f, policyOwner: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                  placeholder="Owner name"
                />
              </div>

              {/* Beneficiaries */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[#000000]">Beneficiaries</label>
                  <button
                    type="button"
                    onClick={() =>
                      setPolicyFormData((f) => ({
                        ...f,
                        beneficiaries: [...f.beneficiaries, { name: '', type: 'primary', relationship: '', percentage: undefined }],
                      }))
                    }
                    className="text-xs text-[#005851] font-semibold hover:underline"
                  >
                    + Add Beneficiary
                  </button>
                </div>
                <div className="space-y-3">
                  {policyFormData.beneficiaries.map((ben, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 bg-[#f8f8f8] rounded-[5px] border border-[#d0d0d0]">
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={ben.name}
                          onChange={(e) => {
                            const newBens = [...policyFormData.beneficiaries];
                            newBens[idx] = { ...newBens[idx], name: e.target.value };
                            setPolicyFormData((f) => ({ ...f, beneficiaries: newBens }));
                          }}
                          className="w-full px-3 py-2 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                          placeholder="Beneficiary name"
                        />
                        <div className="flex gap-2">
                          <select
                            value={ben.type}
                            onChange={(e) => {
                              const newBens = [...policyFormData.beneficiaries];
                              newBens[idx] = { ...newBens[idx], type: e.target.value as 'primary' | 'contingent' };
                              setPolicyFormData((f) => ({ ...f, beneficiaries: newBens }));
                            }}
                            className="flex-1 px-2 py-1.5 bg-white border border-[#d0d0d0] rounded-[5px] text-xs text-[#000000] focus:outline-none focus:border-[#45bcaa]"
                          >
                            <option value="primary">Primary</option>
                            <option value="contingent">Contingent</option>
                          </select>
                          <input
                            type="text"
                            value={ben.relationship || ''}
                            onChange={(e) => {
                              const newBens = [...policyFormData.beneficiaries];
                              newBens[idx] = { ...newBens[idx], relationship: e.target.value };
                              setPolicyFormData((f) => ({ ...f, beneficiaries: newBens }));
                            }}
                            className="flex-1 px-2 py-1.5 bg-white border border-[#d0d0d0] rounded-[5px] text-xs text-[#000000] focus:outline-none focus:border-[#45bcaa]"
                            placeholder="Relationship"
                          />
                          <input
                            type="number"
                            value={ben.percentage ?? ''}
                            onChange={(e) => {
                              const newBens = [...policyFormData.beneficiaries];
                              newBens[idx] = {
                                ...newBens[idx],
                                percentage: e.target.value ? Number(e.target.value) : undefined,
                              };
                              setPolicyFormData((f) => ({ ...f, beneficiaries: newBens }));
                            }}
                            className="w-16 px-2 py-1.5 bg-white border border-[#d0d0d0] rounded-[5px] text-xs text-[#000000] focus:outline-none focus:border-[#45bcaa]"
                            placeholder="%"
                            min="0"
                            max="100"
                          />
                        </div>
                      </div>
                      {policyFormData.beneficiaries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newBens = policyFormData.beneficiaries.filter((_, i) => i !== idx);
                            setPolicyFormData((f) => ({ ...f, beneficiaries: newBens }));
                          }}
                          className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors mt-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Coverage & Premium */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Death Benefit ($)</label>
                  <input
                    type="number"
                    value={policyFormData.coverageAmount}
                    onChange={(e) => setPolicyFormData((f) => ({ ...f, coverageAmount: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                    placeholder="250000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Premium ($)</label>
                  <input
                    type="number"
                    value={policyFormData.premiumAmount}
                    onChange={(e) => setPolicyFormData((f) => ({ ...f, premiumAmount: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                    placeholder="150"
                  />
                </div>
              </div>

              {/* Premium Frequency */}
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Premium Frequency</label>
                <select
                  value={policyFormData.premiumFrequency}
                  onChange={(e) => setPolicyFormData((f) => ({ ...f, premiumFrequency: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="semi-annual">Semi-Annual</option>
                  <option value="annual">Annual</option>
                </select>
              </div>

              {/* Effective Date */}
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Effective Date</label>
                <input
                  type="date"
                  value={policyFormData.effectiveDate}
                  onChange={(e) => setPolicyFormData((f) => ({ ...f, effectiveDate: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                />
                <p className="text-xs text-[#707070] mt-1">When the policy was originally issued. Used for policy age calculations.</p>
              </div>

              {/* Renewal Date (Term Life) */}
              {policyFormData.policyType === 'Term Life' && (
                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Renewal Date</label>
                  <input
                    type="date"
                    value={policyFormData.renewalDate}
                    onChange={(e) => setPolicyFormData((f) => ({ ...f, renewalDate: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                  />
                </div>
              )}

              {/* Mortgage Protection fields */}
              {policyFormData.policyType === 'Mortgage Protection' && (
                <div className="bg-[#44bbaa]/5 border border-[#45bcaa]/30 rounded-lg p-4">
                  <p className="text-sm font-semibold text-[#005851] mb-1">Coverage Duration <span className="text-red-500">*</span></p>
                  <p className="text-xs text-[#707070] mb-3">How long is the client covered? This displays prominently in their app.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#000000] mb-1">Amount of Protection</label>
                      <input
                        type="number"
                        value={policyFormData.amountOfProtection}
                        onChange={(e) => setPolicyFormData((f) => ({ ...f, amountOfProtection: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                        placeholder="30"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#000000] mb-1">Unit</label>
                      <select
                        value={policyFormData.protectionUnit}
                        onChange={(e) => setPolicyFormData((f) => ({ ...f, protectionUnit: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                      >
                        <option value="years">Years</option>
                        <option value="months">Months</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Status</label>
                <select
                  value={policyFormData.status}
                  onChange={(e) => setPolicyFormData((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                >
                  {POLICY_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {policyFormError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-[5px] text-xs text-red-600">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {policyFormError}
                </div>
              )}

              {policyFormSuccess && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-[5px] text-xs text-green-700">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {policyFormSuccess}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClosePolicyModal}
                  className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={policySubmitting}
                  className="flex-1 py-2.5 px-4 bg-[#0099FF] hover:bg-[#0088DD] disabled:bg-gray-300 text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {policySubmitting ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : editingPolicy ? (
                    'Update Policy'
                  ) : (
                    'Add Policy'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Policy Confirmation ── */}
      {deleteConfirmPolicy && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirmPolicy(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-[5px] border border-gray-200 shadow-2xl p-6">
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#000000] mb-2">Delete Policy</h3>
              <p className="text-sm text-[#707070] mb-6">
                Are you sure you want to delete the <span className="font-semibold">{deleteConfirmPolicy.policyType}</span> policy? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmPolicy(null)}
                  className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeletePolicy}
                  disabled={deleting}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {deleting ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    'Delete Policy'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Client Confirmation ── */}
      {deleteConfirmClient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirmClient(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-[5px] border border-gray-200 shadow-2xl p-6">
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#000000] mb-2">Delete Client</h3>
              <p className="text-sm text-[#707070] mb-6">
                Are you sure you want to delete <span className="font-semibold">{deleteConfirmClient.name}</span> and all their policies? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmClient(null)}
                  className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteClient}
                  disabled={deletingClient}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {deletingClient ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    'Delete Client'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Client Detail Modal ── */}
      {selectedClient && (
        <ClientDetailModal
          client={selectedClient}
          policies={policies}
          policiesLoading={policiesLoading}
          onClose={handleCloseClientView}
          onAddPolicy={handleOpenPolicyModal}
          onEditPolicy={(policy) => {
            setEditingPolicy(policy);
            setPolicyFormData({
              policyType: policy.policyType || '',
              policyNumber: policy.policyNumber || '',
              insuranceCompany: KNOWN_CARRIERS.includes(policy.insuranceCompany)
                ? policy.insuranceCompany
                : policy.insuranceCompany
                ? 'Other'
                : '',
              otherCarrier: !KNOWN_CARRIERS.includes(policy.insuranceCompany) ? (policy.insuranceCompany || '') : '',
              policyOwner: policy.policyOwner || '',
              beneficiaries:
                policy.beneficiaries && policy.beneficiaries.length > 0
                  ? policy.beneficiaries.map((b) => ({
                      name: b.name,
                      type: b.type,
                      relationship: b.relationship || '',
                      percentage: b.percentage,
                    }))
                  : [{ name: '', type: 'primary', relationship: '', percentage: undefined }],
              coverageAmount: policy.coverageAmount ? String(policy.coverageAmount) : '',
              premiumAmount: policy.premiumAmount ? String(policy.premiumAmount) : '',
              premiumFrequency: policy.premiumFrequency || 'monthly',
              renewalDate: policy.renewalDate || '',
              effectiveDate: policy.effectiveDate || '',
              amountOfProtection: policy.amountOfProtection ? String(policy.amountOfProtection) : '',
              protectionUnit: policy.protectionUnit || 'years',
              status: policy.status || 'Active',
            });
            setPolicyFormError('');
            setPolicyFormSuccess('');
            setIsPolicyModalOpen(true);
          }}
          onDeletePolicy={(policy) => setDeleteConfirmPolicy(policy)}
          onUploadApplication={() => handleOpenPolicyModal({ openUploadPicker: true })}
          onEditClient={handleEditClient}
          onUpdateClient={handleInlineUpdateClient}
          onFlagAtRisk={() => { refreshPolicies(); }}
          agentName={agentProfile.name}
          hasSchedulingUrl={!!agentProfile.schedulingUrl}
          clientPushToken={clientPushToken === undefined ? null : clientPushToken}
        />
      )}

      {/* ── Flag At Risk Modal ── */}
      {flagAtRiskClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleCloseFlagAtRisk} />
          <div className="relative bg-white rounded-[5px] shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#000000]">Flag Policy At Risk</h3>
                <p className="text-sm text-[#707070]">{flagAtRiskClient.name}</p>
              </div>
              <button onClick={handleCloseFlagAtRisk} className="ml-auto text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {flagAtRiskResult ? (
              <div className={`p-4 rounded-[5px] border ${flagAtRiskResult.success ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                <p className={`text-sm font-medium ${flagAtRiskResult.success ? 'text-green-800' : 'text-red-700'}`}>
                  {flagAtRiskResult.message}
                </p>
              </div>
            ) : flagAtRiskPoliciesLoading ? (
              <div className="flex items-center justify-center py-8">
                <svg className="animate-spin w-6 h-6 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : flagAtRiskPolicies.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-[#707070]">This client has no policies to flag.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {flagAtRiskPolicies.length > 1 && (
                  <div>
                    <label className="block text-xs font-semibold text-[#707070] uppercase tracking-wide mb-2">Select Policy</label>
                    <div className="space-y-2">
                      {flagAtRiskPolicies.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setFlagAtRiskPolicyId(p.id)}
                          className={`w-full text-left px-4 py-3 rounded-[5px] border transition-all ${
                            flagAtRiskPolicyId === p.id
                              ? 'border-[#005851] bg-[#daf3f0] ring-1 ring-[#005851]/30'
                              : 'border-[#d0d0d0] hover:border-[#a0a0a0] bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-[#000000]">{p.policyType}</p>
                              <p className="text-xs text-[#707070]">{p.insuranceCompany}</p>
                            </div>
                            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                              p.status === 'Active' ? 'bg-green-50 text-green-700' :
                              p.status === 'Lapsed' ? 'bg-red-50 text-red-600' :
                              'bg-blue-50 text-blue-600'
                            }`}>{p.status}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {flagAtRiskPolicies.length === 1 && (
                  <div className="px-4 py-3 bg-[#f8f8f8] rounded-[5px] border border-[#d0d0d0]">
                    <p className="text-sm font-medium text-[#000000]">{flagAtRiskPolicies[0].policyType}</p>
                    <p className="text-xs text-[#707070]">{flagAtRiskPolicies[0].insuranceCompany}</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#707070] uppercase tracking-wide mb-2">What happened?</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setFlagAtRiskReason('lapsed_payment')}
                      className={`px-4 py-3 rounded-[5px] border text-sm font-medium transition-all ${
                        flagAtRiskReason === 'lapsed_payment'
                          ? 'border-[#005851] bg-[#daf3f0] text-[#005851] ring-1 ring-[#005851]/30'
                          : 'border-[#d0d0d0] text-[#707070] hover:border-[#a0a0a0]'
                      }`}
                    >
                      Missed Payment
                    </button>
                    <button
                      onClick={() => setFlagAtRiskReason('cancellation')}
                      className={`px-4 py-3 rounded-[5px] border text-sm font-medium transition-all ${
                        flagAtRiskReason === 'cancellation'
                          ? 'border-[#005851] bg-[#daf3f0] text-[#005851] ring-1 ring-[#005851]/30'
                          : 'border-[#d0d0d0] text-[#707070] hover:border-[#a0a0a0]'
                      }`}
                    >
                      Cancellation
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSubmitFlagAtRisk}
                  disabled={!flagAtRiskPolicyId || flagAtRiskLoading}
                  className="w-full px-4 py-3 bg-[#44bbaa] hover:bg-[#005751] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2"
                >
                  {flagAtRiskLoading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Creating Alert...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Flag At Risk &amp; Start Outreach
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inline style for the toast animation */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translate(-50%, 4px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.15s ease-out;
        }
      `}</style>
    </div>
  );
}

