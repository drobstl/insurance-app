'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';

interface Referral {
  id: string;
  referralName: string;
  referralPhone: string;
  clientName: string;
  status: string;
  conversation: { role: string; body: string; timestamp: string }[];
  gatheredInfo: Record<string, string>;
  appointmentBooked: boolean;
  aiEnabled?: boolean;
  createdAt: unknown;
}

export default function ReferralsPage() {
  const { user, agentProfile, loading } = useDashboard();

  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(true);
  const [expandedReferral, setExpandedReferral] = useState<string | null>(null);
  const [agentTwilioNumber, setAgentTwilioNumber] = useState<string | null>(null);
  const [provisioningNumber, setProvisioningNumber] = useState(false);
  const [manualMessageText, setManualMessageText] = useState('');
  const [sendingManualMessage, setSendingManualMessage] = useState(false);

  const aiAssistantEnabled = agentProfile.aiAssistantEnabled ?? true;

  useEffect(() => {
    if (!user) return;

    const fetchTwilioNumber = async () => {
      try {
        const agentDoc = await getDoc(doc(db, 'agents', user.uid));
        if (agentDoc.exists()) {
          const data = agentDoc.data();
          if (data.twilioPhoneNumber) {
            setAgentTwilioNumber(data.twilioPhoneNumber);
          }
        }
      } catch (err) {
        console.error('Error fetching Twilio number:', err);
      }
    };
    fetchTwilioNumber();

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

  const handleProvisionNumber = async () => {
    if (!user) return;
    setProvisioningNumber(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/twilio/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success && data.phoneNumber) {
        setAgentTwilioNumber(data.phoneNumber);
      }
    } catch (err) {
      console.error('Error provisioning number:', err);
    } finally {
      setProvisioningNumber(false);
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
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#000000]">Referrals</h1>
        <p className="text-[#707070] text-sm mt-1">Track referral conversations and booked appointments.</p>
      </div>

      {/* AI Business Line Card */}
      <div className="bg-white rounded-[5px] border border-[#d0d0d0] mb-6 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#000000] mb-1">Your AI Business Line</h3>
            {agentTwilioNumber ? (
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-[#005851]">{agentTwilioNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')}</span>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Active</span>
              </div>
            ) : (
              <p className="text-sm text-[#707070]">Get your dedicated AI business line — calls forward to your phone, texts are handled by AI.</p>
            )}
          </div>
          {!agentTwilioNumber && (
            <button
              onClick={handleProvisionNumber}
              disabled={provisioningNumber}
              className="px-4 py-2 bg-[#005851] text-white rounded-[5px] text-sm font-semibold hover:bg-[#004440] transition-colors disabled:opacity-50"
            >
              {provisioningNumber ? 'Setting up...' : 'Get My Number'}
            </button>
          )}
        </div>
        {agentTwilioNumber && (
          <p className="text-xs text-[#707070] mt-2">
            {aiAssistantEnabled
              ? 'Calls to this number ring your personal phone. Referral texts are handled by AI — responding as you.'
              : 'Manual mode — text referrals through your dashboard. AI tracks everything.'}
          </p>
        )}
      </div>

      {/* Referrals List */}
      <div className="bg-white rounded-[5px] border border-[#d0d0d0]">
        <div className="px-4 py-3 border-b border-[#d0d0d0] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#000000]">Referral Conversations</h2>
          <div className="flex gap-2 text-xs">
            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">{referrals.filter(r => r.status === 'pending').length} Pending</span>
            <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full">{referrals.filter(r => ['outreach-sent', 'drip-1', 'drip-2'].includes(r.status)).length} Outreach</span>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{referrals.filter(r => r.status === 'active').length} Active</span>
            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{referrals.filter(r => r.status === 'booked' || r.appointmentBooked).length} Booked</span>
          </div>
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
                    <p className="text-xs text-[#707070]">Inside their AgentForLife app, they enter their friend&rsquo;s name and phone number.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-[#f8f8f8] rounded-[5px] p-3.5">
                  <span className="w-6 h-6 bg-[#005851] text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                  <div>
                    <p className="text-sm font-semibold text-[#000000]">AI texts the referral from your business line</p>
                    <p className="text-xs text-[#707070]">A personalized message goes out automatically, sounding like you. It gathers info about their insurance needs.</p>
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
                pending: 'bg-yellow-100 text-yellow-700',
                active: 'bg-blue-100 text-blue-700',
                'outreach-sent': 'bg-teal-100 text-teal-700',
                'drip-1': 'bg-orange-100 text-orange-700',
                'drip-2': 'bg-orange-100 text-orange-700',
                'drip-complete': 'bg-gray-100 text-gray-600',
                'booking-sent': 'bg-purple-100 text-purple-700',
                booked: 'bg-green-100 text-green-700',
                closed: 'bg-gray-100 text-gray-600',
              };
              const statusLabels: Record<string, string> = {
                pending: 'Waiting for reply',
                active: 'In conversation',
                'outreach-sent': 'AI reached out',
                'drip-1': 'Follow-up 1',
                'drip-2': 'Follow-up 2',
                'drip-complete': 'No response',
                'booking-sent': 'Booking link sent',
                booked: 'Appointment booked',
                closed: 'Closed',
              };
              return (
                <div key={referral.id} className="px-4 py-3">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => { setExpandedReferral(expandedReferral === referral.id ? null : referral.id); setManualMessageText(''); }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#005851] flex items-center justify-center text-white text-sm font-bold">
                        {(referral.referralName || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#000000]">{referral.referralName}</p>
                        <p className="text-xs text-[#707070]">Referred by {referral.clientName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[referral.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabels[referral.status] || referral.status}
                      </span>
                      <span className="text-xs text-[#707070]">{referral.conversation?.length || 0} msgs</span>
                      <svg className={`w-4 h-4 text-[#707070] transition-transform ${expandedReferral === referral.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

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

                      {/* Gathered info */}
                      {referral.gatheredInfo && Object.keys(referral.gatheredInfo).length > 0 && (
                        <div className="bg-[#f8fffe] border border-[#d0e8e5] rounded-[5px] p-3 mt-2">
                          <p className="text-xs font-semibold text-[#005851] mb-1">Gathered Info</p>
                          {Object.entries(referral.gatheredInfo).map(([key, value]) => (
                            <p key={key} className="text-xs text-[#707070]">
                              <span className="font-medium text-[#000000]">{key}:</span> {value}
                            </p>
                          ))}
                        </div>
                      )}

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
