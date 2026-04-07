'use client';

import { useState, useRef, useCallback, useId, useEffect } from 'react';
import type {
  Beneficiary,
  ExtractedApplicationData,
  IngestionV3JobStatusResponse,
  IngestionV3SubmitJobResponse,
} from '../lib/types';
import { isTimeoutError, withTimeout } from '../lib/timeout';

interface ApplicationUploadProps {
  clientName: string;
  /** Called when the user confirms extracted data (existing behavior for adding policy to existing client) */
  onExtracted: (data: ExtractedApplicationData) => void;
  onClose: () => void;
  /** When set, the review stage shows editable client + policy fields with a single create action */
  onCreateClientAndPolicy?: (client: { name: string; email: string; phone: string; dateOfBirth: string }, data: ExtractedApplicationData) => void;
  mode?: 'policy-only' | 'client-and-policy';
}

type Stage = 'upload' | 'processing' | 'review' | 'error';
const PARSE_TIMEOUT_MS = 120_000;
const JOB_POLL_INTERVAL_MS = 1500;
const JOB_STATUS_TIMEOUT_MS = 8_000;
const MAX_RELIABLE_APPLICATION_FILE_BYTES = 13 * 1024 * 1024;
const GCS_UPLOAD_TIMEOUT_MS = 120_000;
const POLICY_TYPE_OPTIONS: NonNullable<ExtractedApplicationData['policyType']>[] = ['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other'];
const PREMIUM_FREQUENCY_OPTIONS: NonNullable<ExtractedApplicationData['premiumFrequency']>[] = ['monthly', 'quarterly', 'semi-annual', 'annual'];

const EMPTY_POLICY_FIELDS: ExtractedApplicationData = {
  policyType: null,
  policyNumber: null,
  insuranceCompany: null,
  policyOwner: null,
  insuredName: null,
  beneficiaries: null,
  coverageAmount: null,
  premiumAmount: null,
  premiumFrequency: null,
  renewalDate: null,
  insuredEmail: null,
  insuredPhone: null,
  insuredDateOfBirth: null,
  insuredState: null,
  effectiveDate: null,
};

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = (value || '').trim();
  return trimmed ? trimmed : null;
}

