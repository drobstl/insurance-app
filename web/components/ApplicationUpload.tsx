'use client';

import { useState, useRef, useCallback } from 'react';
import { upload } from '@vercel/blob/client';
import type { ExtractedApplicationData, ParseApplicationResponse, Beneficiary } from '../lib/types';
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
const BLOB_UPLOAD_TIMEOUT_MS = 25_000;
const PARSE_TIMEOUT_MS = 120_000;

export default function ApplicationUpload({ clientName, onExtracted, onClose, onCreateClientAndPolicy, mode = 'policy-only' }: ApplicationUploadProps) {
  const [stage, setStage] = useState<Stage>('upload');
  const [fileName, setFileName] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedApplicationData | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Please upload a PDF file.');
      setStage('error');
      return;
    }
    if (file.size > 13 * 1024 * 1024) {
      setErrorMessage('File is too large. Maximum size is 13MB.');
      setStage('error');
      return;
    }

    setFileName(file.name);
    setStage('processing');

    try {
      // Try Vercel Blob upload with retry, fall back to direct FormData upload
      let blobUrl: string | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const blob = await withTimeout(
            upload(file.name, file, {
              access: 'public',
              handleUploadUrl: '/api/upload',
            }),
            BLOB_UPLOAD_TIMEOUT_MS,
            'Upload timed out while sending file.',
          );
          blobUrl = blob.url;
          break;
        } catch (uploadErr) {
          if (isTimeoutError(uploadErr)) {
            console.warn('[ApplicationUpload] Blob upload timed out, trying fallback path.');
          }
          if (attempt < 1) continue;
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

      let res: Response;

      try {
        if (blobUrl) {
          res = await fetch('/api/parse-application', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: blobUrl }),
            signal: controller.signal,
          });
        } else {
          const formData = new FormData();
          formData.append('file', file);
          res = await fetch('/api/parse-application', {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });
        }
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        let message = `Server error (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          if (res.status === 504) {
            message = 'Server timed out processing the PDF. Try again on a stronger connection, or try a smaller file.';
          }
        }
        setErrorMessage(message);
        setStage('error');
        return;
      }

      const result: ParseApplicationResponse = await res.json();

      if (!result.success || !result.data) {
        setErrorMessage(result.error || 'Failed to parse the application.');
        setStage('error');
        return;
      }

      setExtractedData(result.data);
      setPolicyFields(result.data);
      setPageCount(result.pageCount || 0);
      setNote(result.note || null);

      if (mode === 'client-and-policy') {
        setClientFields({
          name: result.data.insuredName || '',
          email: result.data.insuredEmail || '',
          phone: result.data.insuredPhone || '',
          dateOfBirth: result.data.insuredDateOfBirth || '',
        });
      }

      setStage('review');
    } catch (err) {
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
      setErrorMessage(message);
      setStage('error');
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
    if (mode === 'client-and-policy' && onCreateClientAndPolicy && policyFields) {
      if (!clientFields.name.trim()) return;
      onCreateClientAndPolicy(
        {
          name: clientFields.name.trim(),
          email: clientFields.email.trim(),
          phone: clientFields.phone.trim(),
          dateOfBirth: clientFields.dateOfBirth,
        },
        policyFields,
      );
    } else if (extractedData) {
      onExtracted(policyFields || extractedData);
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
  const totalFields = 14;

  const isClientAndPolicy = mode === 'client-and-policy';
  const missingContact = isClientAndPolicy && !clientFields.phone.trim() && !clientFields.email.trim();

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
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-[5px] p-10 text-center cursor-pointer transition-all duration-200 ${
                dragActive
                  ? 'border-[#0099FF] bg-[#0099FF]/5'
                  : 'border-gray-300 hover:border-[#0099FF] hover:bg-gray-50'
              }`}
            >
              <div className="flex flex-col items-center gap-3">
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
              </div>
              <input
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
                  <FieldRow label="Policy Type" value={policyFields?.policyType} />
                  <FieldRow label="Insurance Company" value={policyFields?.insuranceCompany} />
                  <FieldRow label="Policy Number" value={policyFields?.policyNumber} />
                  <FieldRow label="Policy Owner" value={policyFields?.policyOwner} />
                  <FieldRow label="Insured" value={policyFields?.insuredName} />
                  {policyFields?.beneficiaries && policyFields.beneficiaries.length > 0 ? (
                    <>
                      {policyFields.beneficiaries.filter(b => b.type === 'primary').length > 0 && (
                        <div className="py-2.5 px-3 rounded-[5px] hover:bg-gray-50 transition-colors">
                          <span className="text-gray-500 text-sm">Primary Beneficiaries</span>
                          <div className="mt-1 space-y-0.5">
                            {policyFields.beneficiaries.filter(b => b.type === 'primary').map((b, i) => (
                              <p key={i} className="text-[#000000] text-sm font-medium text-right">
                                {b.name}
                                {b.relationship && <span className="text-gray-400 text-xs ml-1">({b.relationship})</span>}
                                {b.percentage != null && <span className="text-gray-400 text-xs ml-1">{b.percentage}%</span>}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                      {policyFields.beneficiaries.filter(b => b.type === 'contingent').length > 0 && (
                        <div className="py-2.5 px-3 rounded-[5px] hover:bg-gray-50 transition-colors">
                          <span className="text-gray-500 text-sm">Contingent Beneficiaries</span>
                          <div className="mt-1 space-y-0.5">
                            {policyFields.beneficiaries.filter(b => b.type === 'contingent').map((b, i) => (
                              <p key={i} className="text-[#000000] text-sm font-medium text-right">
                                {b.name}
                                {b.relationship && <span className="text-gray-400 text-xs ml-1">({b.relationship})</span>}
                                {b.percentage != null && <span className="text-gray-400 text-xs ml-1">{b.percentage}%</span>}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <FieldRow label="Beneficiaries" value={null} />
                  )}
                  <FieldRow
                    label="Death Benefit"
                    value={policyFields?.coverageAmount != null ? `$${policyFields.coverageAmount.toLocaleString()}` : null}
                  />
                  <FieldRow
                    label="Premium"
                    value={
                      policyFields?.premiumAmount != null
                        ? `$${policyFields.premiumAmount.toLocaleString()}${policyFields.premiumFrequency ? ` / ${policyFields.premiumFrequency}` : ''}`
                        : null
                    }
                  />
                  <FieldRow label="Effective Date" value={policyFields?.effectiveDate} />
                  <FieldRow label="Renewal Date" value={policyFields?.renewalDate} />
                  {!isClientAndPolicy && (
                    <>
                      <FieldRow label="Email" value={policyFields?.insuredEmail} />
                      <FieldRow label="Phone" value={policyFields?.insuredPhone} />
                      <FieldRow label="Birthday" value={policyFields?.insuredDateOfBirth} />
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

function FieldRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  const hasValue = value !== null && value !== undefined && value !== '';
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-[5px] hover:bg-gray-50 transition-colors">
      <span className="text-gray-500 text-sm">{label}</span>
      {hasValue ? (
        <span className="text-[#000000] text-sm font-medium text-right max-w-[60%] truncate">{value}</span>
      ) : (
        <span className="text-gray-300 text-sm italic">Not found</span>
      )}
    </div>
  );
}
