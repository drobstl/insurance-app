'use client';

import { useEffect, useState, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { formatCurrency, formatDate, formatDateLong, getStatusColor, getPolicyTypeIcon, getAnniversaryDate, daysUntilAnniversary } from '../lib/policyUtils';
import type { Beneficiary } from '../lib/types';
import { buildWelcomeMessage, resolveClientLanguage, type SupportedLanguage } from '../lib/client-language';

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  clientCode?: string;
  dateOfBirth?: string;
  createdAt: Timestamp;
  agentId: string;
  policyReviewOptOut?: boolean;
  sourceReferralId?: string;
  sourceReferralName?: string;
  preferredLanguage?: SupportedLanguage;
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
  anniversaryAgentNotifiedAt?: string;
  anniversaryClientNotifiedAt?: string;
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
  onEditClient?: (client: Client) => void;
  onUpdateClient?: (clientId: string, updates: { name: string; email: string; phone: string; dateOfBirth: string; preferredLanguage: SupportedLanguage }) => Promise<void>;
  onFlagAtRisk?: (policyId: string, reason: 'lapsed_payment' | 'cancellation') => void;
  agentName?: string;
  hasSchedulingUrl?: boolean;
  clientPushToken?: string | null;
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
  onEditClient,
  onUpdateClient,
  onFlagAtRisk,
  agentName,
  hasSchedulingUrl,
  clientPushToken,
}: ClientDetailModalProps) {
  const frequencyLabel = (freq?: string) => {
    switch (freq) {
      case 'quarterly': return '/qtr';
      case 'semi-annual': return '/semi';
      case 'annual': return '/yr';
      default: return '/mo';
    }
  };

  const [copied, setCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // ── Notification compose state ──
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [includeBookingLink, setIncludeBookingLink] = useState(false);
  const [notifSending, setNotifSending] = useState(false);
  const [notifStatus, setNotifStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [notifError, setNotifError] = useState('');
  const [showNotifForm, setShowNotifForm] = useState(false);

  // ── Holiday card state ──
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState('thanksgiving');
  const [holidaySending, setHolidaySending] = useState(false);
  const [holidayStatus, setHolidayStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [holidayError, setHolidayError] = useState('');

  // ── Send code state ──
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeSendError, setCodeSendError] = useState<string | null>(null);

  // ── Flag at risk inline state ──
  const [flaggingPolicyId, setFlaggingPolicyId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState<'lapsed_payment' | 'cancellation'>('lapsed_payment');
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagResult, setFlagResult] = useState<{ policyId: string; success: boolean; message: string } | null>(null);

  // ── Referral link state ──
  const [referralName, setReferralName] = useState<string | null>(null);
  const [clearingReferral, setClearingReferral] = useState(false);
  const [editingClientInline, setEditingClientInline] = useState(false);
  const [clientDraft, setClientDraft] = useState<{ name: string; email: string; phone: string; dateOfBirth: string; preferredLanguage: SupportedLanguage }>({
    name: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    preferredLanguage: 'en',
  });
  const [clientEditError, setClientEditError] = useState('');
  const [clientEditSuccess, setClientEditSuccess] = useState('');
  const [savingClientInline, setSavingClientInline] = useState(false);

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

  // Fetch referral name when sourceReferralId is set
  useEffect(() => {
    if (!client?.sourceReferralId) {
      setReferralName(null);
      return;
    }
    if (client.sourceReferralName) {
      setReferralName(client.sourceReferralName);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const firestore = await import('firebase/firestore');
        const { db } = await import('../firebase');
        const refDoc = await firestore.getDoc(
          firestore.doc(db, 'agents', client.agentId, 'referrals', client.sourceReferralId!),
        );
        if (!cancelled && refDoc.exists()) {
          setReferralName((refDoc.data().referralName as string) || 'Unknown');
        }
      } catch {
        if (!cancelled) setReferralName('Referral');
      }
    })();
    return () => { cancelled = true; };
  }, [client?.sourceReferralId, client?.sourceReferralName, client?.agentId]);

  const handleClearReferralLink = useCallback(async () => {
    if (!client) return;
    setClearingReferral(true);
    try {
      const firestore = await import('firebase/firestore');
      const { db } = await import('../firebase');
      await firestore.updateDoc(
        firestore.doc(db, 'agents', client.agentId, 'clients', client.id),
        { sourceReferralId: null },
      );
      setReferralName(null);
    } catch (err) {
      console.error('Error clearing referral link:', err);
    } finally {
      setClearingReferral(false);
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

  const handleSendCode = useCallback(async () => {
    if (!client?.clientCode || !client.phone) return;
    setSendingCode(true);
    setCodeSendError(null);
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');
      const token = await currentUser.getIdToken();
      const firstName = (client.name || 'there').split(' ')[0];
      const agent = agentName || 'your agent';
      const message = buildWelcomeMessage({
        firstName,
        agentName: agent,
        code: client.clientCode,
        appUrl: 'https://agentforlife.app/app',
        language: resolveClientLanguage(client.preferredLanguage),
      });
      const res = await fetch('/api/client/welcome-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientPhone: client.phone, message }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error || `SMS send failed (${res.status})`);
      }
      setCodeSent(true);
      setTimeout(() => setCodeSent(false), 3000);
    } catch (err) {
      console.error('Failed to send code:', err);
      setCodeSendError(err instanceof Error ? err.message : 'Failed to send code');
      setTimeout(() => setCodeSendError(null), 5000);
    } finally {
      setSendingCode(false);
    }
  }, [client, agentName]);

  const handleFlagAtRisk = useCallback(async (policyId: string) => {
    if (!onFlagAtRisk) return;
    setFlagSubmitting(true);
    setFlagResult(null);
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');
      const token = await currentUser.getIdToken();
      const res = await fetch('/api/conservation/flag-at-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId: client?.id, policyId, reason: flagReason }),
      });
      const data = await res.json();
      if (data.success) {
        setFlagResult({
          policyId,
          success: true,
          message: data.alert?.isChargebackRisk
            ? 'Chargeback risk — outreach scheduled.'
            : 'Alert created. Outreach will begin.',
        });
        setFlaggingPolicyId(null);
      } else {
        setFlagResult({ policyId, success: false, message: data.error || 'Failed.' });
      }
    } catch {
      setFlagResult({ policyId, success: false, message: 'Something went wrong.' });
    } finally {
      setFlagSubmitting(false);
    }
  }, [client?.id, flagReason, onFlagAtRisk]);

  // Reset notification form when client changes
  useEffect(() => {
    if (client) {
      setNotifTitle('');
      setNotifBody('');
      setIncludeBookingLink(false);
      setNotifSending(false);
      setNotifStatus('idle');
      setNotifError('');
      setShowNotifForm(false);
      setShowHolidayForm(false);
      setHolidayStatus('idle');
      setHolidayError('');
      setCodeSent(false);
      setSendingCode(false);
      setFlaggingPolicyId(null);
      setFlagResult(null);
      setEditingClientInline(false);
      setClientDraft({
        name: client.name || '',
        email: client.email || '',
        phone: client.phone || '',
        dateOfBirth: client.dateOfBirth || '',
        preferredLanguage: resolveClientLanguage(client.preferredLanguage),
      });
      setClientEditError('');
      setClientEditSuccess('');
      setSavingClientInline(false);
    }
  }, [client?.id]);

  const startInlineClientEdit = useCallback(() => {
    if (!client) return;
    setClientDraft({
      name: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      dateOfBirth: client.dateOfBirth || '',
      preferredLanguage: resolveClientLanguage(client.preferredLanguage),
    });
    setClientEditError('');
    setClientEditSuccess('');
    setEditingClientInline(true);
  }, [client]);

  const cancelInlineClientEdit = useCallback(() => {
    setClientEditError('');
    setClientEditSuccess('');
    setEditingClientInline(false);
  }, []);

  const handleSaveInlineClient = useCallback(async () => {
    if (!client || !onUpdateClient) return;
    if (!clientDraft.name.trim()) {
      setClientEditError('Client name is required.');
      return;
    }
    setClientEditError('');
    setClientEditSuccess('');
    setSavingClientInline(true);
    try {
      await onUpdateClient(client.id, {
        name: clientDraft.name.trim(),
        email: clientDraft.email.trim(),
        phone: clientDraft.phone.trim(),
        dateOfBirth: clientDraft.dateOfBirth || '',
        preferredLanguage: clientDraft.preferredLanguage,
      });
      setClientEditSuccess('Client details updated.');
      setEditingClientInline(false);
      setTimeout(() => setClientEditSuccess(''), 1800);
    } catch (err) {
      setClientEditError(err instanceof Error ? err.message : 'Failed to update client.');
    } finally {
      setSavingClientInline(false);
    }
  }, [client, clientDraft, onUpdateClient]);

  const handleSendNotification = useCallback(async () => {
    if (!client || !notifBody.trim()) return;

    setNotifSending(true);
    setNotifStatus('idle');
    setNotifError('');

    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      const token = await currentUser.getIdToken();
      const response = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          clientId: client.id,
          title: notifTitle.trim() || undefined,
          body: notifBody.trim(),
          includeBookingLink: includeBookingLink || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send notification');
      }

      setNotifStatus('success');
      setNotifBody('');
      setNotifTitle('');
      setIncludeBookingLink(false);

      // Reset success message after 4 seconds
      setTimeout(() => {
        setNotifStatus('idle');
        setShowNotifForm(false);
      }, 4000);
    } catch (err) {
      setNotifStatus('error');
      setNotifError(err instanceof Error ? err.message : 'Failed to send notification');
    } finally {
      setNotifSending(false);
    }
  }, [client, notifTitle, notifBody, includeBookingLink]);

  const holidayCards: Record<string, { label: string; emoji: string; title: string; greeting: (name: string, agent: string) => string }> = {
    christmas: {
      label: 'Christmas', emoji: '🎄', title: 'Christmas Greetings',
      greeting: (n, a) => `Merry Christmas, ${n}! Wishing you and your family a season full of warmth, joy, and time together. It\u2019s a privilege to be your agent \u2014 I hope this holiday brings you everything you deserve. \u2014 ${a}`,
    },
    newyear: {
      label: "New Year\u2019s", emoji: '🎆', title: "New Year\u2019s Day Greetings",
      greeting: (n, a) => `Happy New Year, ${n}! Here\u2019s to a fresh start and a year full of good things. I\u2019m honored to be the one looking out for you and your family \u2014 let\u2019s make this year a great one. \u2014 ${a}`,
    },
    valentines: {
      label: "Valentine\u2019s Day", emoji: '💝', title: "Valentine\u2019s Day Greetings",
      greeting: (n, a) => `Happy Valentine\u2019s Day, ${n}! Today is all about the people who matter most \u2014 and protecting the ones you love is something I never take lightly. Enjoy every moment with your loved ones today. \u2014 ${a}`,
    },
    july4th: {
      label: '4th of July', emoji: '🇺🇸', title: 'Independence Day Greetings',
      greeting: (n, a) => `Happy 4th of July, ${n}! Wishing you a day full of good food, great company, and maybe a few fireworks. Enjoy the celebration \u2014 you and your family deserve it. \u2014 ${a}`,
    },
    thanksgiving: {
      label: 'Thanksgiving', emoji: '🍂', title: 'Thanksgiving Greetings',
      greeting: (n, a) => `Happy Thanksgiving, ${n}! I\u2019m grateful for the trust you place in me to protect what matters most to your family. I hope your table is full and your heart is fuller. Enjoy every bite. \u2014 ${a}`,
    },
  };

  const handleSendHolidayCard = useCallback(async () => {
    if (!client) return;

    setHolidaySending(true);
    setHolidayStatus('idle');
    setHolidayError('');

    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      const card = holidayCards[selectedHoliday];
      const firstName = (client.name || 'Friend').split(' ')[0];
      const agent = agentName || 'Your Agent';

      const token = await currentUser.getIdToken();
      const response = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          clientId: client.id,
          type: 'holiday',
          holiday: selectedHoliday,
          title: card.title,
          body: card.greeting(firstName, agent),
          includeBookingLink: false, // Holiday cards never show "Book your appointment"
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to send holiday card');

      setHolidayStatus('success');
      setTimeout(() => {
        setHolidayStatus('idle');
        setShowHolidayForm(false);
      }, 4000);
    } catch (err) {
      setHolidayStatus('error');
      setHolidayError(err instanceof Error ? err.message : 'Failed to send holiday card');
    } finally {
      setHolidaySending(false);
    }
  }, [client, selectedHoliday, agentName]);

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
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          isVisible && !isClosing ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* Slide-over Panel */}
      <div
        className={`relative w-full max-w-xl bg-white border-l border-gray-200 shadow-2xl flex flex-col h-full transition-transform duration-300 ease-out ${
          isVisible && !isClosing
            ? 'translate-x-0'
            : 'translate-x-full'
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
          <div className="flex items-center gap-2 shrink-0">
            {(onUpdateClient || onEditClient) && client && (
              <button
                onClick={() => {
                  if (onUpdateClient) {
                    startInlineClientEdit();
                  } else if (onEditClient) {
                    onEditClient(client);
                  }
                }}
                className="w-10 h-10 rounded-[5px] bg-gray-100 hover:bg-[#daf3f0] flex items-center justify-center text-gray-500 hover:text-[#005851] transition-colors"
                title="Edit client info"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            <button
              onClick={handleClose}
              className="w-10 h-10 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {/* Client Code Block */}
          <div className="px-6 pt-6 pb-4">
            <div className="bg-[#daf3f0] border border-[#45bcaa]/30 rounded-[5px] p-5">
              <p className="text-xs uppercase tracking-widest text-[#337973] font-semibold mb-2">Client Code</p>
              {client?.clientCode ? (
                <div className="flex items-center gap-3 flex-wrap">
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
                  {client.phone && (
                    <button
                      onClick={handleSendCode}
                      disabled={sendingCode || codeSent}
                      className="px-3 py-1.5 bg-[#005851] hover:bg-[#004540] disabled:opacity-60 text-white border border-[#005851] rounded-[5px] text-sm font-medium transition-colors flex items-center gap-1.5"
                    >
                      {codeSent ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Sent!
                        </>
                      ) : sendingCode ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Sending...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          Send to Client
                        </>
                      )}
                    </button>
                  )}
                  {codeSendError && (
                    <p className="text-red-600 text-xs mt-1">{codeSendError}</p>
                  )}
                </div>
              ) : (
                <span className="text-[#337973] text-sm italic">No code assigned</span>
              )}
            </div>
          </div>

          {/* Profile Info */}
          <div className="px-6 pb-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {editingClientInline ? (
                <>
                  <div className="col-span-2">
                    <p className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-1">Name</p>
                    <input
                      type="text"
                      value={clientDraft.name}
                      onChange={(e) => setClientDraft((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                      placeholder="Full name"
                    />
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-1">Email</p>
                    <input
                      type="email"
                      value={clientDraft.email}
                      onChange={(e) => setClientDraft((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-1">Phone</p>
                    <input
                      type="tel"
                      value={clientDraft.phone}
                      onChange={(e) => setClientDraft((prev) => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-1">Date of Birth</p>
                    <input
                      type="date"
                      value={clientDraft.dateOfBirth}
                      onChange={(e) => setClientDraft((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                    />
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-1">Preferred Language</p>
                    <select
                      value={clientDraft.preferredLanguage}
                      onChange={(e) => setClientDraft((prev) => ({ ...prev, preferredLanguage: resolveClientLanguage(e.target.value) }))}
                      className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                    </select>
                  </div>
                  <div className="col-span-2 flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={cancelInlineClientEdit}
                      disabled={savingClientInline}
                      className="px-3 py-2 text-sm font-medium rounded-[5px] bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveInlineClient}
                      disabled={savingClientInline}
                      className="px-3 py-2 text-sm font-semibold rounded-[5px] bg-[#005851] hover:bg-[#004540] text-white disabled:opacity-50"
                    >
                      {savingClientInline ? 'Saving...' : 'Save Details'}
                    </button>
                  </div>
                  {clientEditError && (
                    <div className="col-span-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-[5px] px-3 py-2">
                      {clientEditError}
                    </div>
                  )}
                </>
              ) : (
                <>
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
                  <div className="col-span-2">
                    <p className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-1">Preferred Language</p>
                    <p className="text-[#000000] font-medium">
                      {resolveClientLanguage(client?.preferredLanguage) === 'es' ? 'Spanish' : 'English'}
                    </p>
                  </div>
                </>
              )}
              {clientEditSuccess && (
                <div className="col-span-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-[5px] px-3 py-2">
                  {clientEditSuccess}
                </div>
              )}
              {client?.sourceReferralId && (
                <div className="col-span-2">
                  <p className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-1">Referred By</p>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded text-sm font-medium text-blue-700">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {referralName || 'Loading...'}
                    </span>
                    <button
                      onClick={handleClearReferralLink}
                      disabled={clearingReferral}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      title="Remove referral link"
                    >
                      {clearingReferral ? 'Clearing...' : 'Clear'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200" />

          {/* ── Send Notification Section ── */}
          <div className="px-6 pt-5 pb-4">
            {!showNotifForm && !showHolidayForm ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowNotifForm(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#005851]/5 hover:bg-[#005851]/10 border border-[#005851]/20 hover:border-[#005851]/30 rounded-[5px] text-[#005851] font-semibold text-sm transition-all duration-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  Send Message
                </button>
                <button
                  onClick={() => setShowHolidayForm(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 hover:border-amber-300 rounded-[5px] text-amber-800 font-semibold text-sm transition-all duration-200"
                >
                  <span className="text-base">🎄</span>
                  Send Holiday Card
                </button>
              </div>
            ) : showHolidayForm ? (
              <div className="bg-amber-50 border border-amber-200 rounded-[5px] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                    <span className="text-base">🎄</span>
                    Send Holiday Card
                  </h3>
                  <button
                    onClick={() => { setShowHolidayForm(false); setHolidayStatus('idle'); }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {clientPushToken === null && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-gray-100 border border-gray-200 rounded-[5px] text-xs text-gray-500">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    This client has not enabled push notifications yet.
                  </div>
                )}

                {holidayStatus === 'success' ? (
                  <div className="flex items-center gap-2 px-3 py-3 bg-green-50 border border-green-200 rounded-[5px] text-sm text-green-700">
                    <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-medium">Holiday card sent!</span>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(Object.entries(holidayCards) as Array<[HolidayCardKey, { label: string; emoji: string }]>).map(([key, card]) => (
                        <button
                          key={key}
                          onClick={() => setSelectedHoliday(key)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${selectedHoliday === key ? 'bg-amber-800 text-white shadow-sm' : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-100'}`}
                        >
                          {card.emoji} {card.label}
                        </button>
                      ))}
                    </div>

                    <div className="bg-white rounded-[5px] border border-amber-100 p-3 mb-3">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Preview</p>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {holidayCards[selectedHoliday].greeting(
                          (client?.name || 'Friend').split(' ')[0],
                          agentName || 'Your Agent'
                        )}
                      </p>
                    </div>

                    {holidayStatus === 'error' && (
                      <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-[5px] text-xs text-red-600">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {holidayError}
                      </div>
                    )}

                    <button
                      onClick={handleSendHolidayCard}
                      disabled={holidaySending || clientPushToken === null}
                      className="w-full px-4 py-2.5 bg-amber-700 hover:bg-amber-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-[5px] shadow-lg shadow-amber-700/20 transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                    >
                      {holidaySending ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Sending...
                        </>
                      ) : (
                        <>
                          <span>{holidayCards[selectedHoliday].emoji}</span>
                          Send {holidayCards[selectedHoliday].label} Card
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="bg-[#005851]/5 border border-[#005851]/20 rounded-[5px] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-[#005851] flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    Send Push Notification
                  </h3>
                  <button
                    onClick={() => {
                      setShowNotifForm(false);
                      setNotifStatus('idle');
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* No push token warning */}
                {clientPushToken === null && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-gray-100 border border-gray-200 rounded-[5px] text-xs text-gray-500">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    This client has not enabled push notifications yet.
                  </div>
                )}

                {notifStatus === 'success' ? (
                  <div className="flex items-center gap-2 px-3 py-3 bg-green-50 border border-green-200 rounded-[5px] text-sm text-green-700">
                    <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-medium">Notification sent successfully!</span>
                  </div>
                ) : (
                  <>
                    {/* Title field */}
                    <div className="mb-2">
                      <input
                        type="text"
                        value={notifTitle}
                        onChange={(e) => setNotifTitle(e.target.value)}
                        placeholder={`Message from ${agentName || 'your agent'}`}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[5px] text-sm text-[#000000] placeholder-gray-400 focus:outline-none focus:border-[#005851]/50 focus:ring-1 focus:ring-[#005851]/20 transition-colors"
                      />
                    </div>

                    {/* Message body */}
                    <div className="mb-2 relative">
                      <textarea
                        value={notifBody}
                        onChange={(e) => setNotifBody(e.target.value)}
                        placeholder="Type your message to the client..."
                        rows={3}
                        maxLength={500}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[5px] text-sm text-[#000000] placeholder-gray-400 focus:outline-none focus:border-[#005851]/50 focus:ring-1 focus:ring-[#005851]/20 transition-colors resize-none"
                      />
                      <span className="absolute bottom-2 right-3 text-xs text-gray-300">
                        {notifBody.length}/500
                      </span>
                    </div>

                    {/* Include booking link toggle */}
                    {hasSchedulingUrl && (
                      <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
                        <div
                          className={`w-8 h-[18px] rounded-full transition-colors duration-200 relative ${
                            includeBookingLink ? 'bg-[#005851]' : 'bg-gray-300'
                          }`}
                          onClick={() => setIncludeBookingLink(!includeBookingLink)}
                        >
                          <div
                            className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow-sm transition-transform duration-200 ${
                              includeBookingLink ? 'translate-x-[16px]' : 'translate-x-[2px]'
                            }`}
                          />
                        </div>
                        <span className="text-xs text-gray-600 font-medium">
                          Include &ldquo;Book your appointment&rdquo; link
                        </span>
                      </label>
                    )}

                    {/* Error message */}
                    {notifStatus === 'error' && (
                      <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-[5px] text-xs text-red-600">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {notifError}
                      </div>
                    )}

                    {/* Send button */}
                    <button
                      onClick={handleSendNotification}
                      disabled={!notifBody.trim() || notifSending || clientPushToken === null}
                      className="w-full px-4 py-2.5 bg-[#005851] hover:bg-[#004540] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-[5px] shadow-lg shadow-[#005851]/20 hover:shadow-[#005851]/30 transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                    >
                      {notifSending ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Sending...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          Send Notification
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}
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
                {policies.map((policy) => {
                  const anniversaryDate = getAnniversaryDate(policy.createdAt, policy.effectiveDate);
                  const days = anniversaryDate ? daysUntilAnniversary(anniversaryDate) : null;
                  return (
                  <div
                    key={policy.id}
                    className={`bg-white rounded-[5px] border p-5 transition-all duration-200 ${
                      anniversaryDate
                        ? 'border-amber-300 ring-1 ring-amber-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Anniversary badge */}
                    {anniversaryDate && days !== null && (
                      <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                        <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-amber-800 font-medium">
                          1-year anniversary {days === 0 ? 'is today' : days === 1 ? 'is tomorrow' : `in ${days} days`} — consider rewriting this policy
                        </span>
                      </div>
                    )}

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

                    {/* Policy Owner & Beneficiaries */}
                    {(policy.policyOwner || policy.beneficiaries?.length || policy.beneficiary) && (
                      <div className="mb-4 pb-4 border-b border-gray-200">
                        {policy.policyOwner && (
                          <div className="mb-3">
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Owner</p>
                            <p className="text-[#000000] text-sm">{policy.policyOwner}</p>
                          </div>
                        )}
                        {policy.beneficiaries && policy.beneficiaries.length > 0 ? (
                          <div className="space-y-2">
                            {policy.beneficiaries.filter(b => b.type === 'primary').length > 0 && (
                              <div>
                                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Primary Beneficiaries</p>
                                {policy.beneficiaries.filter(b => b.type === 'primary').map((b, i) => (
                                  <p key={i} className="text-[#000000] text-sm">
                                    {b.name}
                                    {b.relationship && <span className="text-gray-400 text-xs ml-1">({b.relationship})</span>}
                                    {b.percentage != null && <span className="text-gray-400 text-xs ml-1">{b.percentage}%</span>}
                                  </p>
                                ))}
                              </div>
                            )}
                            {policy.beneficiaries.filter(b => b.type === 'contingent').length > 0 && (
                              <div>
                                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Contingent Beneficiaries</p>
                                {policy.beneficiaries.filter(b => b.type === 'contingent').map((b, i) => (
                                  <p key={i} className="text-[#000000] text-sm">
                                    {b.name}
                                    {b.relationship && <span className="text-gray-400 text-xs ml-1">({b.relationship})</span>}
                                    {b.percentage != null && <span className="text-gray-400 text-xs ml-1">{b.percentage}%</span>}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : policy.beneficiary ? (
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Beneficiary</p>
                            <p className="text-[#000000] text-sm">{policy.beneficiary}</p>
                          </div>
                        ) : null}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      {policy.policyType === 'Term Life' && policy.renewalDate && (
                        <div className="col-span-2">
                          <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Renewal Date</p>
                          <p className="text-[#000000]">{formatDate(policy.renewalDate)}</p>
                        </div>
                      )}
                      {policy.policyType === 'Mortgage Protection' ? (
                        <>
                          {policy.amountOfProtection ? (
                            <div className="col-span-2 bg-[#44bbaa]/10 rounded-lg p-4 border border-[#45bcaa]/30 text-center">
                              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Coverage Duration</p>
                              <p className="text-[#005851] text-2xl font-bold">{policy.amountOfProtection} {policy.protectionUnit === 'months' ? 'Months' : 'Years'}</p>
                              <p className="text-[#005851]/60 text-xs mt-1">of mortgage protection</p>
                            </div>
                          ) : null}
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Death Benefit</p>
                            <p className="text-[#000000] font-semibold">{formatCurrency(policy.coverageAmount)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Premium</p>
                            <p className="text-[#000000] font-semibold">{formatCurrency(policy.premiumAmount)}{frequencyLabel(policy.premiumFrequency)}</p>
                          </div>
                        </>
                      ) : (policy.policyType === 'Accidental' || policy.policyType === 'Term Life') ? (
                        <>
                          <div className="col-span-2 bg-[#44bbaa]/10 rounded-lg p-3 border border-[#45bcaa]/30">
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Death Benefit</p>
                            <p className="text-[#005851] text-xl font-bold">{formatCurrency(policy.coverageAmount)}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Premium</p>
                            <p className="text-[#000000] font-semibold">{formatCurrency(policy.premiumAmount)}{frequencyLabel(policy.premiumFrequency)}</p>
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
                            <p className="text-[#000000] font-semibold">{formatCurrency(policy.premiumAmount)}{frequencyLabel(policy.premiumFrequency)}</p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Flag at risk result */}
                    {flagResult && flagResult.policyId === policy.id && (
                      <div className={`mt-3 px-3 py-2 rounded-[5px] text-xs font-medium ${flagResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                        {flagResult.message}
                      </div>
                    )}

                    {/* Flag at risk inline */}
                    {flaggingPolicyId === policy.id && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-[5px] space-y-3">
                        <p className="text-xs font-semibold text-amber-800">What happened?</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setFlagReason('lapsed_payment')}
                            className={`px-3 py-2 rounded-[5px] border text-xs font-medium transition-all ${
                              flagReason === 'lapsed_payment'
                                ? 'border-[#005851] bg-[#daf3f0] text-[#005851]'
                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            Missed Payment
                          </button>
                          <button
                            onClick={() => setFlagReason('cancellation')}
                            className={`px-3 py-2 rounded-[5px] border text-xs font-medium transition-all ${
                              flagReason === 'cancellation'
                                ? 'border-[#005851] bg-[#daf3f0] text-[#005851]'
                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            Cancellation
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleFlagAtRisk(policy.id)}
                            disabled={flagSubmitting}
                            className="flex-1 px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-1.5"
                          >
                            {flagSubmitting ? 'Creating...' : 'Flag & Start Outreach'}
                          </button>
                          <button
                            onClick={() => setFlaggingPolicyId(null)}
                            className="px-3 py-2 bg-white border border-gray-200 text-gray-500 text-xs font-medium rounded-[5px] hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Edit/Delete/Flag Actions */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                      {onFlagAtRisk && policy.status !== 'Lapsed' && flaggingPolicyId !== policy.id && (
                        <button
                          onClick={() => { setFlaggingPolicyId(policy.id); setFlagResult(null); }}
                          className="flex-1 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-800 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-amber-200"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          Flag At Risk
                        </button>
                      )}
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
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Action Footer ── */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-[5px] shrink-0">
          {client && (
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#6B7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="text-xs text-[#6B7280] font-medium">Anniversary reviews</span>
              </div>
              <button
                onClick={async () => {
                  try {
                    const { doc: firestoreDoc, updateDoc: firestoreUpdate } = await import('firebase/firestore');
                    const { db: firestoreDb } = await import('../firebase');
                    const ref = firestoreDoc(firestoreDb, 'agents', client.agentId, 'clients', client.id);
                    await firestoreUpdate(ref, { policyReviewOptOut: !client.policyReviewOptOut });
                  } catch (err) { console.error('Error toggling review opt-out:', err); }
                }}
                className={`relative w-9 h-5 rounded-full transition-colors ${client.policyReviewOptOut ? 'bg-gray-300' : 'bg-[#3DD6C3]'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${client.policyReviewOptOut ? 'left-0.5' : 'left-[18px]'}`} />
              </button>
            </div>
          )}
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
