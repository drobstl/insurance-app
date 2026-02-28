'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';

interface ReviewMessage {
  role: 'client' | 'agent-ai' | 'agent-manual';
  body: string;
  timestamp: string;
}

interface PolicyReviewUI {
  id: string;
  clientId: string;
  clientName: string;
  clientFirstName: string;
  policyId: string;
  policyType: string;
  carrier: string;
  premiumAmount: number | null;
  coverageAmount: number | null;
  anniversaryDate: string;
  messageStyle: string;
  status: string;
  conversation: ReviewMessage[];
  chatId: string | null;
  dripCount: number;
  aiEnabled: boolean;
  createdAt: { toDate?: () => Date } | null;
}

const STATUS_LABELS: Record<string, string> = {
  'outreach-sent': 'Outreach Sent',
  'drip-1': 'Follow-up 1',
  'drip-2': 'Follow-up 2',
  'drip-complete': 'Drip Complete',
  'conversation-active': 'Active Conversation',
  'booking-sent': 'Booking Link Sent',
  booked: 'Booked',
  closed: 'Closed',
  'opted-out': 'Opted Out',
};

const STATUS_COLORS: Record<string, string> = {
  'outreach-sent': 'bg-purple-100 text-purple-700',
  'drip-1': 'bg-purple-100 text-purple-700',
  'drip-2': 'bg-gray-100 text-gray-600',
  'drip-complete': 'bg-gray-100 text-gray-500',
  'conversation-active': 'bg-blue-100 text-blue-700',
  'booking-sent': 'bg-amber-100 text-amber-700',
  booked: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
  'opted-out': 'bg-gray-100 text-gray-400',
};

