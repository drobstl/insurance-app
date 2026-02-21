'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';

interface ConservationAlertUI {
  id: string;
  source: string;
  clientName: string;
  policyNumber: string;
  carrier: string;
  reason: string;
  clientId: string | null;
  policyId: string | null;
  policyAge: number | null;
  isChargebackRisk: boolean;
  priority: string;
  premiumAmount: number | null;
  policyType: string | null;
  clientHasApp: boolean;
  clientPolicyCount: number | null;
  status: string;
  scheduledOutreachAt: string | null;
  outreachSentAt: string | null;
  lastDripAt: string | null;
  dripCount: number;
  initialMessage: string | null;
  dripMessages: string[];
  aiInsight: string | null;
  notes: string | null;
  createdAt: Timestamp;
  resolvedAt: string | null;
}

export default function ConservationPage() {
  const { user, loading } = useDashboard();

  const [conservationAlerts, setConservationAlerts] = useState<ConservationAlertUI[]>([]);
  const [conservationLoading, setConservationLoading] = useState(false);
  const [conservationPasteText, setConservationPasteText] = useState('');
  const [conservationProcessing, setConservationProcessing] = useState(false);
  const [conservationProcessResult, setConservationProcessResult] = useState<{
    success: boolean;
    matched: boolean;
    alert: Record<string, unknown>;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    setConservationLoading(true);

    const alertsRef = collection(db, 'agents', user.uid, 'conservationAlerts');
    const alertsQuery = query(alertsRef, orderBy('createdAt', 'desc'));

    const unsubAlerts = onSnapshot(alertsQuery, (snapshot) => {
      const alertList: ConservationAlertUI[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as ConservationAlertUI));
      setConservationAlerts(alertList);
      setConservationLoading(false);
    }, (error) => {
      console.error('Error fetching conservation alerts:', error);
      setConservationLoading(false);
    });

    return () => unsubAlerts();
  }, [user]);

  const handleConservationSubmit = async () => {
    if (!user || !conservationPasteText.trim()) return;
    setConservationProcessing(true);
    setConservationProcessResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/conservation/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rawText: conservationPasteText }),
      });
      const data = await res.json();
      if (data.success) {
        setConservationProcessResult({ success: true, matched: data.matched, alert: data.alert });
        setConservationPasteText('');
      } else {
        setConservationProcessResult({ success: false, matched: false, alert: { error: data.error } });
      }
    } catch (err) {
      console.error('Error creating conservation alert:', err);
      setConservationProcessResult({ success: false, matched: false, alert: { error: 'Failed to process' } });
    } finally {
      setConservationProcessing(false);
    }
  };

  const handleCancelOutreach = async (alertId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/conservation/cancel-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ alertId }),
      });
    } catch (err) {
      console.error('Error canceling outreach:', err);
    }
  };

  const handleManualOutreach = async (alertId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/conservation/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ alertId }),
      });
    } catch (err) {
      console.error('Error sending outreach:', err);
    }
  };

  const handleResolveAlert = async (alertId: string, status: 'saved' | 'lost') => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/conservation/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ alertId, status }),
      });
    } catch (err) {
      console.error('Error resolving alert:', err);
    }
  };

  const activeConservationAlerts = conservationAlerts.filter(a => a.status !== 'saved' && a.status !== 'lost');
  const highPriorityCount = activeConservationAlerts.filter(a => a.priority === 'high').length;
  const savedThisWeek = conservationAlerts.filter(a => {
    if (a.status !== 'saved' || !a.resolvedAt) return false;
    const resolved = new Date(a.resolvedAt);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return resolved >= weekAgo;
  }).length;

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

  const hasAlerts = conservationAlerts.length > 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#000000]">Conservation Alerts</h1>
        <p className="text-[#707070] text-sm mt-1">Track and save at-risk policies before they lapse.</p>
      </div>

      {/* Summary Stats -- only show when there are alerts */}
      {hasAlerts && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-4">
            <p className="text-2xl font-bold text-[#000000]">{activeConservationAlerts.length}</p>
            <p className="text-xs text-[#707070]">Active Alerts</p>
          </div>
          <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-4">
            <p className="text-2xl font-bold text-red-600">{highPriorityCount}</p>
            <p className="text-xs text-[#707070]">Chargeback Risk</p>
          </div>
          <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-4">
            <p className="text-2xl font-bold text-green-600">{savedThisWeek}</p>
            <p className="text-xs text-[#707070]">Saved This Week</p>
          </div>
        </div>
      )}

      {/* Explanation -- shown first when agent has no alerts yet */}
      {!hasAlerts && (
        <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-[#daf3f0] rounded-[5px] flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-[#000000] mb-1">What is Conservation?</h3>
              <p className="text-sm text-[#707070] mb-4">
                When a carrier warns you that a client&rsquo;s policy is about to lapse, paste the notice below. Our AI reads it, matches it to your client, and helps you save the policy before you lose the commission.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="flex items-start gap-2">
                  <span className="w-6 h-6 bg-[#005851] text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                  <p className="text-xs text-[#505050]"><span className="font-semibold">Paste or forward</span> the carrier lapse notice</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-6 h-6 bg-[#005851] text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                  <p className="text-xs text-[#505050]"><span className="font-semibold">AI matches</span> it to your client and flags the risk</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-6 h-6 bg-[#005851] text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                  <p className="text-xs text-[#505050]"><span className="font-semibold">Outreach is sent</span> automatically to save the policy</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#005851]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>Prefer auto-forwarding? Send carrier emails to <span className="font-semibold">AI@conserve.agentforlife.app</span> and alerts are created automatically.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paste Box */}
      <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-5 mb-6">
        <h3 className="text-sm font-semibold text-[#000000] mb-2">New Conservation Alert</h3>
        <p className="text-xs text-[#707070] mb-3">
          Paste the carrier email or portal text below. AI will extract the details and match it to your client.
        </p>
        <textarea
          value={conservationPasteText}
          onChange={(e) => setConservationPasteText(e.target.value)}
          placeholder="Paste carrier conservation notice or portal text here..."
          className="w-full h-32 px-4 py-3 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-[#000000] placeholder-[#707070] focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all resize-none text-sm"
        />
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-[#707070]">
            Or forward emails to <span className="font-semibold text-[#005851]">AI@conserve.agentforlife.app</span>
          </p>
          <button
            onClick={handleConservationSubmit}
            disabled={conservationProcessing || !conservationPasteText.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors disabled:opacity-50 text-sm"
          >
            {conservationProcessing ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Process Alert
              </>
            )}
          </button>
        </div>

        {/* Processing Result */}
        {conservationProcessResult && (
          <div className={`mt-4 p-4 rounded-[5px] border ${conservationProcessResult.success ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
            {conservationProcessResult.success ? (
              <div>
                <p className="text-sm font-semibold text-green-800">
                  Alert created{conservationProcessResult.matched ? ' and matched' : ' (no match found)'}
                </p>
                <p className="text-xs text-green-700 mt-1">
                  {conservationProcessResult.alert.clientName as string} &mdash; {conservationProcessResult.alert.carrier as string}
                  {conservationProcessResult.alert.isChargebackRisk
                    ? ' — CHARGEBACK RISK'
                    : ''}
                </p>
                {conservationProcessResult.alert.status === 'outreach_scheduled' && (
                  <p className="text-xs text-green-600 mt-1">
                    Outreach scheduled to send automatically in 2 hours.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-red-700">{conservationProcessResult.alert.error as string || 'Failed to process alert'}</p>
            )}
          </div>
        )}
      </div>

      {/* Alert List */}
      <div className="bg-white rounded-[5px] border border-[#d0d0d0]">
        <div className="p-4 border-b border-[#d0d0d0]">
          <h2 className="text-sm font-semibold text-[#000000]">All Alerts</h2>
        </div>

        {conservationLoading ? (
          <div className="flex items-center justify-center py-8">
            <svg className="animate-spin w-8 h-8 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : conservationAlerts.length === 0 ? (
          <div className="py-10 px-4 text-center">
            <svg className="w-10 h-10 text-[#d0d0d0] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-sm text-[#707070]">No alerts yet. Paste a carrier notice above to create your first one.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f0f0f0]">
            {[...conservationAlerts]
              .sort((a, b) => {
                const priorityOrder = { high: 0, low: 1 };
                const statusOrder: Record<string, number> = { outreach_scheduled: 0, new: 1, outreach_sent: 2, drip_1: 3, drip_2: 4, drip_3: 5, saved: 6, lost: 7 };
                const pa = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
                const pb = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
                if (pa !== pb) return pa - pb;
                const sa = statusOrder[a.status] ?? 5;
                const sb = statusOrder[b.status] ?? 5;
                if (sa !== sb) return sa - sb;
                return 0;
              })
              .map((alert) => {
                const isResolved = alert.status === 'saved' || alert.status === 'lost';
                const isScheduled = alert.status === 'outreach_scheduled';
                const scheduledMs = alert.scheduledOutreachAt ? new Date(alert.scheduledOutreachAt).getTime() : 0;
                const timeLeft = isScheduled ? Math.max(0, scheduledMs - Date.now()) : 0;
                const minutesLeft = Math.ceil(timeLeft / 60000);

                const statusLabels: Record<string, string> = {
                  new: 'New',
                  outreach_scheduled: `Outreach in ${minutesLeft}m`,
                  outreach_sent: 'Outreach Sent',
                  drip_1: 'Follow-up 1 Sent',
                  drip_2: 'Follow-up 2 Sent',
                  drip_3: 'Final Follow-up Sent',
                  saved: 'Saved',
                  lost: 'Lost',
                };

                const statusColors: Record<string, string> = {
                  new: 'bg-blue-100 text-blue-700',
                  outreach_scheduled: 'bg-amber-100 text-amber-700',
                  outreach_sent: 'bg-purple-100 text-purple-700',
                  drip_1: 'bg-purple-100 text-purple-700',
                  drip_2: 'bg-purple-100 text-purple-700',
                  drip_3: 'bg-gray-100 text-gray-600',
                  saved: 'bg-green-100 text-green-700',
                  lost: 'bg-red-100 text-red-700',
                };

                return (
                  <div key={alert.id} className={`p-4 ${isResolved ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Top line: name, carrier, priority badge */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-[#000000] text-sm">{alert.clientName}</span>
                          <span className="text-[#707070] text-xs">{alert.carrier}</span>
                          {alert.policyType && (
                            <span className="text-xs text-[#707070] bg-[#f1f1f1] px-1.5 py-0.5 rounded">{alert.policyType}</span>
                          )}
                          {alert.isChargebackRisk ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-semibold">
                              CHARGEBACK RISK &mdash; {alert.policyAge !== null ? `${Math.round(alert.policyAge / 30)}mo old` : '< 1yr'}
                            </span>
                          ) : alert.policyAge !== null ? (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                              {Math.round(alert.policyAge / 30)}mo old
                            </span>
                          ) : null}
                        </div>

                        {/* Status + reason */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[alert.status] || 'bg-gray-100 text-gray-600'}`}>
                            {statusLabels[alert.status] || alert.status}
                          </span>
                          <span className="text-xs text-[#707070]">
                            {alert.reason === 'lapsed_payment' ? 'Lapsed Payment' : alert.reason === 'cancellation' ? 'Cancellation' : 'Other'}
                          </span>
                          {alert.source === 'email_forward' && (
                            <span className="text-xs text-[#a0a0a0]">via email</span>
                          )}
                        </div>

                        {/* AI Insight */}
                        {alert.aiInsight && !isResolved && (
                          <p className="text-xs text-[#005851] bg-[#f0faf9] px-3 py-1.5 rounded-[5px] mb-2 inline-block">
                            {alert.aiInsight}
                          </p>
                        )}

                        {/* Message preview */}
                        {alert.initialMessage && !isResolved && (
                          <details className="text-xs">
                            <summary className="text-[#707070] cursor-pointer hover:text-[#005851] transition-colors">
                              Preview outreach message
                            </summary>
                            <p className="text-[#505050] mt-1.5 pl-3 border-l-2 border-[#e0e0e0] italic">
                              &ldquo;{alert.initialMessage}&rdquo;
                            </p>
                          </details>
                        )}
                      </div>

                      {/* Action buttons */}
                      {!isResolved && (
                        <div className="flex flex-col gap-1.5 shrink-0">
                          {isScheduled && (
                            <button
                              onClick={() => handleCancelOutreach(alert.id)}
                              className="px-3 py-1.5 bg-white border border-amber-400 text-amber-700 text-xs font-medium rounded-[5px] hover:bg-amber-50 transition-colors"
                            >
                              Cancel Auto-Send
                            </button>
                          )}
                          {alert.status === 'new' && alert.clientId && (
                            <button
                              onClick={() => handleManualOutreach(alert.id)}
                              className="px-3 py-1.5 bg-[#44bbaa] text-white text-xs font-medium rounded-[5px] hover:bg-[#005751] transition-colors"
                            >
                              Send Outreach
                            </button>
                          )}
                          <button
                            onClick={() => handleResolveAlert(alert.id, 'saved')}
                            className="px-3 py-1.5 bg-white border border-green-400 text-green-700 text-xs font-medium rounded-[5px] hover:bg-green-50 transition-colors"
                          >
                            Mark Saved
                          </button>
                          <button
                            onClick={() => handleResolveAlert(alert.id, 'lost')}
                            className="px-3 py-1.5 bg-white border border-[#d0d0d0] text-[#707070] text-xs font-medium rounded-[5px] hover:bg-[#f8f8f8] transition-colors"
                          >
                            Mark Lost
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
