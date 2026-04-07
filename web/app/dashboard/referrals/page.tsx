'use client';

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, orderBy, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';
import SectionTipCard from '../../../components/SectionTipCard';

interface PersonInfo {
  name?: string;
  dateOfBirth?: string;
  healthConditions?: string;
  medications?: string;
  smokerStatus?: string;
}

interface ReferralGatheredInfo {
  dateOfBirth?: string;
  healthConditions?: string;
  medications?: string;
  smokerStatus?: string;
  spouseOrPartner?: PersonInfo;
  homeownerStatus?: string;
  mortgageBalance?: string;
  mortgageTimeRemaining?: string;
  currentCoverage?: string;
  familySituation?: string;
  mainConcern?: string;
  [key: string]: unknown;
}

interface Referral {
  id: string;
  referralName: string;
  referralPhone: string;
  clientName: string;
  status: string;
  conversation: { role: string; body: string; timestamp: string }[];
  gatheredInfo: ReferralGatheredInfo;
  appointmentBooked: boolean;
  aiEnabled?: boolean;
  createdAt: unknown;
}

export default function ReferralsPage() {
  const { user, agentProfile, setAgentProfile, loading, dismissTip } = useDashboard();

  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(true);
  const [expandedReferral, setExpandedReferral] = useState<string | null>(null);
  const [manualMessageText, setManualMessageText] = useState('');
  const [sendingManualMessage, setSendingManualMessage] = useState(false);
  const [togglingAi, setTogglingAi] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const aiAssistantEnabled = agentProfile.aiAssistantEnabled ?? false;
  const hasBusinessCard = !!agentProfile.businessCardBase64;
  const hasSchedulingUrl = !!agentProfile.schedulingUrl;
  const canEnableAi = hasBusinessCard && hasSchedulingUrl;

  useEffect(() => {
    if (!user) return;

    const referralsRef = collection(db, 'agents', user.uid, 'referrals');
    const refQuery = query(referralsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(refQuery, (snapshot) => {
      const refList: Referral[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as Referral));
      setReferrals(refList);
      setReferralsLoading(false);
    }, (error) => {
      console.error('Error fetching referrals:', error);
      setReferralsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleToggleAi = async () => {
    if (!user || togglingAi) return;

    if (!aiAssistantEnabled && !canEnableAi) return;

    setTogglingAi(true);
    try {
      const newValue = !aiAssistantEnabled;
      await updateDoc(doc(db, 'agents', user.uid), {
        aiAssistantEnabled: newValue,
      });
      setAgentProfile((prev) => ({ ...prev, aiAssistantEnabled: newValue }));
    } catch (err) {
      console.error('Error toggling AI assistant:', err);
    } finally {
      setTogglingAi(false);
    }
  };

  const handleSendManualMessage = async (referralId: string) => {
    if (!user || !manualMessageText.trim() || sendingManualMessage) return;
    setSendingManualMessage(true);
    try {
      const res = await fetch('/api/referral/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: user.uid,
          referralId,
          body: manualMessageText.trim(),
        }),
      });
      if (res.ok) {
        setManualMessageText('');
      } else {
        console.error('Send message failed:', await res.text());
      }
    } catch (err) {
      console.error('Error sending manual message:', err);
    } finally {
      setSendingManualMessage(false);
    }
  };

  const handleDeleteReferral = async (referralId: string) => {
    if (!user) return;
    setDeletingId(referralId);
    try {
      await deleteDoc(doc(db, 'agents', user.uid, 'referrals', referralId));
      setConfirmDeleteId(null);
      if (expandedReferral === referralId) setExpandedReferral(null);
    } catch (err) {
      console.error('Error deleting referral:', err);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin w-8 h-8 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-[#000000]">Referrals</h1>
        <p className="text-[#707070] text-sm mt-1">Track referral conversations and booked appointments.</p>
      </div>

      {!agentProfile.tipsSeen?.referrals && (
        <SectionTipCard onDismiss={() => dismissTip('referrals')}>
          When clients refer someone through the app, they show up here. Turn on the AI assistant in Settings (you&rsquo;ll need a business card and scheduling link first).
        </SectionTipCard>
      )}

      {/* AI Referral Assistant Card */}
      <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] mb-6 p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1 md:mr-4">
            <h3 className="text-sm font-semibold text-[#000000] mb-1">AI Referral Assistant</h3>
            {aiAssistantEnabled ? (
              <p className="text-sm text-[#707070]">
                Referral texts are handled by AI via iMessage — responding as you, building trust through conversation, and booking appointments.
              </p>
            ) : canEnableAi ? (
              <p className="text-sm text-[#707070]">
                Enable AI to automatically text referrals via iMessage, have qualifying conversations, and book appointments — all as you.
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-sm text-[#707070]">Complete these items before enabling:</p>
                <div className="flex flex-col gap-1">
                  <span className={`text-xs flex items-center gap-1.5 ${hasBusinessCard ? 'text-green-600' : 'text-amber-600'}`}>
                    {hasBusinessCard ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                    )}
                    Business card uploaded
                  </span>
                  <span className={`text-xs flex items-center gap-1.5 ${hasSchedulingUrl ? 'text-green-600' : 'text-amber-600'}`}>
                    {hasSchedulingUrl ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                    )}
                    Scheduling URL set
                  </span>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={handleToggleAi}
            disabled={togglingAi || (!aiAssistantEnabled && !canEnableAi)}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#45bcaa] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              aiAssistantEnabled ? 'bg-[#005851]' : 'bg-gray-300'
            }`}
            role="switch"
            aria-checked={aiAssistantEnabled}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                aiAssistantEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
        {aiAssistantEnabled && (
          <div className="flex items-center gap-2 mt-3">
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Active</span>
            <span className="text-xs text-[#707070]">iMessage with SMS fallback</span>
          </div>
        )}
      </div>

      {/* Referrals List */}
      <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px]">
        <div className="px-4 py-3 border-b border-[#d0d0d0]">
          <h2 className="text-sm font-semibold text-[#000000]">Referral Conversations</h2>
        </div>

        {referralsLoading ? (
          <div className="flex items-center justify-center py-8">
            <svg className="animate-spin w-8 h-8 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : referrals.length === 0 ? (
          <div className="p-6">
            <div className="max-w-lg mx-auto">
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-[#daf3f0] rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[#000000] mb-1">No referrals yet</h3>
                <p className="text-sm text-[#707070]">Here&rsquo;s how the referral system works:</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 bg-[#f8f8f8] rounded-[5px] p-3.5">
                  <span className="w-6 h-6 bg-[#005851] text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                  <div>
                    <p className="text-sm font-semibold text-[#000000]">Your client taps &ldquo;Refer a Friend&rdquo;</p>
                    <p className="text-xs text-[#707070]">Inside their AgentForLife app, they pick a contact and send a personal recommendation with your business card attached.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-[#f8f8f8] rounded-[5px] p-3.5">
                  <span className="w-6 h-6 bg-[#005851] text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                  <div>
                    <p className="text-sm font-semibold text-[#000000]">AI texts the referral via iMessage</p>
                    <p className="text-xs text-[#707070]">A personalized message goes out automatically via iMessage (blue bubbles, ~99% read rate), sounding like you. It builds trust through conversation before booking.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-[#f8f8f8] rounded-[5px] p-3.5">
                  <span className="w-6 h-6 bg-[#005851] text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                  <div>
                    <p className="text-sm font-semibold text-[#000000]">You see the conversation here</p>
                    <p className="text-xs text-[#707070]">Watch the AI handle the conversation, or jump in manually at any time. Once they&rsquo;re warm, a booking link is sent.</p>
                  </div>
                </div>
              </div>

              <p className="text-center text-xs text-[#707070] mt-5">
                To get started, make sure your clients have downloaded the app with their code. Referrals flow in automatically.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#d0d0d0]">
            {referrals.map((referral) => {
              const statusColors: Record<string, string> = {
                pending: 'bg-teal-100 text-teal-700',
                'outreach-sent': 'bg-teal-100 text-teal-700',
                'drip-1': 'bg-teal-100 text-teal-700',
                'drip-2': 'bg-teal-100 text-teal-700',
                active: 'bg-blue-100 text-blue-700',
                'booking-sent': 'bg-purple-100 text-purple-700',
                booked: 'bg-green-100 text-green-700',
                'drip-complete': 'bg-gray-100 text-gray-600',
                closed: 'bg-gray-100 text-gray-600',
              };
              const statusLabels: Record<string, string> = {
                pending: 'AI Working',
                'outreach-sent': 'AI Working',
                'drip-1': 'AI Working',
                'drip-2': 'AI Working',
                active: 'In Conversation',
                'booking-sent': 'Booking Sent',
                booked: 'Booked',
                'drip-complete': 'No Response',
                closed: 'Closed',
              };
              return (
                <div key={referral.id} className="px-4 py-3">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => { setExpandedReferral(expandedReferral === referral.id ? null : referral.id); setManualMessageText(''); }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-[#005851] flex items-center justify-center text-white text-sm font-bold">
                        {(referral.referralName || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#000000] truncate">{referral.referralName}</p>
                        <p className="text-xs text-[#707070] truncate">Referred by {referral.clientName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[referral.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabels[referral.status] || referral.status}
                      </span>
                      <span className="text-xs text-[#707070]">{referral.conversation?.length || 0} msgs</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(confirmDeleteId === referral.id ? null : referral.id); }}
                        className="p-1 rounded text-[#707070] hover:bg-red-100 hover:text-red-600 transition-colors"
                        title="Delete conversation"
                        aria-label="Delete conversation"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <svg className={`w-4 h-4 text-[#707070] transition-transform ${expandedReferral === referral.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Confirm delete */}
                  {confirmDeleteId === referral.id && (
                    <div className="mt-3 pl-12 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-[5px]">
                      <span className="text-sm text-[#000000]">Delete this referral conversation? This cannot be undone.</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteReferral(referral.id)}
                        disabled={deletingId === referral.id}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium rounded-[5px]"
                      >
                        {deletingId === referral.id ? 'Deleting...' : 'Delete'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                        className="px-3 py-1.5 border border-[#d0d0d0] bg-white hover:bg-gray-50 text-xs font-medium rounded-[5px]"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Expanded conversation */}
                  {expandedReferral === referral.id && (
                    <div className="mt-3 pl-12 space-y-2">
                      {/* Manual status dropdown */}
                      <div className="flex items-center gap-2 mb-2">
                        <label className="text-xs text-[#707070]">Status:</label>
                        <select
                          value={referral.status}
                          onChange={async (e) => {
                            if (!user) return;
                            const newStatus = e.target.value;
                            try {
                              await updateDoc(doc(db, 'agents', user.uid, 'referrals', referral.id), { status: newStatus, updatedAt: serverTimestamp() });
                            } catch (err) {
                              console.error('Error updating status:', err);
                            }
                          }}
                          className="text-xs border border-[#d0d0d0] rounded px-2 py-1 bg-white text-[#000000] focus:outline-none focus:ring-1 focus:ring-[#45bcaa]"
                        >
                          <option value="pending">Waiting for reply</option>
                          <option value="active">In conversation</option>
                          <option value="outreach-sent">AI reached out</option>
                          <option value="drip-1">Follow-up 1</option>
                          <option value="drip-2">Follow-up 2</option>
                          <option value="drip-complete">No response</option>
                          <option value="booking-sent">Booking link sent</option>
                          <option value="booked">Appointment booked</option>
                          <option value="closed">Closed</option>
                        </select>
                      </div>

                      {referral.conversation && referral.conversation.length > 0 && (
                        <>
                          {referral.conversation.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'referral' ? 'justify-start' : 'justify-end'}`}>
                              <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                                msg.role === 'agent-ai'
                                  ? 'bg-[#005851] text-white'
                                  : msg.role === 'agent-manual'
                                  ? 'bg-[#1a6b5c] text-white'
                                  : 'bg-[#f0f0f0] text-[#000000]'
                              }`}>
                                <p>{msg.body}</p>
                                <p className={`text-[10px] mt-1 ${msg.role === 'referral' ? 'text-[#a0a0a0]' : 'text-white/60'}`}>
                                  {msg.role === 'agent-ai' ? 'AI (as you)' : msg.role === 'agent-manual' ? 'You (manual)' : referral.referralName}
                                  {msg.timestamp && ` · ${new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                                </p>
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* Appointment Prep */}
                      {referral.gatheredInfo && Object.keys(referral.gatheredInfo).length > 0 && (() => {
                        const info = referral.gatheredInfo;
                        const hasPrimary = info.dateOfBirth || info.healthConditions || info.medications || info.smokerStatus;
                        const hasSpouse = info.spouseOrPartner && Object.keys(info.spouseOrPartner).length > 0;
                        const hasHousehold = info.homeownerStatus || info.mortgageBalance || info.mortgageTimeRemaining || info.currentCoverage || info.familySituation || info.mainConcern;

                        const InfoRow = ({ label, value }: { label: string; value?: string }) =>
                          value ? (
                            <div className="flex gap-2 text-xs">
                              <span className="font-medium text-[#005851] min-w-[100px] shrink-0">{label}</span>
                              <span className="text-[#333]">{value}</span>
                            </div>
                          ) : null;

                        return (
                          <div className="bg-[#f8fffe] border border-[#d0e8e5] rounded-[5px] p-3 mt-2 space-y-2.5">
                            <div className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                              </svg>
                              <p className="text-xs font-semibold text-[#005851]">Appointment Prep</p>
                            </div>

                            {hasPrimary && (
                              <div className="space-y-1">
                                <p className="text-[10px] font-semibold text-[#707070] uppercase tracking-wider">{referral.referralName}</p>
                                <InfoRow label="Birthday" value={info.dateOfBirth} />
                                <InfoRow label="Health" value={info.healthConditions} />
                                <InfoRow label="Medications" value={info.medications} />
                                <InfoRow label="Smoker" value={info.smokerStatus} />
                              </div>
                            )}

                            {hasSpouse && info.spouseOrPartner && (
                              <div className="space-y-1 pt-1 border-t border-[#d0e8e5]">
                                <p className="text-[10px] font-semibold text-[#707070] uppercase tracking-wider">
                                  {info.spouseOrPartner.name || 'Spouse / Partner'}
                                </p>
                                <InfoRow label="Birthday" value={info.spouseOrPartner.dateOfBirth} />
                                <InfoRow label="Health" value={info.spouseOrPartner.healthConditions} />
                                <InfoRow label="Medications" value={info.spouseOrPartner.medications} />
                                <InfoRow label="Smoker" value={info.spouseOrPartner.smokerStatus} />
                              </div>
                            )}

                            {hasHousehold && (
                              <div className="space-y-1 pt-1 border-t border-[#d0e8e5]">
                                <p className="text-[10px] font-semibold text-[#707070] uppercase tracking-wider">Household</p>
                                <InfoRow label="Homeowner" value={info.homeownerStatus} />
                                <InfoRow label="Mortgage" value={info.mortgageBalance} />
                                <InfoRow label="Time left" value={info.mortgageTimeRemaining} />
                                <InfoRow label="Coverage" value={info.currentCoverage} />
                                <InfoRow label="Family" value={info.familySituation} />
                                <InfoRow label="Main concern" value={info.mainConcern} />
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Let AI Continue button — shown when agent has taken over manually */}
                      {referral.aiEnabled === false && (
                        <button
                          onClick={async () => {
                            if (!user) return;
                            try {
                              await updateDoc(doc(db, 'agents', user.uid, 'referrals', referral.id), { aiEnabled: true, updatedAt: serverTimestamp() });
                            } catch (err) {
                              console.error('Error re-enabling AI:', err);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#005851] hover:bg-[#004440] text-white text-xs font-medium rounded-[5px] transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Let AI Continue
                        </button>
                      )}

                      {/* Manual text input */}
                      <div className="flex gap-2 mt-2">
                        <input
                          type="text"
                          value={expandedReferral === referral.id ? manualMessageText : ''}
                          onChange={(e) => setManualMessageText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && manualMessageText.trim() && !sendingManualMessage) {
                              e.preventDefault();
                              handleSendManualMessage(referral.id);
                            }
                          }}
                          placeholder="Type a message..."
                          className="flex-1 px-3 py-2 text-sm border border-[#d0d0d0] rounded-[5px] bg-white text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#45bcaa] focus:border-[#45bcaa]"
                        />
                        <button
                          onClick={() => handleSendManualMessage(referral.id)}
                          disabled={!manualMessageText.trim() || sendingManualMessage}
                          className="px-3 py-2 bg-[#005851] hover:bg-[#004440] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-[5px] transition-colors flex items-center gap-1.5"
                        >
                          {sendingManualMessage ? (
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                          )}
                          Send
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
