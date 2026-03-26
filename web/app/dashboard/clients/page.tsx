'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  updateDoc,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';
import ClientDetailModal from '../../../components/ClientDetailModal';
import ApplicationUpload from '../../../components/ApplicationUpload';
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
  getAnniversaryDate,
  daysUntilAnniversary,
} from '../../../lib/policyUtils';
import { isTimeoutError, withTimeout } from '../../../lib/timeout';
import { captureEvent } from '../../../lib/posthog';
import { ANALYTICS_EVENTS } from '../../../lib/analytics-events';

// ─── Constants ─────────────────────────────────────────────

const POLICY_TYPES = ['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other'];
const POLICY_STATUSES = ['Active', 'Pending', 'Lapsed'];
const CLIENT_APP_URL = 'https://agentforlife.app/app';
const MAX_IMPORT_ROWS = 400;
const IMPORT_BATCH_SIZE = 50;
const IMPORT_PARSE_TIMEOUT_MS = 120_000;
const JOB_POLL_INTERVAL_MS = 1500;
const MIN_IMPORT_ROW_QUALITY_RATIO = 0.65;
const MIN_APPLICATION_POLICY_SIGNALS = 2;
const DEFAULT_BULK_PDF_CONCURRENCY = 5;
const MAX_BULK_PDF_CONCURRENCY = 6;
const BULK_GCS_UPLOAD_TIMEOUT_MS = 120_000;
const BULK_PARSE_MAX_RETRIES = 2;
const DEFAULT_WELCOME_SMS_TEMPLATE =
  'Hey {{firstName}}! {{agentName}} here. Download the AgentForLife app and use code {{code}} to connect with me. https://agentforlife.app/app';
const DEFAULT_INTRO_TEMPLATE =
  "Hey {{firstName}}, I wanted to do something for you so I put together a free app showing your policies and also a button to reach me anytime. After you download, your code {{code}} will let you in — also say yes to push notifications so I can keep you in the loop on anything important. Download here: https://agentforlife.app/app Looking forward to talking soon! — {{agentName}}";
import { KNOWN_CARRIER_NAMES } from '../../../lib/carriers';

const KNOWN_CARRIERS = KNOWN_CARRIER_NAMES;

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

function isRetryableBulkImportError(error: unknown): boolean {
  if (isTimeoutError(error)) return true;
  if (error instanceof BulkImportRetryableError) {
    return error.retryable && !error.terminal;
  }
  return false;
}

// ─── Interfaces ────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  clientCode?: string;
  dateOfBirth?: string;
  pushToken?: string;
  createdAt: Timestamp;
  agentId: string;
  sourceReferralId?: string;
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

interface AnniversaryAlert {
  clientName: string;
  clientId: string;
  policy: Policy;
  anniversaryDate: Date;
}

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

interface PendingSinglePdfCreation {
  clientInfo: { name: string; email: string; phone: string; dateOfBirth: string };
  appData: ExtractedApplicationData;
  clientCode: string;
}

type ImportSourceType = 'local';
type ImportFileType = 'pdf' | 'spreadsheet' | 'text' | 'unknown';
type ImportFileState = 'queued' | 'parsing' | 'succeeded' | 'failed';

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
}

