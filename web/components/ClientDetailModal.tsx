'use client';

import { useEffect, useState, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import { formatCurrency, formatDate, formatDateLong, getStatusColor, getPolicyTypeIcon } from '../lib/policyUtils';

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  clientCode?: string;
  dateOfBirth?: string;
  createdAt: Timestamp;
  agentId: string;
}

interface Policy {
  id: string;
  policyType: string;
  policyNumber: string;
  insuranceCompany: string;
  policyOwner: string;
  beneficiary: string;
  coverageAmount: number;
  premiumAmount: number;
  renewalDate?: string;
  amountOfProtection?: number;
  protectionUnit?: 'months' | 'years';
  status: 'Active' | 'Pending' | 'Lapsed';
  createdAt: Timestamp;
}

interface ClientDetailModalProps {
  client: Client | null;
  policies: Policy[];
  policiesLoading: boolean;
  onClose: () => void;
  onAddPolicy: () => void;
  onEditPolicy: (policy: Policy) => void;
  onDeletePolicy: (policy: Policy) => void;
  onUploadApplication: () => void;
}

export default function ClientDetailModal({
  client,
  policies,
  policiesLoading,
  onClose,
  onAddPolicy,
  onEditPolicy,
  onDeletePolicy,
  onUploadApplication,
}: ClientDetailModalProps) {
  const [copied, setCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Animate in on mount
  useEffect(() => {
    if (client) {
      // Small delay to allow CSS transition to trigger
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
      setIsClosing(false);
    }
  }, [client]);

  // Lock body scroll when open
  useEffect(() => {
    if (client) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [client]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    if (client) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [client]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setIsVisible(false);
    // Wait for animation to complete before actually closing
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200);
  }, [onClose]);

  const handleCopyCode = useCallback(async () => {
    if (!client?.clientCode) return;
    try {
      await navigator.clipboard.writeText(client.clientCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = client.clientCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [client?.clientCode]);

  if (!client && !isClosing) return null;

  // Build status summary
  const statusCounts = policies.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const statusSummary = Object.entries(statusCounts)
    .map(([status, count]) => `${count} ${status}`)
    .join(', ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          isVisible && !isClosing ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-2xl bg-white rounded-[5px] border border-gray-200 shadow-2xl flex flex-col max-h-[90vh] transition-all duration-200 ${
          isVisible && !isClosing
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 translate-y-4'
        }`}
      >
        {/* ── Header ── */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-[#005851] to-[#0A3D3D] rounded-full flex items-center justify-center text-white font-bold text-xl">
              {client?.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[#000000]">{client?.name}</h2>
              {policies.length > 0 && statusSummary && (
                <p className="text-gray-500 text-sm mt-0.5">{statusSummary}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-10 h-10 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {/* Client Code Block */}
          <div className="px-6 pt-6 pb-4">
            <div className="bg-[#daf3f0] border border-[#45bcaa]/30 rounded-[5px] p-5">
              <p className="text-xs uppercase tracking-widest text-[#337973] font-semibold mb-2">Client Code</p>
              {client?.clientCode ? (
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-mono font-bold text-[#005851] tracking-wider">
                    {client.clientCode}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="px-3 py-1.5 bg-white/80 hover:bg-white border border-[#45bcaa]/30 rounded-[5px] text-sm font-medium text-[#005851] transition-colors flex items-center gap-1.5"
                  >
                    {copied ? (
                      <>
                        <svg className="w-4 h-4 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <span className="text-[#337973] text-sm italic">No code assigned</span>
              )}
            </div>
          </div>

          {/* Profile Info */}
          <div className="px-6 pb-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-1">Phone</p>
                <p className="text-[#000000] font-medium">{client?.phone || <span className="text-gray-400 italic font-normal">Not provided</span>}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-1">Email</p>
                <p className="text-[#000000] font-medium truncate">{client?.email || <span className="text-gray-400 italic font-normal">Not provided</span>}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-1">Date of Birth</p>
                <p className="text-[#000000] font-medium">
                  {client?.dateOfBirth
                    ? formatDateLong(client.dateOfBirth)
                    : <span className="text-gray-400 italic font-normal">Not provided</span>
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200" />

          {/* Policies Section */}
          <div className="px-6 pt-5 pb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-[#000000]">Policies</h3>
                <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs font-semibold text-gray-600">
                  {policies.length}
                </span>
              </div>
            </div>

            {policiesLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-4">
                  <svg className="animate-spin w-8 h-8 text-[#0099FF]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-gray-500">Loading policies...</p>
                </div>
              </div>
            ) : policies.length === 0 ? (
              <div className="flex flex-col items-center text-center py-10">
                <div className="w-14 h-14 bg-gray-100 rounded-[5px] flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h4 className="text-base font-semibold text-[#000000] mb-1">No policies yet</h4>
                <p className="text-gray-500 text-sm mb-4 max-w-xs">
                  Add a policy to start tracking coverage for this client.
                </p>
                <button
                  onClick={onAddPolicy}
                  className="px-5 py-2.5 bg-[#0099FF] hover:bg-[#0088DD] text-white font-semibold rounded-[5px] shadow-lg shadow-[#0099FF]/30 hover:shadow-[#0099FF]/40 transition-all duration-200 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add First Policy
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {policies.map((policy) => (
                  <div
                    key={policy.id}
                    className="bg-white rounded-[5px] border border-gray-200 p-5 hover:border-gray-300 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#0099FF]/20 rounded-lg flex items-center justify-center text-[#0099FF]">
                          {getPolicyTypeIcon(policy.policyType)}
                        </div>
                        <div>
                          <h4 className="font-semibold text-[#000000]">{policy.policyType}</h4>
                          <p className="text-gray-500 text-sm">#{policy.policyNumber}</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(policy.status)}`}>
                        {policy.status}
                      </span>
                    </div>

                    {/* Insurance Company */}
                    {policy.insuranceCompany && (
                      <div className="mb-4 pb-4 border-b border-gray-200">
                        <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Insurance Company</p>
                        <p className="text-[#000000] font-medium">{policy.insuranceCompany}</p>
                      </div>
                    )}

                    {/* Policy Owner & Beneficiary */}
                    {(policy.policyOwner || policy.beneficiary) && (
                      <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-gray-200">
                        {policy.policyOwner && (
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Owner</p>
                            <p className="text-[#000000] text-sm">{policy.policyOwner}</p>
                          </div>
                        )}
                        {policy.beneficiary && (
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Beneficiary</p>
                            <p className="text-[#000000] text-sm">{policy.beneficiary}</p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      {policy.policyType === 'Mortgage Protection' && policy.amountOfProtection && (
                        <div className="col-span-2 bg-[#44bbaa]/10 rounded-lg p-3 border border-[#45bcaa]/30">
                          <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Amount of Protection</p>
                          <p className="text-[#005851] text-xl font-bold">{policy.amountOfProtection} {policy.protectionUnit === 'months' ? 'Months' : 'Years'}</p>
                        </div>
                      )}
                      {policy.policyType === 'Term Life' && policy.renewalDate && (
                        <div className="col-span-2">
                          <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Renewal Date</p>
                          <p className="text-[#000000]">{formatDate(policy.renewalDate)}</p>
                        </div>
                      )}
                      {(policy.policyType === 'Accidental' || policy.policyType === 'Term Life') ? (
                        <>
                          <div className="col-span-2 bg-[#44bbaa]/10 rounded-lg p-3 border border-[#45bcaa]/30">
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Death Benefit</p>
                            <p className="text-[#005851] text-xl font-bold">{formatCurrency(policy.coverageAmount)}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Premium</p>
                            <p className="text-[#000000] font-semibold">{formatCurrency(policy.premiumAmount)}/mo</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Death Benefit</p>
                            <p className="text-[#000000] font-semibold">{formatCurrency(policy.coverageAmount)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Premium</p>
                            <p className="text-[#000000] font-semibold">{formatCurrency(policy.premiumAmount)}/mo</p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Edit/Delete Actions */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => onEditPolicy(policy)}
                        className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-[#000000] rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={() => onDeletePolicy(policy)}
                        className="flex-1 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-red-500/20"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Action Footer ── */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-[5px] shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={onUploadApplication}
              className="px-4 py-2.5 bg-[#005851] hover:bg-[#004540] text-white font-semibold rounded-[5px] shadow-lg shadow-[#005851]/30 hover:shadow-[#005851]/40 transition-all duration-200 flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload Application
            </button>
            <button
              onClick={onAddPolicy}
              className="px-4 py-2.5 bg-[#0099FF] hover:bg-[#0088DD] text-white font-semibold rounded-[5px] shadow-lg shadow-[#0099FF]/30 hover:shadow-[#0099FF]/40 transition-all duration-200 flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Policy
            </button>
            <div className="flex-1" />
            <button
              onClick={handleClose}
              className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-[#000000] font-semibold rounded-[5px] border border-gray-200 transition-all duration-200 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