export default function PolicyReviewsPage() {
  const { user, loading } = useDashboard();
  const [reviews, setReviews] = useState<PolicyReviewUI[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [manualMessage, setManualMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [filter, setFilter] = useState<'active' | 'booked' | 'all'>('active');

  useEffect(() => {
    if (!user) return;
    setReviewsLoading(true);

    const reviewsRef = collection(db, 'agents', user.uid, 'policyReviews');
    const reviewsQuery = query(reviewsRef, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(reviewsQuery, (snapshot) => {
      const list: PolicyReviewUI[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as PolicyReviewUI));
      setReviews(list);
      setReviewsLoading(false);
    }, (error) => {
      console.error('Error fetching policy reviews:', error);
      setReviewsLoading(false);
    });

    return () => unsub();
  }, [user]);

  const handleToggleAi = async (reviewId: string, currentValue: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'agents', user.uid, 'policyReviews', reviewId), {
        aiEnabled: !currentValue,
      });
    } catch (err) {
      console.error('Error toggling AI:', err);
    }
  };

  const handleMarkBooked = async (reviewId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'agents', user.uid, 'policyReviews', reviewId), {
        status: 'booked',
      });
    } catch (err) {
      console.error('Error marking as booked:', err);
    }
  };

  const handleMarkClosed = async (reviewId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'agents', user.uid, 'policyReviews', reviewId), {
        status: 'closed',
      });
    } catch (err) {
      console.error('Error marking as closed:', err);
    }
  };

  const handleSendMessage = useCallback(async (reviewId: string) => {
    if (!user || !manualMessage.trim() || sendingMessage) return;
    setSendingMessage(true);
    try {
      const review = reviews.find(r => r.id === reviewId);
      if (!review?.chatId) {
        alert('No chat ID — client has not been contacted via SMS yet.');
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch('/api/conservation/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          alertId: reviewId,
          body: manualMessage.trim(),
          collection: 'policyReviews',
        }),
      });
      if (res.ok) setManualMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSendingMessage(false);
    }
  }, [user, manualMessage, sendingMessage, reviews]);

  const activeStatuses = ['outreach-sent', 'drip-1', 'drip-2', 'drip-complete', 'conversation-active', 'booking-sent'];
  const activeReviews = reviews.filter(r => activeStatuses.includes(r.status));
  const bookedReviews = reviews.filter(r => r.status === 'booked');
  const awaitingResponse = reviews.filter(r => ['outreach-sent', 'drip-1', 'drip-2', 'drip-complete'].includes(r.status));
  const conversationActive = reviews.filter(r => ['conversation-active', 'booking-sent'].includes(r.status));

  const filteredReviews = filter === 'active'
    ? activeReviews
    : filter === 'booked'
      ? bookedReviews
      : reviews;

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
        <h1 className="text-2xl font-bold text-[#0D4D4D]">Rewrites</h1>
        <p className="text-[#6B7280] text-sm mt-1">Anniversary-based rewrite campaigns powered by AI.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-black text-[#0D4D4D]">{activeReviews.length}</p>
          <p className="text-xs text-[#6B7280]">Active Campaigns</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-black text-[#3DD6C3]">{bookedReviews.length}</p>
          <p className="text-xs text-[#6B7280]">Booked</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-black text-[#fdcc02]">{awaitingResponse.length}</p>
          <p className="text-xs text-[#6B7280]">Awaiting Response</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-black text-blue-500">{conversationActive.length}</p>
          <p className="text-xs text-[#6B7280]">In Conversation</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['active', 'booked', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === f ? 'bg-[#0D4D4D] text-white' : 'bg-gray-100 text-[#6B7280] hover:bg-gray-200'}`}>
            {f === 'active' ? 'Active' : f === 'booked' ? 'Booked' : 'All'}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {reviews.length === 0 && !reviewsLoading && (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-[#3DD6C3]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
          <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">No Rewrites Yet</h3>
          <p className="text-[#6B7280] text-sm max-w-md mx-auto">When your clients&apos; policies hit their 1-year anniversary, AI will automatically reach out to schedule a review. Campaigns will appear here.</p>
        </div>
      )}

      {/* Campaign list */}
      {filteredReviews.length > 0 && (
        <div className="space-y-3">
          {filteredReviews.map((review) => (
            <div key={review.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setExpandedReview(expandedReview === review.id ? null : review.id)}
                className="w-full p-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-[#0D4D4D] rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{review.clientFirstName?.[0] || '?'}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0D4D4D] truncate">{review.clientName}</p>
                    <p className="text-xs text-[#6B7280]">{review.policyType} · {review.carrier}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-[#6B7280] hidden sm:block">{review.anniversaryDate}</span>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${STATUS_COLORS[review.status] || 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABELS[review.status] || review.status}
                  </span>
                  <svg className={`w-4 h-4 text-[#6B7280] transition-transform ${expandedReview === review.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>

              {expandedReview === review.id && (
                <div className="border-t border-gray-100 p-4 space-y-4">
                  {/* Conversation */}
                  <div className="bg-[#F8F9FA] rounded-xl p-3 max-h-80 overflow-y-auto space-y-2">
                    {review.conversation.length === 0 && (
                      <p className="text-center text-[#6B7280] text-xs py-4">No messages yet.</p>
                    )}
                    {review.conversation.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'client' ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${
                          msg.role === 'client'
                            ? 'bg-gray-200 text-[#0D4D4D] rounded-tl-sm'
                            : msg.role === 'agent-manual'
                              ? 'bg-[#0D4D4D] text-white rounded-tr-sm'
                              : 'bg-[#005851] text-white rounded-tr-sm'
                        }`}>
                          <p className="text-[12px] leading-relaxed">{msg.body}</p>
                          <p className={`text-[9px] mt-1 ${msg.role === 'client' ? 'text-[#6B7280]' : 'text-white/50'}`}>
                            {msg.role === 'agent-ai' ? 'AI' : msg.role === 'agent-manual' ? 'You' : 'Client'} · {new Date(msg.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Manual message input */}
                  {!['booked', 'closed', 'opted-out'].includes(review.status) && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={expandedReview === review.id ? manualMessage : ''}
                        onChange={(e) => setManualMessage(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(review.id); }}
                        placeholder="Type a manual message..."
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD6C3]/50"
                      />
                      <button onClick={() => handleSendMessage(review.id)} disabled={sendingMessage || !manualMessage.trim()} className="px-4 py-2 bg-[#0D4D4D] text-white text-sm font-semibold rounded-lg hover:bg-[#005851] disabled:opacity-50 transition-colors">
                        Send
                      </button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleToggleAi(review.id, review.aiEnabled)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${review.aiEnabled ? 'bg-[#3DD6C3]/10 text-[#005851] border border-[#3DD6C3]/20' : 'bg-gray-100 text-[#6B7280]'}`}>
                      {review.aiEnabled ? 'AI On' : 'AI Off'}
                    </button>
                    {review.status !== 'booked' && (
                      <button onClick={() => handleMarkBooked(review.id)} className="px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-semibold hover:bg-green-100 transition-colors">
                        Mark Booked
                      </button>
                    )}
                    {review.status !== 'closed' && review.status !== 'booked' && (
                      <button onClick={() => handleMarkClosed(review.id)} className="px-3 py-1.5 bg-gray-50 text-[#6B7280] border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-100 transition-colors">
                        Close
                      </button>
                    )}
                    {review.premiumAmount && (
                      <span className="px-3 py-1.5 text-xs text-[#6B7280]">${review.premiumAmount}/mo</span>
                    )}
                    {review.coverageAmount && (
                      <span className="px-3 py-1.5 text-xs text-[#6B7280]">${review.coverageAmount.toLocaleString()} coverage</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