function countPolicySignals(row: ImportRow): number {
  let signals = 0;
  if (row.policyNumber?.trim()) signals++;
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
  if (data.policyNumber) mapped.policyNumber = data.policyNumber;
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

// ─── Component ─────────────────────────────────────────────

export default function ClientsPage() {
  const { user, agentProfile, loading, dismissTip } = useDashboard();

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
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', dateOfBirth: '' });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isClientUploadModalOpen, setIsClientUploadModalOpen] = useState(false);
  const [pendingClientApplicationData, setPendingClientApplicationData] = useState<ExtractedApplicationData | null>(null);
  const [pendingSinglePdfCreation, setPendingSinglePdfCreation] = useState<PendingSinglePdfCreation | null>(null);
  const [showSinglePdfSmsConfirm, setShowSinglePdfSmsConfirm] = useState(false);
  const [singlePdfSmsDraft, setSinglePdfSmsDraft] = useState('');

  // ── Import state ──
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [importError, setImportError] = useState('');
  const [importWarning, setImportWarning] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importSuccess, setImportSuccess] = useState('');
  const [importFileStatuses, setImportFileStatuses] = useState<ImportFileStatus[]>([]);
  const [importSessionStartedAt, setImportSessionStartedAt] = useState<number | null>(null);
  const [importDragActive, setImportDragActive] = useState(false);
  const [justImportedClients, setJustImportedClients] = useState<{ clientId: string; phone: string; firstName: string; clientCode: string }[]>([]);
  const [introMessage, setIntroMessage] = useState(DEFAULT_INTRO_TEMPLATE);
  const [sendingIntro, setSendingIntro] = useState(false);
  const [introSentCount, setIntroSentCount] = useState<number | null>(null);
  const [selectedIntroClients, setSelectedIntroClients] = useState<Set<string>>(new Set());
  const [showIntroConfirm, setShowIntroConfirm] = useState(false);

  // ── Anniversary alerts ──
  const [anniversaryAlerts, setAnniversaryAlerts] = useState<AnniversaryAlert[]>([]);
  const [anniversaryDismissed, setAnniversaryDismissed] = useState(false);

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
  const importModalScrollRef = useRef<HTMLDivElement>(null);
  const emptyClientsStateTrackedRef = useRef(false);
  const emptyClientSearchTrackedRef = useRef<string | null>(null);
  const welcomeSmsTemplate = (agentProfile.welcomeSmsTemplate || '').trim() || DEFAULT_WELCOME_SMS_TEMPLATE;
  const shouldPromptBeforeSinglePdfWelcomeSms = !(agentProfile.skipWelcomeSmsConfirmation ?? false);

  const buildWelcomeSms = useCallback((firstName: string, code: string) => {
    const agentName = (agentProfile.name || 'your agent').trim() || 'your agent';
    return applyWelcomeTemplate(welcomeSmsTemplate, { firstName, code, agentName });
  }, [agentProfile.name, welcomeSmsTemplate]);

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

  // Fetch policy counts across all clients for anniversary detection
  useEffect(() => {
    if (!user || clients.length === 0) {
      setAnniversaryAlerts([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const token = await user.getIdToken();
        const allAlerts: AnniversaryAlert[] = [];

        await Promise.all(
          clients.map(async (client) => {
            try {
              const res = await fetch(`/api/policies?clientId=${client.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) return;
              const { policies: data } = await res.json();
              (data as Policy[]).forEach((p) => {
                const annivDate = getAnniversaryDate(p.createdAt, p.effectiveDate);
                if (annivDate) {
                  allAlerts.push({
                    clientName: client.name,
                    clientId: client.id,
                    policy: p,
                    anniversaryDate: annivDate,
                  });
                }
              });
            } catch {
              // skip this client on error
            }
          })
        );

        if (!cancelled) {
          setAnniversaryAlerts(
            allAlerts.sort((a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime())
          );
        }
      } catch {
        // ignore
      }
    })();

    return () => { cancelled = true; };
  }, [user, clients]);

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
        const aT = a.createdAt?.toMillis?.() ?? 0;
        const bT = b.createdAt?.toMillis?.() ?? 0;
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

  const handleOpenModal = useCallback(() => {
    setEditingClient(null);
    setFormData({ name: '', email: '', phone: '', dateOfBirth: '' });
    setFormError('');
    setFormSuccess('');
    setPendingClientApplicationData(null);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingClient(null);
    setFormData({ name: '', email: '', phone: '', dateOfBirth: '' });
    setFormError('');
    setFormSuccess('');
    setPendingClientApplicationData(null);
  }, []);

  const handleEditClient = useCallback((client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      dateOfBirth: client.dateOfBirth || '',
    });
    setFormError('');
    setFormSuccess('');
    setIsModalOpen(true);
  }, []);

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
      if (editingClient) {
        await updateDoc(doc(db, 'agents', user.uid, 'clients', editingClient.id), {
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          dateOfBirth: formData.dateOfBirth || null,
        });
        // Update the selected client if it's the one being edited
        if (selectedClient?.id === editingClient.id) {
          setSelectedClient((prev) =>
            prev ? { ...prev, name: formData.name.trim(), email: formData.email.trim(), phone: formData.phone.trim() } : null
          );
        }
        setFormSuccess('Client updated!');
        setTimeout(() => handleCloseModal(), 800);
      } else {
        const code = generateClientCode();
        const newClient: Record<string, unknown> = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          clientCode: code,
          agentId: user.uid,
          createdAt: serverTimestamp(),
        };
        if (formData.dateOfBirth) newClient.dateOfBirth = formData.dateOfBirth;
        const docRef = await addDoc(collection(db, 'agents', user.uid, 'clients'), newClient);
        captureEvent(ANALYTICS_EVENTS.CLIENT_ADDED, { method: 'manual' });

        setFormSuccess('Client added!');

        // Mirror to top-level collections for the mobile app (non-blocking)
        try {
          await Promise.all([
            setDoc(doc(db, 'clients', docRef.id), {
              name: formData.name.trim(),
              email: formData.email.trim(),
              phone: formData.phone.trim(),
              clientCode: code,
              agentId: user.uid,
              createdAt: serverTimestamp(),
            }),
            setDoc(doc(db, 'clientCodes', code), { agentId: user.uid, clientId: docRef.id }),
          ]);
        } catch (mirrorErr) {
          console.error('Top-level client mirror failed (non-blocking):', mirrorErr);
        }

        // Auto-send welcome text with code via Linq if client has a phone
        if (formData.phone.trim()) {
          const firstName = formData.name.trim().split(' ')[0];
          const welcomeText = buildWelcomeSms(firstName, code);
          try {
            const token = await user.getIdToken();
            await fetch('/api/client/welcome-sms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                clientPhone: formData.phone.trim(),
                message: welcomeText,
              }),
            });
          } catch (smsErr) {
            console.error('Auto-text failed (non-blocking):', smsErr);
          }

          // Auto-match referral by phone (non-blocking)
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

        // If there's pending application data, auto-create the policy
        if (pendingClientApplicationData) {
          const mapped = mapExtractedApplicationToPolicyFormData(pendingClientApplicationData);
          const policyData: Record<string, unknown> = {
            policyType: mapped.policyType || '',
            policyNumber: mapped.policyNumber || '',
            insuranceCompany: mapped.insuranceCompany === 'Other' ? (mapped.otherCarrier || '') : (mapped.insuranceCompany || ''),
            policyOwner: mapped.policyOwner || formData.name.trim(),
            beneficiaries: mapped.beneficiaries || [],
            coverageAmount: mapped.coverageAmount ? parseFloat(mapped.coverageAmount) : 0,
            premiumAmount: mapped.premiumAmount ? parseFloat(mapped.premiumAmount) : 0,
            premiumFrequency: mapped.premiumFrequency || 'monthly',
            renewalDate: mapped.renewalDate || '',
            effectiveDate: mapped.effectiveDate || null,
            status: 'Active',
          };
          const token = await user.getIdToken();
          await apiCreatePolicy(token, docRef.id, policyData);
          refreshSummaries();
        }

        setTimeout(() => handleCloseModal(), 800);
      }
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
  }, [user, formData, editingClient, selectedClient, pendingClientApplicationData, handleCloseModal, buildWelcomeSms]);

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

  const handleOpenPolicyModal = useCallback(() => {
    setEditingPolicy(null);
    setPolicyFormData({ ...emptyPolicyForm });
    setPolicyFormError('');
    setPolicyFormSuccess('');
    setIsPolicyModalOpen(true);
  }, []);

  const handleClosePolicyModal = useCallback(() => {
    setIsPolicyModalOpen(false);
    setEditingPolicy(null);
    setPolicyFormData({ ...emptyPolicyForm });
    setPolicyFormError('');
    setPolicyFormSuccess('');
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
        policyNumber: policyFormData.policyNumber.trim(),
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

  const handleApplicationExtracted = useCallback((data: ExtractedApplicationData) => {
    setIsUploadModalOpen(false);
    const mapped = mapExtractedApplicationToPolicyFormData(data);
    setPolicyFormData((prev) => ({ ...prev, ...mapped }));
    setIsPolicyModalOpen(true);
  }, []);

  const handleClientApplicationExtracted = useCallback((data: ExtractedApplicationData) => {
    setIsClientUploadModalOpen(false);
    setPendingClientApplicationData(data);
    setFormData((prev) => ({
      ...prev,
      name: data.insuredName || prev.name,
      email: data.insuredEmail || prev.email,
      phone: data.insuredPhone || prev.phone,
      dateOfBirth: data.insuredDateOfBirth || prev.dateOfBirth,
    }));
  }, []);

  const executeCreateClientAndPolicy = useCallback(async (
    payload: PendingSinglePdfCreation,
    welcomeMessageOverride?: string,
  ) => {
    if (!user || !payload.clientInfo.name.trim()) return;
    const { clientInfo, appData, clientCode } = payload;
    setIsClientUploadModalOpen(false);
    setSubmitting(true);
    setFormError('');

    try {
      const newClient: Record<string, unknown> = {
        name: clientInfo.name.trim(),
        email: clientInfo.email.trim(),
        phone: clientInfo.phone.trim(),
        clientCode,
        agentId: user.uid,
        createdAt: serverTimestamp(),
      };
      if (clientInfo.dateOfBirth) newClient.dateOfBirth = clientInfo.dateOfBirth;

      const docRef = await addDoc(collection(db, 'agents', user.uid, 'clients'), newClient);
      captureEvent(ANALYTICS_EVENTS.CLIENT_ADDED, { method: 'pdf_parse' });

      // Mirror to top-level collections for the mobile app (non-blocking)
      try {
        await Promise.all([
          setDoc(doc(db, 'clients', docRef.id), {
            name: clientInfo.name.trim(),
            email: clientInfo.email.trim(),
            phone: clientInfo.phone.trim(),
            clientCode,
            agentId: user.uid,
            createdAt: serverTimestamp(),
          }),
          setDoc(doc(db, 'clientCodes', clientCode), { agentId: user.uid, clientId: docRef.id }),
        ]);
      } catch (mirrorErr) {
        console.error('Top-level client mirror failed (non-blocking):', mirrorErr);
      }

      // Auto-send welcome text with code if client has a phone
      if (clientInfo.phone.trim()) {
        const firstName = clientInfo.name.trim().split(' ')[0];
        const welcomeText = (welcomeMessageOverride || '').trim() || buildWelcomeSms(firstName, clientCode);
        try {
          const token = await user.getIdToken();
          await fetch('/api/client/welcome-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ clientPhone: clientInfo.phone.trim(), message: welcomeText }),
          });
        } catch (smsErr) {
          console.error('Auto-text failed (non-blocking):', smsErr);
        }
      }

      // Create the policy from the extracted data
      const mapped = mapExtractedApplicationToPolicyFormData(appData);
      const policySignalCount = [
        mapped.policyType,
        mapped.policyNumber,
        mapped.insuranceCompany === 'Other' ? mapped.otherCarrier : mapped.insuranceCompany,
        mapped.coverageAmount,
        mapped.premiumAmount,
      ].filter((v) => !!String(v || '').trim()).length;

      if (policySignalCount < MIN_APPLICATION_POLICY_SIGNALS) {
        setFormError('Client was created, but extracted policy data looked incomplete. Please review and add the policy manually.');
        return;
      }

      const policyData: Record<string, unknown> = {
        policyType: mapped.policyType || '',
        policyNumber: mapped.policyNumber || '',
        insuranceCompany: mapped.insuranceCompany === 'Other' ? (mapped.otherCarrier || '') : (mapped.insuranceCompany || ''),
        policyOwner: mapped.policyOwner || clientInfo.name.trim(),
        beneficiaries: mapped.beneficiaries || [],
        coverageAmount: mapped.coverageAmount ? parseFloat(mapped.coverageAmount) : 0,
        premiumAmount: mapped.premiumAmount ? parseFloat(mapped.premiumAmount) : 0,
        premiumFrequency: mapped.premiumFrequency || 'monthly',
        renewalDate: mapped.renewalDate || '',
        effectiveDate: mapped.effectiveDate || null,
        status: 'Active',
        ingestionQualityGate: true,
      };

      const policyToken = await user.getIdToken();
      await apiCreatePolicy(policyToken, docRef.id, policyData);

      // Re-fetch summaries from the server now that the policy is confirmed created
      refreshSummaries();

      setFormSuccess('Client & policy created!');
      setTimeout(() => setFormSuccess(''), 3000);
    } catch (err) {
      console.error('Error creating client & policy:', err);
      setFormError('Client was created, but the policy could not be saved. Open the client and add the policy manually.');
    } finally {
      setSubmitting(false);
      setPendingSinglePdfCreation(null);
      setShowSinglePdfSmsConfirm(false);
    }
  }, [user, refreshSummaries, buildWelcomeSms]);

  const handleCreateClientAndPolicy = useCallback(async (
    clientInfo: { name: string; email: string; phone: string; dateOfBirth: string },
    appData: ExtractedApplicationData,
  ) => {
    if (!user || !clientInfo.name.trim()) return;

    const payload: PendingSinglePdfCreation = {
      clientInfo,
      appData,
      clientCode: generateClientCode(),
    };

    if (clientInfo.phone.trim() && shouldPromptBeforeSinglePdfWelcomeSms) {
      const firstName = clientInfo.name.trim().split(' ')[0];
      setSinglePdfSmsDraft(buildWelcomeSms(firstName, payload.clientCode));
      setPendingSinglePdfCreation(payload);
      setShowSinglePdfSmsConfirm(true);
      return;
    }

    await executeCreateClientAndPolicy(payload);
  }, [user, shouldPromptBeforeSinglePdfWelcomeSms, buildWelcomeSms, executeCreateClientAndPolicy]);

  const handleConfirmSinglePdfCreate = useCallback(async () => {
    if (!pendingSinglePdfCreation) return;
    await executeCreateClientAndPolicy(pendingSinglePdfCreation, singlePdfSmsDraft);
  }, [pendingSinglePdfCreation, singlePdfSmsDraft, executeCreateClientAndPolicy]);

  // ─── BOB Import Handlers ─────────────────────────────────

  const [parsingBob, setParsingBob] = useState(false);
  const bulkPdfConcurrencyLimit = getBulkPdfConcurrencyLimit();

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
    const policyNumIdx = match(['policy number', 'policy no', 'policy num', 'policynumber', 'certificate number']);
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
        policyNumber: policyNumIdx !== -1 ? (cols[policyNumIdx] || '') : '',
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

  const parseBobSourceFile = useCallback(async (file: File): Promise<{ rows: ImportRow[]; note?: string }> => {
    if (!user) {
      throw new Error('You must be signed in to import files.');
    }

    const token = await user.getIdToken();
    const signedRes = await fetch('/api/ingestion/v3/upload-url', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        fileSize: file.size,
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
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
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
        fileName: file.name,
        contentType: file.type || undefined,
        idempotencyKey: `bob-v3:${file.name}:${file.size}:${file.lastModified}`,
      }),
    });
    const created = (await createRes.json()) as IngestionV3SubmitJobResponse;
    if (!createRes.ok || !created.success || !created.jobId) {
      throw new Error(created.error?.message || `Failed to start parse job (${createRes.status}).`);
    }

    let parsedRows: ImportRow[] | null = null;
    let parsedNote: string | undefined;
    const startedAt = Date.now();

    while (Date.now() - startedAt < IMPORT_PARSE_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, JOB_POLL_INTERVAL_MS));
      const statusRes = await fetch(`/api/ingestion/v3/jobs/${created.jobId}`, { cache: 'no-store' });
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
        parsedRows = v3Rows.map((row) => ({
          name: [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || row.firstName || row.lastName || '',
          owner: '',
          email: row.email || '',
          phone: row.phone || '',
          dateOfBirth: row.dateOfBirth || '',
          policyNumber: row.policyNumber || '',
          carrier: row.carrier || '',
          policyType: row.policyType || '',
          effectiveDate: '',
          premium: row.premiumAmount != null ? String(row.premiumAmount) : '',
          coverageAmount: row.coverageAmount != null ? String(row.coverageAmount) : '',
          status: 'Active',
          premiumFrequency: undefined,
        }));
        parsedNote = statusBody.job.result?.bob?.note;
        break;
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

    if (!parsedRows) {
      throw new BulkImportRetryableError('Parsing timed out. Please retry this file.', {
        retryable: true,
        terminal: false,
      });
    }

    return { rows: parsedRows, note: parsedNote };
  }, [user]);

  const getImportFileType = useCallback((file: File): ImportFileType => {
    const name = file.name.toLowerCase();
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'spreadsheet';
    if (name.endsWith('.csv') || name.endsWith('.tsv') || file.type.startsWith('text/')) return 'text';
    return 'unknown';
  }, []);

  const updateImportFileStatus = useCallback((sourceFileId: string, patch: Partial<ImportFileStatus>) => {
    setImportFileStatuses((prev) =>
      prev.map((status) => (status.sourceFileId === sourceFileId ? { ...status, ...patch } : status)),
    );
  }, []);

  const processImportSources = useCallback(async (sources: ImportSourceFile[]) => {
    if (!user || sources.length === 0) return;

    const startedAt = Date.now();
    setParsingBob(true);
    setImportError('');
    setImportWarning('');
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

    const bumpProgress = () => {
      completed += 1;
      setImportProgress(Math.round((completed / sources.length) * 100));
    };

    const processSingleSource = async (source: ImportSourceFile) => {
      updateImportFileStatus(source.sourceFileId, { state: 'parsing', error: undefined });
      let retryAttemptCount = 0;
      try {
        let parsedRows: ImportRow[] = [];
        let parsedNote: string | undefined;

        if (source.fileType === 'pdf' || source.fileType === 'spreadsheet' || source.fileType === 'text') {
          let attempt = 0;
          while (true) {
            try {
              const result = await parseBobSourceFile(source.file);
              parsedRows = result.rows;
              parsedNote = result.note;
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
          warnings.push(
            `${source.file.name}: ${quality.rejected} row${quality.rejected !== 1 ? 's were' : ' was'} skipped due to low-confidence policy data.`,
          );
        }
        if (parsedNote) {
          warnings.push(`${source.file.name}: ${parsedNote}`);
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

    if (warnings.length > 0) {
      setImportWarning(`Warning: ${warnings.join(' ')}`);
    }

    if (parsedFiles === 0) {
      setImportError('No valid rows found. Please review your files and try again.');
    } else if (failedFiles > 0) {
      setImportError(`${parsedFiles} of ${sources.length} file${sources.length !== 1 ? 's parsed' : ' parsed'} successfully. Review failed files below and retry them.`);
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
  }, [bulkPdfConcurrencyLimit, parseBobSourceFile, parseSingleCsv, updateImportFileStatus, user]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const sources: ImportSourceFile[] = Array.from(files).map((file, idx) => ({
      sourceType: 'local',
      sourceFileId: `local:${file.name}:${file.size}:${file.lastModified}:${idx}`,
      file,
      fileType: getImportFileType(file),
    }));
    await processImportSources(sources);

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [getImportFileType, processImportSources]);

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
    await processImportSources(sources);
  }, [getImportFileType, processImportSources]);

  const handleImportClients = useCallback(async () => {
    if (!user || importData.length === 0) return;
    if (importData.length > MAX_IMPORT_ROWS) {
      setImportError(`Maximum ${MAX_IMPORT_ROWS} clients per import. Split your file or import in multiple runs.`);
      return;
    }
    const preflight = filterHighQualityImportRows(importData);
    if (preflight.accepted.length !== importData.length) {
      setImportError('Some rows no longer meet quality checks. Please re-upload and review before importing.');
      return;
    }
    setImporting(true);
    setImportProgress(0);
    setImportError('');
    setImportWarning('');
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
      setImportWarning('');
      if (policyCount > 0) refreshSummaries();
    } catch (err) {
      console.error('Error importing clients:', err);
      setImportError(err instanceof Error ? err.message : 'Failed to import some records. Please try again.');
    } finally {
      setImporting(false);
    }
  }, [user, importData, importSessionStartedAt, refreshSummaries]);

  useEffect(() => {
    if (importSuccess && importModalScrollRef.current) {
      importModalScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [importSuccess]);

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
      setImportError(err instanceof Error ? err.message : 'Failed to send intro messages.');
    } finally {
      setSendingIntro(false);
    }
  }, [user, justImportedClients, introMessage, selectedIntroClients]);

  // ─── Share Code Handler ──────────────────────────────────

  const handleShareCode = useCallback(async (client: Client) => {
    const firstName = client.name.split(' ')[0];
    const message = `Hey ${firstName}! Download the AgentForLife app and use code ${client.clientCode} to connect with me. ${CLIENT_APP_URL}`;
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
  }, []);

  // ─── Loading State ───────────────────────────────────────

  if (loading) return null;

  // ─── Render ──────────────────────────────────────────────

  return (
    <div>
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

      {/* Anniversary Alert Banner */}
      {anniversaryAlerts.length > 0 && !anniversaryDismissed && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-[5px] p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-amber-100 rounded-[5px] flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-amber-900">Policy Anniversaries Coming Up</h3>
                <div className="mt-2 space-y-1">
                  {anniversaryAlerts.slice(0, 5).map((alert, i) => {
                    const days = daysUntilAnniversary(alert.anniversaryDate);
                    return (
                      <p key={i} className="text-sm text-amber-800">
                        <span className="font-medium">{alert.clientName}</span>
                        {' — '}
                        {alert.policy.policyType}
                        {' — '}
                        {days === 0 ? '1-year anniversary is today' : days === 1 ? '1-year anniversary tomorrow' : `1-year anniversary in ${days} days`}
                      </p>
                    );
                  })}
                  {anniversaryAlerts.length > 5 && (
                    <p className="text-xs text-amber-600">+{anniversaryAlerts.length - 5} more</p>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => setAnniversaryDismissed(true)}
              className="text-amber-400 hover:text-amber-600 transition-colors shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenModal}
            className="px-4 py-2.5 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors flex items-center gap-2 text-sm"
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
              setImportError('');
              setImportWarning('');
              setImportSuccess('');
              setImportProgress(0);
              setImportFileStatuses([]);
              setImportSessionStartedAt(null);
              setJustImportedClients([]);
              setIntroMessage(DEFAULT_INTRO_TEMPLATE);
              setIntroSentCount(null);
            }}
            className="px-4 py-2.5 bg-white hover:bg-gray-50 text-[#000000] font-semibold rounded-[5px] border border-[#d0d0d0] transition-colors flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import Book of Business
          </button>
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
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] placeholder-[#707070] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
          />
        </div>
      </div>

      {/* Client Table */}
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
        <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-12 text-center">
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
        <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-12 text-center">
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
        <div className="bg-white rounded-[5px] border border-[#d0d0d0] overflow-hidden">
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
                          <span className="text-sm font-medium text-[#000000] block truncate">{client.name}</span>
                          <span className="text-xs text-[#a0a0a0] truncate block">{client.email || client.phone || ''}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-[#707070]">
                      {client.createdAt?.toDate ? client.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
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

      {/* ═══════════════════════════════════════════════════════
          MODALS
          ═══════════════════════════════════════════════════════ */}

      {/* ── Add/Edit Client Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCloseModal} />
          <div className="relative w-full max-w-md bg-white rounded-[5px] border border-gray-200 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-[#000000]">
                {editingClient ? 'Edit Client' : 'Add Client'}
              </h3>
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
              {/* PDF Upload option for new clients */}
              {!editingClient && !pendingClientApplicationData && (
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={() => setIsClientUploadModalOpen(true)}
                    className="w-full px-4 py-3 border-2 border-dashed border-[#45bcaa]/40 hover:border-[#45bcaa] bg-[#daf3f0]/30 hover:bg-[#daf3f0]/60 rounded-[5px] text-sm font-medium text-[#005851] transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload Application PDF to Auto-Fill
                  </button>
                </div>
              )}

              {pendingClientApplicationData && (
                <div className="flex items-center gap-2 px-3 py-2 bg-[#daf3f0] border border-[#45bcaa]/30 rounded-[5px] text-xs text-[#005851]">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Application data extracted! A policy will be auto-created.</span>
                </div>
              )}

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
                  ) : editingClient ? (
                    'Update Client'
                  ) : (
                    'Add Client'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Import Clients Modal ── */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !importing && !parsingBob && setIsImportModalOpen(false)}
          />
          <div
            ref={importModalScrollRef}
            className="relative w-full max-w-lg bg-white rounded-[5px] border border-gray-200 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold text-[#000000]">Import Book of Business</h3>
              <button
                onClick={() => !importing && !parsingBob && setIsImportModalOpen(false)}
                className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {importSuccess ? (
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
              ) : (
                <>
                  <div className="bg-[#f8f8f8] border border-[#d0d0d0] rounded-[5px] p-4">
                    <p className="text-sm font-semibold text-[#000000] mb-1.5">What you&apos;ll need</p>
                    <p className="text-sm text-[#707070] mb-2">
                      Upload a file from your carrier portal, CRM, or a spreadsheet. We accept CSV, TSV, Excel, and PDF exports from any carrier.
                      Column names are matched automatically — the only required field is <span className="font-semibold text-[#000000]">Name</span>.
                      Clients with multiple policies are automatically grouped. Policies are created for rows that have policy data.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { col: 'Name', required: true },
                        { col: 'Owner', required: false },
                        { col: 'Phone', required: false },
                        { col: 'Email', required: false },
                        { col: 'DOB', required: false },
                        { col: 'Policy Number', required: false },
                        { col: 'Carrier', required: false },
                        { col: 'Policy Type', required: false },
                        { col: 'Effective Date', required: false },
                        { col: 'Premium', required: false },
                        { col: 'Coverage Amount', required: false },
                        { col: 'Status', required: false },
                      ].map(({ col, required }) => (
                        <span key={col} className={`px-2 py-0.5 rounded text-[10px] font-medium ${required ? 'bg-[#daf3f0] text-[#005851] border border-[#45bcaa]/30' : 'bg-white border border-[#d0d0d0] text-[#707070]'}`}>{col}{required ? ' *' : ''}</span>
                      ))}
                    </div>
                    <p className="text-[10px] text-[#999999] mt-1.5">Works with any carrier format — Mutual of Omaha, United of Omaha, and more. Column names are matched automatically.</p>
                    <p className="text-xs text-[#005851] mt-2.5 font-medium">After import, you&apos;ll be able to have the system text your clients the app download link and their unique code.</p>
                  </div>

                  <div
                    onDrop={handleImportDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setImportDragActive(true);
                    }}
                    onDragLeave={() => setImportDragActive(false)}
                    className={`rounded-[5px] border-2 border-dashed p-4 transition-colors ${
                      importDragActive
                        ? 'border-[#45bcaa] bg-[#daf3f0]/40'
                        : 'border-[#d0d0d0] bg-white'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.tsv,.xlsx,.xls,.pdf,text/csv,text/tab-separated-values,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      multiple
                      onChange={handleFileUpload}
                      className="block w-full text-sm text-[#707070] file:mr-4 file:py-2 file:px-4 file:rounded-[5px] file:border-0 file:text-sm file:font-semibold file:bg-[#daf3f0] file:text-[#005851] hover:file:bg-[#c0ebe4] cursor-pointer"
                    />
                    <p className="text-xs text-[#707070] mt-1.5">Accepts CSV, TSV, Excel (.xlsx), and PDF files. Select or drop 20-30 files at once.</p>
                  </div>

                  {importFileStatuses.length > 0 && (
                    <div className="border border-[#d0d0d0] rounded-[5px] overflow-hidden">
                      <div className="bg-[#f8f8f8] px-4 py-2 border-b border-[#d0d0d0] flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#707070]">File Processing</p>
                        <p className="text-[11px] text-[#707070]">
                          {importFileStatuses.filter((s) => s.state === 'succeeded').length} succeeded · {importFileStatuses.filter((s) => s.state === 'failed').length} failed · {importFileStatuses.filter((s) => s.state === 'parsing').length} parsing
                        </p>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-[#f0f0f0]">
                        {importFileStatuses.map((status) => (
                          <div key={status.sourceFileId} className="px-4 py-2 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[#000000] truncate">{status.name}</p>
                              {status.error ? (
                                <p className="text-[11px] text-red-600 truncate">{status.error}</p>
                              ) : (
                                <p className="text-[11px] text-[#707070]">
                                  {status.loadedRows > 0 ? `${status.loadedRows} rows loaded` : 'Awaiting parse'}
                                  {status.rejectedRows > 0 ? ` · ${status.rejectedRows} skipped` : ''}
                                </p>
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
                              {status.state}
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
                      <p className="text-xs text-[#707070] text-center">{importProgress}% processing files</p>
                    </div>
                  )}

                  {importError && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-[5px] text-xs text-red-600">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {importError}
                    </div>
                  )}
                  {importWarning && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-[5px] text-xs text-amber-700">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {importWarning}
                    </div>
                  )}

                  {importData.length > 0 && (
                    <>
                      {/* Summary of detected fields */}
                      {(() => {
                        const withPolicy = importData.filter(r => r.policyNumber || r.carrier || r.policyType || r.premium || r.coverageAmount).length;
                        const withEffDate = importData.filter(r => r.effectiveDate).length;
                        return (
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
                        );
                      })()}

                      <div className="border border-[#d0d0d0] rounded-[5px] overflow-hidden">
                        <div className="bg-[#f8f8f8] px-4 py-2 border-b border-[#d0d0d0]">
                          <p className="text-xs font-semibold text-[#707070]">
                            Preview ({importData.length} row{importData.length !== 1 ? 's' : ''})
                          </p>
                        </div>
                        <div className="max-h-72 overflow-y-auto divide-y divide-[#f0f0f0]">
                          {importData.slice(0, 50).map((row, i) => {
                            const hasPolicy = row.policyNumber || row.carrier || row.policyType;
                            return (
                              <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                                <span className="text-xs text-[#707070] w-6 pt-0.5 shrink-0">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-[#000000] truncate">{row.name}</p>
                                  <p className="text-xs text-[#707070] truncate">
                                    {[row.email, row.phone].filter(Boolean).join(' · ') || 'No contact info'}
                                  </p>
                                  {hasPolicy && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">
                                        {[row.policyType, row.carrier, row.policyNumber].filter(Boolean).join(' · ')}
                                      </span>
                                      {row.effectiveDate && (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded font-medium">
                                          Eff: {row.effectiveDate}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {importData.length > 50 && (
                            <div className="px-4 py-2 text-xs text-[#707070] text-center">
                              +{importData.length - 50} more rows
                            </div>
                          )}
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
                            setImportError('');
                            setImportWarning('');
                            setImportFileStatuses([]);
                          }}
                          disabled={importing || parsingBob}
                          className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors text-sm"
                        >
                          Clear
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
                            `Import ${importData.length} Record${importData.length !== 1 ? 's' : ''}`
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
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(true)}
                  className="w-full px-4 py-3 border-2 border-dashed border-[#0099FF]/30 hover:border-[#0099FF] bg-[#0099FF]/5 hover:bg-[#0099FF]/10 rounded-[5px] text-sm font-medium text-[#0099FF] transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Application PDF to Auto-Fill
                </button>
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

              {/* Policy Number */}
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Policy Number</label>
                <input
                  type="text"
                  value={policyFormData.policyNumber}
                  onChange={(e) => setPolicyFormData((f) => ({ ...f, policyNumber: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                  placeholder="e.g. POL-123456"
                />
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
                Are you sure you want to delete the <span className="font-semibold">{deleteConfirmPolicy.policyType}</span> policy (#{deleteConfirmPolicy.policyNumber})? This action cannot be undone.
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
          onUploadApplication={() => setIsUploadModalOpen(true)}
          onEditClient={handleEditClient}
          onFlagAtRisk={() => { refreshPolicies(); }}
          agentName={agentProfile.name}
          hasSchedulingUrl={!!agentProfile.schedulingUrl}
          clientPushToken={clientPushToken === undefined ? null : clientPushToken}
        />
      )}

      {/* ── Application Upload (for existing client / policy) ── */}
      {isUploadModalOpen && selectedClient && (
        <ApplicationUpload
          clientName={selectedClient.name}
          onExtracted={handleApplicationExtracted}
          onClose={() => setIsUploadModalOpen(false)}
        />
      )}

      {/* ── Application Upload (for new client + policy creation) ── */}
      {isClientUploadModalOpen && (
        <ApplicationUpload
          clientName="New Client"
          onExtracted={handleClientApplicationExtracted}
          onClose={() => setIsClientUploadModalOpen(false)}
          onCreateClientAndPolicy={handleCreateClientAndPolicy}
          mode="client-and-policy"
        />
      )}

      {/* ── Single PDF Welcome SMS Confirmation ── */}
      {showSinglePdfSmsConfirm && pendingSinglePdfCreation && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSinglePdfSmsConfirm(false)}
          />
          <div className="relative bg-white rounded-[5px] shadow-2xl w-full max-w-xl border border-gray-200">
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-lg font-bold text-[#000000]">Confirm Welcome Text</h3>
              <p className="text-sm text-[#707070] mt-1">
                Creating this client will send the following text message.
              </p>
            </div>
            <div className="p-5 space-y-3">
              <textarea
                value={singlePdfSmsDraft}
                onChange={(e) => setSinglePdfSmsDraft(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa] resize-y"
              />
              <p className="text-xs text-[#707070]">
                You can edit this before sending. This template can also be changed in Settings.
              </p>
            </div>
            <div className="p-5 pt-0 flex gap-3">
              <button
                onClick={() => setShowSinglePdfSmsConfirm(false)}
                disabled={submitting}
                className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors disabled:opacity-60"
              >
                Back
              </button>
              <button
                onClick={handleConfirmSinglePdfCreate}
                disabled={submitting}
                className="flex-1 py-2.5 px-4 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors disabled:opacity-60"
              >
                {submitting ? 'Creating...' : 'Create Client & Send Text'}
              </button>
            </div>
          </div>
        </div>
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
                              <p className="text-xs text-[#707070]">{p.insuranceCompany} &middot; #{p.policyNumber}</p>
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
                    <p className="text-xs text-[#707070]">{flagAtRiskPolicies[0].insuranceCompany} &middot; #{flagAtRiskPolicies[0].policyNumber}</p>
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

