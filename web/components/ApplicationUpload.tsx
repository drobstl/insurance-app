'use client';

import { useState, useRef, useCallback } from 'react';
import type { ExtractedApplicationData, ParseApplicationResponse } from '../lib/types';

interface ApplicationUploadProps {
  clientName: string;
  onExtracted: (data: ExtractedApplicationData) => void;
  onClose: () => void;
}

type Stage = 'upload' | 'processing' | 'review' | 'error';

export default function ApplicationUpload({ clientName, onExtracted, onClose }: ApplicationUploadProps) {
  const [stage, setStage] = useState<Stage>('upload');
  const [fileName, setFileName] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedApplicationData | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    // Validate client-side
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Please upload a PDF file.');
      setStage('error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('File is too large. Maximum size is 10MB.');
      setStage('error');
      return;
    }

    setFileName(file.name);
    setStage('processing');

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Abort if the server hasn't responded within 45 seconds
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);

      const res = await fetch('/api/parse-application', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        // Try to extract a JSON error message; fall back to status text
        let message = `Server error (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          if (res.status === 504) {
            message = 'Request timed out. Try a smaller PDF or try again shortly.';
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
      setPageCount(result.pageCount || 0);
      setNote(result.note || null);
      setStage('review');
    } catch (err) {
      console.error('Upload application error:', err);
      let message = 'Something went wrong. Please try again.';
      if (err instanceof DOMException && err.name === 'AbortError') {
        message = 'Request timed out. The PDF may be too large — try again shortly.';
      } else if (err instanceof TypeError) {
        message = 'Network error. Please check your connection and try again.';
      } else if (err instanceof Error) {
        message = err.message;
      }
      setErrorMessage(message);
      setStage('error');
    }
  }, []);

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
    if (extractedData) onExtracted(extractedData);
  };

  const handleRetry = () => {
    setStage('upload');
    setErrorMessage('');
    setExtractedData(null);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Count how many fields were successfully extracted
  const filledFields = extractedData
    ? Object.entries(extractedData).filter(([, v]) => v !== null && v !== undefined).length
    : 0;
  const totalFields = 12;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-[5px] border border-gray-200 shadow-2xl transform transition-all max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-xl font-bold text-[#000000]">
              {stage === 'review' ? 'Review Extracted Data' : 'Upload Application'}
            </h3>
            <p className="text-gray-500 text-sm">For {clientName}</p>
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
          {/* ─── Upload Stage ─── */}
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
                    Drag & drop or click to browse. Max 10MB.
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

          {/* ─── Processing Stage ─── */}
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
                <p className="text-gray-400 text-xs">This takes 5–15 seconds</p>
              </div>
            </div>
          )}

          {/* ─── Error Stage ─── */}
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
                <button
                  onClick={handleRetry}
                  className="px-5 py-2.5 bg-[#0099FF] hover:bg-[#0088DD] text-white font-semibold rounded-[5px] shadow-lg shadow-[#0099FF]/30 transition-all duration-200"
                >
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ─── Review Stage ─── */}
          {stage === 'review' && extractedData && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="bg-[#44bbaa]/10 border border-[#45bcaa]/30 rounded-[5px] p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-[#45bcaa] mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-[#005851] text-sm font-medium">
                    Extracted {filledFields} of {totalFields} fields from {pageCount} page{pageCount !== 1 ? 's' : ''}
                  </p>
                  <p className="text-[#005851]/70 text-xs mt-0.5">
                    Review below, then confirm to pre-fill the policy form.
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

              {/* Extracted fields */}
              <div className="space-y-1">
                <FieldRow label="Policy Type" value={extractedData.policyType} />
                <FieldRow label="Insurance Company" value={extractedData.insuranceCompany} />
                <FieldRow label="Policy Number" value={extractedData.policyNumber} />
                <FieldRow label="Policy Owner" value={extractedData.policyOwner} />
                <FieldRow label="Insured" value={extractedData.insuredName} />
                <FieldRow label="Beneficiary" value={extractedData.beneficiary} />
                <FieldRow
                  label="Death Benefit"
                  value={extractedData.coverageAmount != null ? `$${extractedData.coverageAmount.toLocaleString()}` : null}
                />
                <FieldRow
                  label="Premium"
                  value={
                    extractedData.premiumAmount != null
                      ? `$${extractedData.premiumAmount.toLocaleString()}${extractedData.premiumFrequency ? ` / ${extractedData.premiumFrequency}` : ''}`
                      : null
                  }
                />
                <FieldRow label="Renewal Date" value={extractedData.renewalDate} />
                <FieldRow label="Email" value={extractedData.insuredEmail} />
                <FieldRow label="Phone" value={extractedData.insuredPhone} />
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
                  className="flex-1 py-3 px-4 bg-[#0099FF] hover:bg-[#0088DD] text-white font-semibold rounded-[5px] shadow-lg shadow-[#0099FF]/30 hover:shadow-[#0099FF]/40 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Use These Values
                </button>
              </div>

              <p className="text-gray-400 text-xs text-center">
                You&apos;ll be able to review and edit all fields in the policy form before saving.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A single row in the review table */
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