function normalizeNumber(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

function normalizeBeneficiaryList(beneficiaries: Beneficiary[] | null | undefined): Beneficiary[] | null {
  if (!beneficiaries || beneficiaries.length === 0) return null;
  const normalized = beneficiaries
    .map((b) => ({
      ...b,
      name: (b.name || '').trim(),
      relationship: (b.relationship || '').trim() || undefined,
      percentage: b.percentage != null && Number.isFinite(b.percentage) ? b.percentage : undefined,
      irrevocable: b.irrevocable ?? null,
    }))
    .filter((b) => b.name);
  return normalized.length > 0 ? normalized : null;
}

function normalizeExtractedData(data: ExtractedApplicationData): ExtractedApplicationData {
  return {
    policyType: data.policyType,
    policyNumber: normalizeText(data.policyNumber),
    insuranceCompany: normalizeText(data.insuranceCompany),
    policyOwner: normalizeText(data.policyOwner),
    insuredName: normalizeText(data.insuredName),
    beneficiaries: normalizeBeneficiaryList(data.beneficiaries),
    coverageAmount: normalizeNumber(data.coverageAmount),
    premiumAmount: normalizeNumber(data.premiumAmount),
    premiumFrequency: data.premiumFrequency,
    renewalDate: normalizeText(data.renewalDate),
    insuredEmail: normalizeText(data.insuredEmail),
    insuredPhone: normalizeText(data.insuredPhone),
    insuredDateOfBirth: normalizeText(data.insuredDateOfBirth),
    insuredState: normalizeText(data.insuredState),
    effectiveDate: normalizeText(data.effectiveDate),
  };
}

export default function ApplicationUpload({ clientName, onExtracted, onClose, onCreateClientAndPolicy, mode = 'policy-only' }: ApplicationUploadProps) {
  const [stage, setStage] = useState<Stage>('upload');
  const [fileName, setFileName] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedApplicationData | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingLabel, setProcessingLabel] = useState('Preparing file...');
  const [timingSummary, setTimingSummary] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputId = useId();

  // Reset state on mount; abort in-flight requests on unmount
  useEffect(() => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      isProcessingRef.current = false;
    };
  }, []);

  // Editable client fields (only used in client-and-policy mode)
  const [clientFields, setClientFields] = useState({
    name: '',
    email: '',
    phone: '',
    dateOfBirth: '',
  });

  // Editable policy fields
  const [policyFields, setPolicyFields] = useState<ExtractedApplicationData | null>(null);

  const processFile = useCallback(async (file: File) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    // Abort any leftover requests from a previous run
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Please upload a PDF file.');
      setStage('error');
      isProcessingRef.current = false;
      return;
    }
    if (file.size > MAX_RELIABLE_APPLICATION_FILE_BYTES) {
      setErrorMessage('File is too large. Maximum size is 13MB.');
      setStage('error');
      isProcessingRef.current = false;
      return;
    }

    setFileName(file.name);
    setStage('processing');
    setProcessingProgress(5);
    setProcessingLabel('Preparing file...');
    setTimingSummary(null);

    try {
      const runId = `pre-fix:${Date.now()}`;
      // #region agent log
      fetch('http://127.0.0.1:7412/ingest/09931433-2034-41d9-90f4-26d8a7253b3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'abd57d'},body:JSON.stringify({sessionId:'abd57d',runId,hypothesisId:'H3-H5',location:'ApplicationUpload.tsx:processFile:start',message:'upload_process_started',data:{fileName:file.name,fileSize:file.size,fileType:file.type||null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setProcessingLabel('Uploading file...');
      const stopUploadProgress = startAutoProgress(setProcessingProgress, 10, 35, 2, 700);
      let gcsPath: string;
      try {
        const signedRes = await fetch('/api/ingestion/v3/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || 'application/pdf',
            fileSize: file.size,
            purpose: 'application',
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

        // GCS PUT can fail transiently (TypeError: Failed to fetch).
        // Retry up to 2 times since PUT to a signed URL is idempotent.
        let lastPutError: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await withTimeout(
              fetch(signedBody.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || 'application/pdf' },
                signal: controller.signal,
                body: file,
              }).then((res) => {
                if (!res.ok) {
                  return res.text().then((bodyText) => {
                    // #region agent log
                    fetch('http://127.0.0.1:7412/ingest/09931433-2034-41d9-90f4-26d8a7253b3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'abd57d'},body:JSON.stringify({sessionId:'abd57d',runId:'pre-fix',hypothesisId:'H10-H13',location:'ApplicationUpload.tsx:processFile:gcs-put-non-ok',message:'gcs_upload_put_non_ok',data:{status:res.status,statusText:res.statusText,bodySnippet:bodyText.slice(0,240)},timestamp:Date.now()})}).catch(()=>{});
                    // #endregion
                    throw new Error(`Upload failed (${res.status}). ${bodyText.slice(0, 200)}`);
                  });
                }
                return undefined;
              }),
              GCS_UPLOAD_TIMEOUT_MS,
              'Upload timed out while sending file.',
            );
            lastPutError = null;
            break;
          } catch (err) {
            lastPutError = err;
            // Don't retry if aborted or timed out
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            if (isTimeoutError(err)) throw err;
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            }
          }
        }
        if (lastPutError) throw lastPutError;

        gcsPath = signedBody.gcsPath;
      } finally {
        stopUploadProgress();
      }

      setProcessingLabel('Queueing parser...');
      setProcessingProgress((p) => Math.max(p, 40));
      const createRes = await fetch('/api/ingestion/v3/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: 'application',
          gcsPath,
          fileName: file.name,
          contentType: file.type || 'application/pdf',
          idempotencyKey: `application-v3:${file.name}:${file.size}:${file.lastModified}`,
        }),
      });
      const created = (await createRes.json()) as IngestionV3SubmitJobResponse;
      if (!createRes.ok || !created.success || !created.jobId) {
        throw new Error(created.error?.message || `Failed to start parsing job (${createRes.status}).`);
      }

      const startedAt = Date.now();
      let parsedData: ExtractedApplicationData | null = null;
      let parsedNote: string | null = null;
      while (Date.now() - startedAt < PARSE_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, JOB_POLL_INTERVAL_MS));

        const statusRes = await fetch(`/api/ingestion/v3/jobs/${created.jobId}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const statusBody = (await statusRes.json()) as IngestionV3JobStatusResponse;
        if (!statusRes.ok || !statusBody.success || !statusBody.job) {
          throw new Error(statusBody.error?.message || `Failed to check parsing status (${statusRes.status}).`);
        }

        if (statusBody.job.status === 'review_ready' || statusBody.job.status === 'saved') {
          parsedData = statusBody.job.result?.application?.data || null;
          parsedNote = statusBody.job.result?.application?.note || null;
          const metrics = statusBody.job.metrics;
          if (metrics?.totalMs != null) {
            const totalSec = (metrics.totalMs / 1000).toFixed(1);
            const sourceSec = ((metrics.sourceFetchMs || 0) / 1000).toFixed(1);
            const extractSec = ((metrics.extractionMs || 0) / 1000).toFixed(1);
            const validateSec = ((metrics.validationMs || 0) / 1000).toFixed(1);
            const lane = metrics.parserPath || 'ai-pdf';
            setTimingSummary(
              `Processed in ${totalSec}s (source ${sourceSec}s, extraction ${extractSec}s, validation ${validateSec}s, lane ${lane}).`,
            );
          }
          break;
        }

        if (statusBody.job.status === 'failed') {
          const errorCode = statusBody.job.error?.code || '';
          // #region agent log
          fetch('http://127.0.0.1:7412/ingest/09931433-2034-41d9-90f4-26d8a7253b3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'abd57d'},body:JSON.stringify({sessionId:'abd57d',runId,hypothesisId:'H2-H3-H5',location:'ApplicationUpload.tsx:processFile:status-failed',message:'job_status_failed',data:{jobId:created.jobId,errorCode:statusBody.job.error?.code||null,errorMessage:statusBody.job.error?.message||null,retryable:statusBody.job.error?.retryable??null,terminal:statusBody.job.error?.terminal??null},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (errorCode === 'INTERNAL_ERROR' || errorCode === 'CLAUDE_SCHEMA_INVALID') {
            const fallbackForm = new FormData();
            fallbackForm.append('file', file, file.name);
            const fallbackRes = await fetch('/api/parse-application', {
              method: 'POST',
              body: fallbackForm,
              signal: controller.signal,
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
            parsedData = fallbackBody.data;
            parsedNote = fallbackBody.note || null;
            break;
          }
          const codeSuffix = errorCode ? ` [${errorCode}]` : '';
          throw new Error(`${statusBody.job.error?.message || 'Failed to parse the application.'}${codeSuffix}`);
        }

        if (statusBody.job.status === 'queued' || statusBody.job.status === 'uploading') {
          setProcessingLabel('Queued...');
          setProcessingProgress((p) => Math.max(p, 50));
        } else if (statusBody.job.status === 'processing') {
          setProcessingLabel('Extracting data...');
          const elapsed = Date.now() - startedAt;
          const estimated = Math.min(92, 58 + Math.floor(elapsed / 1200));
          setProcessingProgress((p) => Math.max(p, estimated));
        }
      }

      if (!parsedData) {
        throw new Error('Ingestion job timed out while parsing this file.');
      }

      setProcessingLabel('Finalizing...');
      setProcessingProgress(100);
      setExtractedData(parsedData);
      setPolicyFields(parsedData);
      setPageCount(0);
      setNote(parsedNote);

      if (mode === 'client-and-policy') {
        setClientFields({
          name: parsedData.insuredName || '',
          email: parsedData.insuredEmail || '',
          phone: parsedData.insuredPhone || '',
          dateOfBirth: parsedData.insuredDateOfBirth || '',
        });
      }

      setStage('review');
    } catch (err) {
      // If aborted (modal closed or new upload started), silently bail
      if (err instanceof DOMException && err.name === 'AbortError') {
        isProcessingRef.current = false;
        return;
      }
      let message = 'Something went wrong. Please try again.';
      if (isTimeoutError(err)) {
        message = 'Request timed out. If you\u2019re on a slow connection, try again on a stronger network.';
      } else if (err instanceof TypeError) {
        message = 'Network error. Check your connection and try again.';
      } else if (err instanceof Error) {
        if (err.message.includes('client token') || err.message.includes('Vercel Blob')) {
          message = 'Upload service temporarily unavailable. Please try again.';
        } else {
          message = err.message;
        }
      }
      // #region agent log
      fetch('http://127.0.0.1:7412/ingest/09931433-2034-41d9-90f4-26d8a7253b3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'abd57d'},body:JSON.stringify({sessionId:'abd57d',runId:'pre-fix:catch',hypothesisId:'H3-H5',location:'ApplicationUpload.tsx:processFile:catch',message:'upload_flow_failed_at_ui',data:{errorType:err instanceof Error?err.name:typeof err,errorMessage:err instanceof Error?err.message:String(err),userMessage:message},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setErrorMessage(message);
      setStage('error');
    } finally {
      isProcessingRef.current = false;
    }
  }, [mode]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const handleConfirm = () => {
    const normalizedPolicy = normalizeExtractedData(policyFields || extractedData || EMPTY_POLICY_FIELDS);
    if (mode === 'client-and-policy' && onCreateClientAndPolicy) {
      if (!clientFields.name.trim()) return;
      onCreateClientAndPolicy(
        {
          name: clientFields.name.trim(),
          email: clientFields.email.trim(),
          phone: clientFields.phone.trim(),
          dateOfBirth: clientFields.dateOfBirth,
        },
        normalizedPolicy,
      );
    } else if (extractedData || policyFields) {
      onExtracted(normalizedPolicy);
    }
  };

  const handleRetry = () => {
    setStage('upload');
    setErrorMessage('');
    setExtractedData(null);
    setPolicyFields(null);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filledFields = extractedData
    ? Object.entries(extractedData).filter(([, v]) => v !== null && v !== undefined).length
    : 0;
  const totalFields = 15;

  const isClientAndPolicy = mode === 'client-and-policy';
  const missingContact = isClientAndPolicy && !clientFields.phone.trim() && !clientFields.email.trim();
  const editablePolicy = policyFields || extractedData || EMPTY_POLICY_FIELDS;
  const beneficiaries = editablePolicy.beneficiaries || [];
  const primaryBeneficiaries = beneficiaries
    .map((beneficiary, index) => ({ beneficiary, index }))
    .filter(({ beneficiary }) => beneficiary.type === 'primary');
  const contingentBeneficiaries = beneficiaries
    .map((beneficiary, index) => ({ beneficiary, index }))
    .filter(({ beneficiary }) => beneficiary.type === 'contingent');

  const updatePolicyFields = useCallback((updater: (current: ExtractedApplicationData) => ExtractedApplicationData) => {
    setPolicyFields((prev) => updater(prev || extractedData || EMPTY_POLICY_FIELDS));
  }, [extractedData]);

  const updateNullableTextField = useCallback((key: keyof Pick<
    ExtractedApplicationData,
    'policyNumber' | 'insuranceCompany' | 'policyOwner' | 'insuredName' | 'insuredEmail' | 'insuredPhone' | 'insuredDateOfBirth' | 'insuredState' | 'effectiveDate' | 'renewalDate'
  >, value: string) => {
    updatePolicyFields((current) => ({
      ...current,
      [key]: value || null,
    }));
  }, [updatePolicyFields]);

  const updateNumberField = useCallback((key: keyof Pick<ExtractedApplicationData, 'coverageAmount' | 'premiumAmount'>, value: string) => {
    const parsed = Number(value);
    updatePolicyFields((current) => ({
      ...current,
      [key]: value === '' || Number.isNaN(parsed) ? null : parsed,
    }));
  }, [updatePolicyFields]);

  const updatePolicyType = useCallback((value: string) => {
    updatePolicyFields((current) => ({
      ...current,
      policyType: value ? value as NonNullable<ExtractedApplicationData['policyType']> : null,
    }));
  }, [updatePolicyFields]);

  const updatePremiumFrequency = useCallback((value: string) => {
    updatePolicyFields((current) => ({
      ...current,
      premiumFrequency: value ? value as NonNullable<ExtractedApplicationData['premiumFrequency']> : null,
    }));
  }, [updatePolicyFields]);

  const updateBeneficiaries = useCallback((updater: (current: Beneficiary[]) => Beneficiary[]) => {
    updatePolicyFields((current) => {
      const nextBeneficiaries = updater([...(current.beneficiaries || [])]);
      return { ...current, beneficiaries: nextBeneficiaries.length > 0 ? nextBeneficiaries : null };
    });
  }, [updatePolicyFields]);

  const addBeneficiary = useCallback((type: Beneficiary['type']) => {
    updateBeneficiaries((current) => [
      ...current,
      { name: '', relationship: '', percentage: undefined, irrevocable: null, type },
    ]);
  }, [updateBeneficiaries]);

  const removeBeneficiary = useCallback((indexToRemove: number) => {
    updateBeneficiaries((current) => current.filter((_, index) => index !== indexToRemove));
  }, [updateBeneficiaries]);

  const updateBeneficiaryField = useCallback((
    indexToUpdate: number,
    field: keyof Beneficiary,
    value: string | number | boolean | null | undefined,
  ) => {
    updateBeneficiaries((current) => current.map((beneficiary, index) => {
      if (index !== indexToUpdate) return beneficiary;
      return { ...beneficiary, [field]: value };
    }));
  }, [updateBeneficiaries]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-[5px] border border-gray-200 shadow-2xl transform transition-all max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-xl font-bold text-[#000000]">
              {stage === 'review'
                ? isClientAndPolicy ? 'Review Client & Policy' : 'Review Extracted Data'
                : 'Upload Application'}
            </h3>
            {!isClientAndPolicy && <p className="text-gray-500 text-sm">For {clientName}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {/* Upload Stage */}
          {stage === 'upload' && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-[5px] p-10 text-center cursor-pointer transition-all duration-200 ${
                dragActive
                  ? 'border-[#0099FF] bg-[#0099FF]/5'
                  : 'border-gray-300 hover:border-[#0099FF] hover:bg-gray-50'
              }`}
            >
              <label htmlFor={fileInputId} className="flex flex-col items-center gap-3 cursor-pointer">
                <div className="w-14 h-14 bg-[#0099FF]/10 rounded-[5px] flex items-center justify-center">
                  <svg className="w-7 h-7 text-[#0099FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-[#000000] font-semibold mb-1">
                    {dragActive ? 'Drop your PDF here' : 'Upload application PDF'}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {isClientAndPolicy
                      ? 'AI will extract client info and policy details in one step. Max 13MB.'
                      : 'Drag & drop or click to browse. Max 13MB.'}
                  </p>
                </div>
              </label>
              <input
                id={fileInputId}
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {/* Processing Stage */}
          {stage === 'processing' && (
            <div className="flex flex-col items-center py-10 gap-5">
              <div className="relative">
                <svg className="animate-spin w-12 h-12 text-[#0099FF]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[#000000] font-semibold mb-1">Reading application...</p>
                <p className="text-gray-500 text-sm">Extracting data from {fileName}</p>
              </div>
              <div className="w-full max-w-sm">
                <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0099FF] transition-all duration-500 ease-out"
                    style={{ width: `${processingProgress}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-500">
                  <span>{processingLabel}</span>
                  <span>{processingProgress}%</span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-[#0099FF] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-[#0099FF] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-[#0099FF] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <p className="text-gray-400 text-xs">This usually takes 5–15 seconds (longer on slow connections)</p>
              </div>
            </div>
          )}

          {/* Error Stage */}
          {stage === 'error' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-14 h-14 bg-red-100 rounded-[5px] flex items-center justify-center">
                <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[#000000] font-semibold mb-1">Couldn&apos;t read the application</p>
                <p className="text-gray-500 text-sm max-w-sm">{errorMessage}</p>
              </div>
              <div className="flex gap-3 mt-2">
                <button onClick={handleRetry} className="px-5 py-2.5 bg-[#0099FF] hover:bg-[#0088DD] text-white font-semibold rounded-[5px] shadow-lg shadow-[#0099FF]/30 transition-all duration-200">
                  Try Again
                </button>
                <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-all duration-200">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Review Stage */}
          {stage === 'review' && extractedData && (
            <div className="space-y-4">
              <div className="bg-[#44bbaa]/10 border border-[#45bcaa]/30 rounded-[5px] p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-[#45bcaa] mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-[#005851] text-sm font-medium">
                    Extracted {filledFields} of {totalFields} fields from {pageCount} page{pageCount !== 1 ? 's' : ''}
                  </p>
                  <p className="text-[#005851]/70 text-xs mt-0.5">
                    {isClientAndPolicy
                      ? 'Review and edit the details below, then create the client and policy.'
                      : 'Review below, then confirm to pre-fill the policy form.'}
                  </p>
                  {timingSummary && (
                    <p className="text-[#005851]/70 text-[11px] mt-1">{timingSummary}</p>
                  )}
                </div>
              </div>

              {note && (
                <div className="bg-amber-50 border border-amber-200 rounded-[5px] p-3 flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-amber-700 text-xs">{note}</p>
                </div>
              )}

              {/* Client Details Section (only in client-and-policy mode) */}
              {isClientAndPolicy && (
                <div>
                  <h4 className="text-xs font-semibold text-[#005851] uppercase tracking-wide mb-2">Client Details</h4>
                  <div className="space-y-2">
                    <EditableField label="Name *" value={clientFields.name} onChange={(v) => setClientFields(f => ({ ...f, name: v }))} />
                    <EditableField label="Email" value={clientFields.email} onChange={(v) => setClientFields(f => ({ ...f, email: v }))} placeholder="email@example.com" />
                    <EditableField label="Phone" value={clientFields.phone} onChange={(v) => setClientFields(f => ({ ...f, phone: v }))} placeholder="(555) 123-4567" />
                    <EditableField label="Date of Birth" value={clientFields.dateOfBirth} onChange={(v) => setClientFields(f => ({ ...f, dateOfBirth: v }))} type="date" />
                  </div>
                  {missingContact && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-[5px] p-2.5 flex items-center gap-2">
                      <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <p className="text-xs text-amber-700">No phone or email found. This client won&apos;t have a way to be contacted.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Policy Details Section */}
              <div>
                {isClientAndPolicy && (
                  <h4 className="text-xs font-semibold text-[#005851] uppercase tracking-wide mb-2">Policy Details</h4>
                )}
                <div className="space-y-1">
                  <EditableSelectField
                    label="Policy Type"
                    value={editablePolicy.policyType || ''}
                    onChange={updatePolicyType}
                    options={POLICY_TYPE_OPTIONS}
                  />
                  <EditableField label="Insurance Company" value={editablePolicy.insuranceCompany || ''} onChange={(v) => updateNullableTextField('insuranceCompany', v)} placeholder="Carrier name" />
                  <EditableField label="Policy Number" value={editablePolicy.policyNumber || ''} onChange={(v) => updateNullableTextField('policyNumber', v)} />
                  <EditableField label="Policy Owner" value={editablePolicy.policyOwner || ''} onChange={(v) => updateNullableTextField('policyOwner', v)} />
                  <EditableField label="Insured" value={editablePolicy.insuredName || ''} onChange={(v) => updateNullableTextField('insuredName', v)} />
                  {beneficiaries.length > 0 ? (
                    <>
                      {primaryBeneficiaries.length > 0 && (
                        <div className="py-2.5 px-3 rounded-[5px] border border-gray-100">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500 text-sm">Primary Beneficiaries</span>
                            <button
                              type="button"
                              onClick={() => addBeneficiary('primary')}
                              className="text-xs text-[#005851] hover:text-[#004540] font-medium"
                            >
                              + Add
                            </button>
                          </div>
                          <div className="mt-2 space-y-2">
                            {primaryBeneficiaries.map(({ beneficiary, index }) => (
                              <BeneficiaryEditor
                                key={`primary-${index}`}
                                beneficiary={beneficiary}
                                onUpdate={(field, value) => updateBeneficiaryField(index, field, value)}
                                onRemove={() => removeBeneficiary(index)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {contingentBeneficiaries.length > 0 && (
                        <div className="py-2.5 px-3 rounded-[5px] border border-gray-100">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500 text-sm">Contingent Beneficiaries</span>
                            <button
                              type="button"
                              onClick={() => addBeneficiary('contingent')}
                              className="text-xs text-[#005851] hover:text-[#004540] font-medium"
                            >
                              + Add
                            </button>
                          </div>
                          <div className="mt-2 space-y-2">
                            {contingentBeneficiaries.map(({ beneficiary, index }) => (
                              <BeneficiaryEditor
                                key={`contingent-${index}`}
                                beneficiary={beneficiary}
                                onUpdate={(field, value) => updateBeneficiaryField(index, field, value)}
                                onRemove={() => removeBeneficiary(index)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {primaryBeneficiaries.length === 0 && (
                        <button
                          type="button"
                          onClick={() => addBeneficiary('primary')}
                          className="w-full py-2.5 px-3 rounded-[5px] border border-dashed border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          + Add primary beneficiary
                        </button>
                      )}
                      {contingentBeneficiaries.length === 0 && (
                        <button
                          type="button"
                          onClick={() => addBeneficiary('contingent')}
                          className="w-full py-2.5 px-3 rounded-[5px] border border-dashed border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          + Add contingent beneficiary
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="py-2.5 px-3 rounded-[5px] border border-dashed border-gray-300 space-y-2">
                      <p className="text-gray-500 text-sm">No beneficiaries found.</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => addBeneficiary('primary')}
                          className="flex-1 py-2 px-3 rounded-[5px] bg-gray-100 hover:bg-gray-200 text-xs font-medium text-gray-700"
                        >
                          + Primary
                        </button>
                        <button
                          type="button"
                          onClick={() => addBeneficiary('contingent')}
                          className="flex-1 py-2 px-3 rounded-[5px] bg-gray-100 hover:bg-gray-200 text-xs font-medium text-gray-700"
                        >
                          + Contingent
                        </button>
                      </div>
                    </div>
                  )}
                  <EditableField
                    label="Death Benefit"
                    value={editablePolicy.coverageAmount != null ? String(editablePolicy.coverageAmount) : ''}
                    onChange={(v) => updateNumberField('coverageAmount', v)}
                    type="number"
                    placeholder="250000"
                  />
                  <EditableField
                    label="Premium Amount"
                    value={editablePolicy.premiumAmount != null ? String(editablePolicy.premiumAmount) : ''}
                    onChange={(v) => updateNumberField('premiumAmount', v)}
                    type="number"
                    placeholder="89"
                  />
                  <EditableSelectField
                    label="Premium Frequency"
                    value={editablePolicy.premiumFrequency || ''}
                    onChange={updatePremiumFrequency}
                    options={PREMIUM_FREQUENCY_OPTIONS}
                  />
                  <EditableField label="Effective Date" value={editablePolicy.effectiveDate || ''} onChange={(v) => updateNullableTextField('effectiveDate', v)} type="date" />
                  <EditableField label="Renewal Date" value={editablePolicy.renewalDate || ''} onChange={(v) => updateNullableTextField('renewalDate', v)} type="date" />
                  {!isClientAndPolicy && (
                    <>
                      <EditableField label="Email" value={editablePolicy.insuredEmail || ''} onChange={(v) => updateNullableTextField('insuredEmail', v)} placeholder="email@example.com" />
                      <EditableField label="Phone" value={editablePolicy.insuredPhone || ''} onChange={(v) => updateNullableTextField('insuredPhone', v)} placeholder="(555) 123-4567" />
                      <EditableField label="Birthday" value={editablePolicy.insuredDateOfBirth || ''} onChange={(v) => updateNullableTextField('insuredDateOfBirth', v)} type="date" />
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-3">
                <button
                  onClick={handleRetry}
                  className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-[#000000] font-semibold rounded-[5px] border border-gray-200 transition-all duration-200"
                >
                  Upload Different File
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isClientAndPolicy && !clientFields.name.trim()}
                  className="flex-1 py-3 px-4 bg-[#0099FF] hover:bg-[#0088DD] text-white font-semibold rounded-[5px] shadow-lg shadow-[#0099FF]/30 hover:shadow-[#0099FF]/40 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {isClientAndPolicy ? 'Create Client & Policy' : 'Use These Values'}
                </button>
              </div>

              <p className="text-gray-400 text-xs text-center">
                {isClientAndPolicy
                  ? 'Both the client and their policy will be created from this data.'
                  : 'You\u2019ll be able to review and edit all fields before saving.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function startAutoProgress(
  setProgress: React.Dispatch<React.SetStateAction<number>>,
  start: number,
  max: number,
  step: number,
  everyMs: number,
) {
  setProgress((p) => Math.max(p, start));
  const id = setInterval(() => {
    setProgress((prev) => {
      if (prev >= max) return prev;
      return Math.min(max, prev + step);
    });
  }, everyMs);
  return () => clearInterval(id);
}

function EditableField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const hasValue = value.trim() !== '';
  return (
    <div className="flex items-center gap-3 py-1.5 px-3 rounded-[5px] hover:bg-gray-50 transition-colors">
      <span className="text-gray-500 text-sm w-28 shrink-0">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-sm text-[#000000] bg-transparent border-b border-gray-200 focus:border-[#45bcaa] focus:outline-none py-0.5 transition-colors"
      />
      {!hasValue && (
        <span className="text-[10px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">Not found</span>
      )}
    </div>
  );
}

function EditableSelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const hasValue = value !== '';
  return (
    <div className="flex items-center gap-3 py-1.5 px-3 rounded-[5px] hover:bg-gray-50 transition-colors">
      <span className="text-gray-500 text-sm w-28 shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 text-sm text-[#000000] bg-transparent border-b border-gray-200 focus:border-[#45bcaa] focus:outline-none py-0.5 transition-colors"
      >
        <option value="">Not found</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      {!hasValue && (
        <span className="text-[10px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">Not found</span>
      )}
    </div>
  );
}

function BeneficiaryEditor({
  beneficiary,
  onUpdate,
  onRemove,
}: {
  beneficiary: Beneficiary;
  onUpdate: (field: keyof Beneficiary, value: string | number | boolean | null | undefined) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-[5px] border border-gray-200 p-2.5 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={beneficiary.name}
          onChange={(e) => onUpdate('name', e.target.value)}
          placeholder="Full name"
          className="col-span-2 px-2.5 py-2 text-xs border border-gray-200 rounded-[5px] focus:outline-none focus:border-[#45bcaa]"
        />
        <input
          type="text"
          value={beneficiary.relationship || ''}
          onChange={(e) => onUpdate('relationship', e.target.value)}
          placeholder="Relationship"
          className="px-2.5 py-2 text-xs border border-gray-200 rounded-[5px] focus:outline-none focus:border-[#45bcaa]"
        />
        <input
          type="number"
          value={beneficiary.percentage == null ? '' : String(beneficiary.percentage)}
          onChange={(e) => onUpdate('percentage', e.target.value === '' ? undefined : Number(e.target.value))}
          placeholder="%"
          min={0}
          max={100}
          className="px-2.5 py-2 text-xs border border-gray-200 rounded-[5px] focus:outline-none focus:border-[#45bcaa]"
        />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={beneficiary.irrevocable === true}
            onChange={(e) => onUpdate('irrevocable', e.target.checked)}
          />
          Irrevocable
        </label>
        <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:text-red-600 font-medium">
          Remove
        </button>
      </div>
    </div>
  );
}
