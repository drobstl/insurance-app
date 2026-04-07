'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, doc, onSnapshot, query, orderBy, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';
import SectionTipCard from '../../../components/SectionTipCard';
import { captureEvent } from '../../../lib/posthog';
import { ANALYTICS_EVENTS } from '../../../lib/analytics-events';

interface ConservationMessageUI {
  role: 'client' | 'agent-ai' | 'agent-manual';
  body: string;
  timestamp: string;
  channels?: string[];
}

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
  conversation: ConservationMessageUI[];
  chatId: string | null;
  aiEnabled: boolean;
  availableChannels: string[];
  noContactMethod: boolean;
  saveSuggested: boolean;
  aiInsight: string | null;
  notes: string | null;
  createdAt: Timestamp;
  resolvedAt: string | null;
}

export default function ConservationPage() {
  const { user, loading, agentProfile, dismissTip } = useDashboard();

  const [alerts, setAlerts] = useState<ConservationAlertUI[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [manualMessage, setManualMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [celebrationAlert, setCelebrationAlert] = useState<string | null>(null);
  const prevAlertsRef = useRef<Map<string, string>>(new Map());
  const emptyStateTrackedRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    setAlertsLoading(true);

    const alertsRef = collection(db, 'agents', user.uid, 'conservationAlerts');
    const alertsQuery = query(alertsRef, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(alertsQuery, (snapshot) => {
      const list: ConservationAlertUI[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as ConservationAlertUI));

      // Detect newly saved alerts for celebration
      const prevMap = prevAlertsRef.current;
      for (const a of list) {
        const prev = prevMap.get(a.id);
        if (prev && prev !== 'saved' && a.status === 'saved') {
          setCelebrationAlert(a.id);
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 4000);
        }
      }
      const newMap = new Map<string, string>();
      for (const a of list) newMap.set(a.id, a.status);
      prevAlertsRef.current = newMap;

      setAlerts(list);
      setAlertsLoading(false);
    }, (error) => {
      console.error('Error fetching conservation alerts:', error);
      setAlertsLoading(false);
    });

    return () => unsub();
  }, [user]);

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
      captureEvent(ANALYTICS_EVENTS.CONSERVATION_CALL_INITIATED, { source: 'manual_outreach' });
    } catch (err) {
      console.error('Error sending outreach:', err);
      captureEvent(ANALYTICS_EVENTS.ACTION_FAILED, {
        action: 'manual_outreach',
        surface: 'conservation',
        reason: 'outreach_failed',
      });
    }
  };

  const handleResolve = async (alertId: string, status: 'saved' | 'lost') => {
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

  const handleDelete = async (alertId: string) => {
    if (!user || !confirm('Delete this alert? This cannot be undone.')) return;
    try {
      const alertRef = doc(db, 'agents', user.uid, 'conservationAlerts', alertId);
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(alertRef);
    } catch (err) {
      console.error('Error deleting alert:', err);
    }
  };

  const handleSendMessage = useCallback(async (alertId: string) => {
    if (!user || !manualMessage.trim() || sendingMessage) return;
    setSendingMessage(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/conservation/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ alertId, body: manualMessage.trim() }),
      });
      if (res.ok) {
        setManualMessage('');
        captureEvent(ANALYTICS_EVENTS.CONSERVATION_CALL_INITIATED, { source: 'manual_message' });
      }
    } catch (err) {
      console.error('Error sending message:', err);
      captureEvent(ANALYTICS_EVENTS.ACTION_FAILED, {
        action: 'manual_message',
        surface: 'conservation',
        reason: 'message_send_failed',
      });
    } finally {
      setSendingMessage(false);
    }
  }, [user, manualMessage, sendingMessage]);

  const handleToggleAi = async (alertId: string, currentValue: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'agents', user.uid, 'conservationAlerts', alertId), {
        aiEnabled: !currentValue,
      });
    } catch (err) {
      console.error('Error toggling AI:', err);
    }
  };

  const handleDismissSaveSuggestion = async (alertId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'agents', user.uid, 'conservationAlerts', alertId), {
        saveSuggested: false,
      });
    } catch (err) {
      console.error('Error dismissing save suggestion:', err);
    }
  };

  const activeAlerts = alerts.filter(a => a.status !== 'saved' && a.status !== 'lost');
  const highPriorityCount = activeAlerts.filter(a => a.priority === 'high').length;
  const savedThisWeek = alerts.filter(a => {
    if (a.status !== 'saved' || !a.resolvedAt) return false;
    const resolved = new Date(a.resolvedAt);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return resolved >= weekAgo;
  }).length;

  useEffect(() => {
    if (alertsLoading) return;
    if (alerts.length === 0 && !emptyStateTrackedRef.current) {
      captureEvent(ANALYTICS_EVENTS.EMPTY_STATE_SEEN, {
        area: 'conservation_alerts',
      });
      emptyStateTrackedRef.current = true;
      return;
    }
    if (alerts.length > 0) {
      emptyStateTrackedRef.current = false;
    }
  }, [alertsLoading, alerts.length]);

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

  const hasAlerts = alerts.length > 0;

  const statusLabelsStatic: Record<string, string> = {
    new: 'New',
    outreach_sent: 'Outreach Sent',
    drip_1: 'Follow-up 1',
    drip_2: 'Follow-up 2',
    drip_3: 'Final Follow-up',
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
    <div className="relative max-w-5xl mx-auto">
      {/* Confetti overlay */}
      {showConfetti && (
        <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
          {Array.from({ length: 60 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2.5 h-2.5 rounded-sm"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-${Math.random() * 20}%`,
                backgroundColor: ['#44bbaa', '#005851', '#FFD700', '#FF6B6B', '#4CAF50', '#2196F3'][i % 6],
                animationDuration: `${1.5 + Math.random() * 2}s`,
                animationDelay: `${Math.random() * 0.5}s`,
                transform: `rotate(${Math.random() * 360}deg)`,
                animation: `confettiFall ${2 + Math.random() * 2}s ease-out forwards`,
              }}
            />
          ))}
          <style>{`
            @keyframes confettiFall {
              0% { transform: translateY(0) rotate(0deg); opacity: 1; }
              100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
            }
          `}</style>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#000000]">Retention</h1>
        <p className="text-[#707070] text-sm mt-1">Track and save at-risk policies before they lapse.</p>
      </div>

      {!agentProfile.tipsSeen?.conservation && (
        <SectionTipCard onDismiss={() => dismissTip('conservation')}>
          Forward the carrier&rsquo;s lapse notice to ai@savepolicy.agentforlife.app, or flag a policy as at-risk from the client&rsquo;s profile (open the client, then the policy, and use &ldquo;Flag at risk&rdquo;). We&rsquo;ll match it and track outreach for you.
        </SectionTipCard>
      )}

      {/* Summary Stats */}
      {hasAlerts && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-4">
            <p className="text-2xl font-bold text-[#000000]">{activeAlerts.length}</p>
            <p className="text-xs text-[#707070]">Active Alerts</p>
          </div>
          <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-4">
            <p className="text-2xl font-bold text-red-600">{highPriorityCount}</p>
            <p className="text-xs text-[#707070]">Chargeback Risk</p>
          </div>
          <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-4">
            <p className="text-2xl font-bold text-green-600">{savedThisWeek}</p>
            <p className="text-xs text-[#707070]">Saved This Week</p>
          </div>
        </div>
      )}

      {/* How to create alerts */}
      {!hasAlerts && (
        <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-[#daf3f0] rounded-[5px] flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-[#000000] mb-1">What is Retention?</h3>
              <p className="text-sm text-[#707070] mb-4">
                When a client&rsquo;s policy is at risk, the system reaches out automatically to save it before you lose the commission.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="bg-[#f8f8f8] rounded-[5px] p-4 border border-[#e0e0e0]">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <p className="text-sm font-semibold text-[#000000]">Flag from Clients</p>
                  </div>
                  <p className="text-xs text-[#707070]">Go to a client&rsquo;s profile, click &ldquo;Flag At Risk&rdquo; on any policy, and the outreach workflow starts immediately.</p>
                </div>
                <div className="bg-[#f8f8f8] rounded-[5px] p-4 border border-[#e0e0e0]">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm font-semibold text-[#000000]">Forward Carrier Emails</p>
                  </div>
                  <p className="text-xs text-[#707070]">Forward carrier lapse notices to <span className="font-semibold text-[#005851]">ai@savepolicy.agentforlife.app</span> and alerts are created automatically.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email forwarding reminder */}
      {hasAlerts && (
        <div className="bg-[#daf3f0] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] px-4 py-3 mb-6 flex items-center gap-3">
          <svg className="w-4 h-4 text-[#005851] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-xs text-[#005851]">
            Forward carrier lapse emails to <span className="font-semibold">ai@savepolicy.agentforlife.app</span> or flag policies at risk from the Clients page.
          </p>
        </div>
      )}

      {/* Alert List */}
      <h2 className="text-sm font-semibold text-[#000000] mb-3">All Alerts</h2>

      {alertsLoading ? (
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin w-8 h-8 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] py-10 px-4 text-center">
          <svg className="w-10 h-10 text-[#d0d0d0] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm text-[#707070]">No alerts yet. Flag a policy at risk from the Clients page or forward a carrier email.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...alerts]
            .sort((a, b) => {
              const priorityOrder: Record<string, number> = { high: 0, low: 1 };
              const statusOrder: Record<string, number> = { outreach_scheduled: 0, new: 1, outreach_sent: 2, drip_1: 3, drip_2: 4, drip_3: 5, saved: 6, lost: 7 };
              const pa = priorityOrder[a.priority] ?? 1;
              const pb = priorityOrder[b.priority] ?? 1;
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
              const isExpanded = expandedAlert === alert.id;
              const isCelebrating = celebrationAlert === alert.id && alert.status === 'saved';
              const conversation = alert.conversation || [];
              const msgCount = conversation.length;

              const statusLabel = alert.status === 'outreach_scheduled'
                ? `Outreach in ${minutesLeft}m`
                : statusLabelsStatic[alert.status] || alert.status;

              return (
                <div key={alert.id} className={`${isResolved && !isCelebrating ? 'opacity-60' : ''}`}>
                  {/* Celebration banner */}
                  {isCelebrating && (
                    <div className="mb-2">
                      <div className="bg-green-50 border border-green-300 rounded-[5px] p-4 flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-green-800">
                            {alert.clientName}&rsquo;s {alert.carrier} policy has been saved!
                          </p>
                          {alert.premiumAmount && (
                            <p className="text-xs text-green-700 mt-0.5">
                              ${alert.premiumAmount}/month in premiums preserved.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Save suggestion banner */}
                  {alert.saveSuggested && !isResolved && (
                    <div className="mb-2">
                      <div className="bg-[#daf3f0] border border-[#45bcaa]/30 rounded-[5px] p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-[#005851] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-xs text-[#005851] font-medium">It looks like this policy may have been saved. Can you confirm?</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleResolve(alert.id, 'saved')}
                            className="px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-[5px] hover:bg-green-700 transition-colors"
                          >
                            Confirm Saved
                          </button>
                          <button
                            onClick={() => handleDismissSaveSuggestion(alert.id)}
                            className="px-3 py-1 bg-white border border-[#d0d0d0] text-[#707070] text-xs font-medium rounded-[5px] hover:bg-gray-50 transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* No contact method warning */}
                  {alert.noContactMethod && !isResolved && (
                    <div className="mb-2">
                      <div className="bg-amber-50 border border-amber-200 rounded-[5px] p-2.5 flex items-center gap-2">
                        <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <p className="text-xs text-amber-700">No contact method available for this client. Reach out manually.</p>
                      </div>
                    </div>
                  )}

                  {/* Alert card */}
                  <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] overflow-hidden">
                    <div
                      className="p-4 pb-2 cursor-pointer"
                      onClick={() => {
                        if (!isExpanded) {
                          captureEvent(ANALYTICS_EVENTS.CONSERVATION_ALERT_VIEWED, {
                            status: alert.status,
                            priority: alert.priority,
                            source: alert.source,
                          });
                        }
                        setExpandedAlert(isExpanded ? null : alert.id);
                        setManualMessage('');
                      }}
                    >
                      {/* Line 1: Status leads, then client identity */}
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={`px-3 py-1 text-sm rounded-full font-semibold ${statusColors[alert.status] || 'bg-gray-100 text-gray-600'}`}>
                          {statusLabel}
                        </span>
                        <span className="font-semibold text-[#000000] text-sm">{alert.clientName}</span>
                        <span className="text-[#707070] text-xs">{alert.carrier}</span>
                      </div>

                      {/* Line 2: Reason + source */}
                      <div className="flex items-center gap-1.5 mb-2 text-xs text-[#707070]">
                        <span>{alert.reason === 'lapsed_payment' ? 'Lapsed Payment' : alert.reason === 'cancellation' ? 'Cancellation' : 'Other'}</span>
                        {alert.source && (
                          <>
                            <span className="text-[#d0d0d0]">&middot;</span>
                            <span className="text-[#a0a0a0]">{alert.source === 'email_forward' ? 'via email' : alert.source === 'manual_flag' ? 'flagged by agent' : ''}</span>
                          </>
                        )}
                      </div>

                      {/* AI insight -- prominent when present */}
                      {alert.aiInsight && !isResolved && !isExpanded && (
                        <p className="text-xs text-[#005851] bg-[#f0faf9] px-3 py-2 rounded-[5px] mb-2 leading-relaxed">
                          {alert.aiInsight}
                        </p>
                      )}
                    </div>

                    {/* Actions zone */}
                    <div className="flex items-center gap-2 px-4 pb-3 pt-2 border-t border-[#f0f0f0]" onClick={(e) => e.stopPropagation()}>
                      {!isResolved && (
                        <>
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
                            onClick={() => handleResolve(alert.id, 'saved')}
                            className="px-3 py-1.5 bg-white border border-green-400 text-green-700 text-xs font-medium rounded-[5px] hover:bg-green-50 transition-colors"
                          >
                            Mark Saved
                          </button>
                          <button
                            onClick={() => handleResolve(alert.id, 'lost')}
                            className="px-3 py-1.5 bg-white border border-[#d0d0d0] text-[#707070] text-xs font-medium rounded-[5px] hover:bg-[#f8f8f8] transition-colors"
                          >
                            Mark Lost
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(alert.id); }}
                            className="px-3 py-1.5 bg-white border border-red-300 text-red-600 text-xs font-medium rounded-[5px] hover:bg-red-50 transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}
                      <div className="flex-1" />
                      <svg
                        className={`w-4 h-4 text-[#707070] transition-transform cursor-pointer ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        onClick={() => { setExpandedAlert(isExpanded ? null : alert.id); setManualMessage(''); }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>

                    {/* Expanded conversation */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3 border-t border-[#f0f0f0]">
                        {/* Policy details */}
                        <div className="flex items-center gap-2 flex-wrap mt-3 text-xs text-[#707070]">
                          {alert.policyType && (
                            <span className="bg-[#f1f1f1] px-1.5 py-0.5 rounded">{alert.policyType}</span>
                          )}
                          {alert.isChargebackRisk ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold">
                              CHARGEBACK RISK &mdash; {alert.policyAge !== null ? `${Math.round(alert.policyAge / 30)}mo old` : '< 1yr'}
                            </span>
                          ) : alert.policyAge !== null ? (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                              {Math.round(alert.policyAge / 30)}mo old
                            </span>
                          ) : null}
                          {msgCount > 0 && (
                            <span>{msgCount} message{msgCount !== 1 ? 's' : ''}</span>
                          )}
                        </div>

                        {/* AI toggle */}
                        {!isResolved && (
                          <div className="flex items-center justify-between bg-[#f8f8f8] rounded-[5px] px-3 py-2 mt-3">
                            <span className="text-xs text-[#707070]">
                              AI Auto-Responses {alert.aiEnabled ? <span className="text-[#005851] font-medium">On</span> : <span className="text-amber-600 font-medium">Off</span>}
                            </span>
                            <button
                              onClick={() => handleToggleAi(alert.id, alert.aiEnabled)}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                                alert.aiEnabled ? 'bg-[#005851]' : 'bg-gray-300'
                              }`}
                              role="switch"
                              aria-checked={alert.aiEnabled}
                            >
                              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                                alert.aiEnabled ? 'translate-x-4' : 'translate-x-0'
                              }`} />
                            </button>
                          </div>
                        )}

                        {/* Let AI Continue button */}
                        {!isResolved && !alert.aiEnabled && (
                          <button
                            onClick={() => handleToggleAi(alert.id, false)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#005851] hover:bg-[#004440] text-white text-xs font-medium rounded-[5px] transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Let AI Continue
                          </button>
                        )}

                        {/* Conversation messages */}
                        {conversation.length > 0 ? (
                          <div className="space-y-2">
                            {conversation.map((msg, i) => (
                              <div key={i} className={`flex ${msg.role === 'client' ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                                  msg.role === 'agent-ai'
                                    ? 'bg-[#005851] text-white'
                                    : msg.role === 'agent-manual'
                                      ? 'bg-[#1a6b5c] text-white'
                                      : 'bg-[#f0f0f0] text-[#000000]'
                                }`}>
                                  <p>{msg.body}</p>
                                  <p className={`text-[10px] mt-1 ${msg.role === 'client' ? 'text-[#a0a0a0]' : 'text-white/60'}`}>
                                    {msg.role === 'agent-ai' ? 'AI (as you)' : msg.role === 'agent-manual' ? 'You (manual)' : alert.clientName.split(' ')[0]}
                                    {msg.timestamp && ` · ${new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                                    {msg.channels && msg.channels.length > 0 && ` · ${msg.channels.join(', ')}`}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-[#a0a0a0] text-center py-3">No messages yet.</p>
                        )}

                        {/* Manual message input */}
                        {!isResolved && alert.clientId && (
                          <div className="flex gap-2 mt-2">
                            <input
                              type="text"
                              value={expandedAlert === alert.id ? manualMessage : ''}
                              onChange={(e) => setManualMessage(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey && manualMessage.trim() && !sendingMessage) {
                                  e.preventDefault();
                                  handleSendMessage(alert.id);
                                }
                              }}
                              placeholder="Type a message..."
                              className="flex-1 px-3 py-2 text-sm border border-[#d0d0d0] rounded-[5px] bg-white text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#45bcaa] focus:border-[#45bcaa]"
                            />
                            <button
                              onClick={() => handleSendMessage(alert.id)}
                              disabled={!manualMessage.trim() || sendingMessage}
                              className="px-3 py-2 bg-[#005851] hover:bg-[#004440] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-[5px] transition-colors flex items-center gap-1.5"
                            >
                              {sendingMessage ? (
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
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
