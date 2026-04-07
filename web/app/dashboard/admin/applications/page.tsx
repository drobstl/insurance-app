'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../../../../firebase';
import { isAdminEmail } from '../../../../lib/admin';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Application {
  id: string;
  name: string;
  email: string;
  clientCount: string;
  biggestDifference: string;
  policiesLast12Months?: string;
  isCurrentlyBuilding?: string;
  downlineAgentCount?: string;
  timestamp: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
}

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function timeAgo(timestamp: string | null): string {
  if (!timestamp) return '—';
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AdminApplicationsPage() {
  const router = useRouter();

  /* ---- State ---- */
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('pending');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [spotsData, setSpotsData] = useState<{ activeTier: string; tiers: { id: string; name: string; total: number; spotsFilled: number; spotsRemaining: number; status: string }[] } | null>(null);
  const foundingTier = spotsData?.tiers.find(t => t.id === 'founding');
  const foundingFull = foundingTier ? foundingTier.spotsRemaining <= 0 : false;

  /* ---- Toast helper ---- */
  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  /* ---- Auth + admin check ---- */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        if (!isAdminEmail(currentUser.email)) {
          router.push('/dashboard');
          return;
        }
        setUser(currentUser);
        setLoading(false);
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  /* ---- Fetch spots remaining ---- */
  useEffect(() => {
    fetch('/api/spots-remaining')
      .then(r => r.json())
      .then(d => { if (d.tiers) setSpotsData(d); })
      .catch(() => {});
  }, []);

  /* ---- Fetch applications from API ---- */
  const fetchApplications = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/applications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications);
      }
    } catch (err) {
      console.error('Error fetching applications:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  /* ---- Filtering ---- */
  const filtered =
    activeFilter === 'all'
      ? applications
      : applications.filter((a) => a.status === activeFilter);

  const counts = {
    total: applications.length,
    pending: applications.filter((a) => a.status === 'pending').length,
    approved: applications.filter((a) => a.status === 'approved').length,
    rejected: applications.filter((a) => a.status === 'rejected').length,
  };

  /* ---- Approve handler ---- */
  const handleApprove = async (app: Application) => {
    setProcessingIds((prev) => new Set(prev).add(app.id));
    try {
      const res = await fetch('/api/admin/applications/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: app.id,
          applicantName: app.name,
          applicantEmail: app.email,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 409) {
          addToast(errData.error || 'Founding tier is full — cannot approve.', 'error');
          fetch('/api/spots-remaining').then(r => r.json()).then(d => { if (d.tiers) setSpotsData(d); }).catch(() => {});
          return;
        }
        throw new Error('Failed to approve');
      }
      addToast(`Approved — welcome email sent to ${app.name}`, 'success');
      fetchApplications();
      fetch('/api/spots-remaining').then(r => r.json()).then(d => { if (d.tiers) setSpotsData(d); }).catch(() => {});
    } catch {
      addToast('Failed to approve application. Try again.', 'error');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(app.id);
        return next;
      });
    }
  };

  /* ---- Reject handler ---- */
  const handleReject = async (applicationId: string) => {
    setProcessingIds((prev) => new Set(prev).add(applicationId));
    try {
      const res = await fetch('/api/admin/applications/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          reason: rejectReason || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to reject');
      addToast('Application rejected', 'success');
      setRejectingId(null);
      setRejectReason('');
      fetchApplications();
    } catch {
      addToast('Failed to reject application. Try again.', 'error');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(applicationId);
        return next;
      });
    }
  };

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#e4e4e4] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#005851]" />
      </div>
    );
  }

  /* ---- Status badge ---- */
  const StatusBadge = ({ status }: { status: string }) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      approved: 'bg-green-100 text-green-800 border-green-200',
      rejected: 'bg-red-100 text-red-800 border-red-200',
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
          styles[status] || 'bg-gray-100 text-gray-800 border-gray-200'
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  /* ---- Filter tabs ---- */
  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.total },
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'approved', label: 'Approved', count: counts.approved },
    { key: 'rejected', label: 'Rejected', count: counts.rejected },
  ];

  return (
    <div className="min-h-screen bg-[#e4e4e4] flex">
      <div className="flex-1 ml-0 flex flex-col min-h-screen">
        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {/* Page title */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#0D4D4D]">Founding Member Applications</h1>
            <p className="text-[#707070] text-sm mt-1">Review and manage applications from the founding member program.</p>
          </div>

          {/* ======================================================== */}
          {/*  Stat Cards                                                */}
          {/* ======================================================== */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Total Applications', value: counts.total, color: '#0D4D4D' },
              { label: 'Pending', value: counts.pending, color: '#D97706' },
              { label: 'Approved', value: counts.approved, color: '#059669' },
              { label: 'Rejected', value: counts.rejected, color: '#DC2626' },
              { label: 'Founding Spots', value: foundingTier ? `${foundingTier.spotsFilled}/50` : '—', color: foundingFull ? '#DC2626' : '#a158ff' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white rounded-xl border border-[#d0d0d0] p-5 shadow-sm"
              >
                <p className="text-sm text-[#707070] font-medium">{stat.label}</p>
                <p className="text-3xl font-extrabold mt-1" style={{ color: stat.color }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* ======================================================== */}
          {/*  Filter Tabs                                               */}
          {/* ======================================================== */}
          <div className="flex gap-1 border-b border-[#d0d0d0] mb-6">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`px-4 sm:px-5 py-3 text-sm sm:text-base font-semibold transition-colors relative ${
                  activeFilter === tab.key
                    ? 'text-[#0D4D4D]'
                    : 'text-[#707070] hover:text-[#005851]'
                }`}
              >
                {tab.label}
                <span
                  className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    activeFilter === tab.key
                      ? 'bg-[#0D4D4D] text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {tab.count}
                </span>
                {activeFilter === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#3DD6C3] rounded-t" />
                )}
              </button>
            ))}
          </div>

          {/* ======================================================== */}
          {/*  Applications Table                                        */}
          {/* ======================================================== */}
          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#d0d0d0] p-12 text-center shadow-sm">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-[#707070] text-base">
                No {activeFilter === 'all' ? '' : activeFilter} applications
                {activeFilter === 'all' ? ' yet' : ''}.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block bg-white rounded-xl border border-[#d0d0d0] shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#F8F9FA] border-b border-[#d0d0d0]">
                        <th className="px-5 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Name</th>
                        <th className="px-5 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Email</th>
                        <th className="px-5 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Clients</th>
                        <th className="px-5 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Policies (12mo)</th>
                        <th className="px-5 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Building / Downline</th>
                        <th className="px-5 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Biggest Difference</th>
                        <th className="px-5 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Applied</th>
                        <th className="px-5 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Status</th>
                        <th className="px-5 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map((app) => (
                        <tr key={app.id} className="hover:bg-[#F8F9FA] transition-colors">
                          <td className="px-5 py-4 text-sm font-semibold text-[#0D4D4D] whitespace-nowrap">
                            {app.name}
                          </td>
                          <td className="px-5 py-4 text-sm whitespace-nowrap">
                            <a
                              href={`mailto:${app.email}`}
                              className="text-[#3DD6C3] hover:text-[#005851] underline underline-offset-2"
                            >
                              {app.email}
                            </a>
                          </td>
                          <td className="px-5 py-4 text-sm text-[#2D3748] whitespace-nowrap">
                            {app.clientCount}
                          </td>
                          <td className="px-5 py-4 text-sm text-[#2D3748] whitespace-nowrap">
                            {app.policiesLast12Months || '—'}
                          </td>
                          <td className="px-5 py-4 text-sm text-[#2D3748] whitespace-nowrap">
                            {app.isCurrentlyBuilding === 'yes'
                              ? `Yes — ${app.downlineAgentCount || '—'}`
                              : app.isCurrentlyBuilding === 'no'
                              ? 'No'
                              : '—'}
                          </td>
                          <td className="px-5 py-4 text-sm text-[#2D3748] max-w-[220px] truncate">
                            {app.biggestDifference}
                          </td>
                          <td className="px-5 py-4 text-sm text-[#707070] whitespace-nowrap">
                            {timeAgo(app.timestamp)}
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <StatusBadge status={app.status} />
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            {app.status === 'pending' ? (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleApprove(app)}
                                  disabled={processingIds.has(app.id) || foundingFull}
                                  title={foundingFull ? 'Founding tier is full (50/50)' : undefined}
                                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {processingIds.has(app.id) ? '...' : foundingFull ? 'Full' : 'Approve'}
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingId(app.id);
                                    setRejectReason('');
                                  }}
                                  disabled={processingIds.has(app.id)}
                                  className="px-3 py-1.5 bg-gray-200 hover:bg-red-100 hover:text-red-700 text-gray-600 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-[#a0a0a0]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {filtered.map((app) => (
                  <div
                    key={app.id}
                    className="bg-white rounded-xl border border-[#d0d0d0] p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-[#0D4D4D]">{app.name}</p>
                        <a
                          href={`mailto:${app.email}`}
                          className="text-sm text-[#3DD6C3] underline underline-offset-2"
                        >
                          {app.email}
                        </a>
                      </div>
                      <StatusBadge status={app.status} />
                    </div>
                    <div className="space-y-2 text-sm text-[#2D3748]">
                      <div className="flex justify-between">
                        <span className="text-[#707070]">Clients:</span>
                        <span className="font-medium">{app.clientCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#707070]">Policies (12mo):</span>
                        <span className="font-medium">{app.policiesLast12Months || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#707070]">Building / Downline:</span>
                        <span className="font-medium">
                          {app.isCurrentlyBuilding === 'yes'
                            ? `Yes — ${app.downlineAgentCount || '—'}`
                            : app.isCurrentlyBuilding === 'no'
                            ? 'No'
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#707070]">Biggest Difference:</span>
                        <p className="font-medium mt-0.5">{app.biggestDifference}</p>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#707070]">Applied:</span>
                        <span>{timeAgo(app.timestamp)}</span>
                      </div>
                    </div>
                    {app.status === 'pending' && (
                      <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
                        <button
                          onClick={() => handleApprove(app)}
                          disabled={processingIds.has(app.id) || foundingFull}
                          className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 min-h-[44px]"
                        >
                          {processingIds.has(app.id) ? 'Processing...' : foundingFull ? 'Tier Full' : 'Approve'}
                        </button>
                        <button
                          onClick={() => {
                            setRejectingId(app.id);
                            setRejectReason('');
                          }}
                          disabled={processingIds.has(app.id)}
                          className="flex-1 py-2.5 bg-gray-200 hover:bg-red-100 hover:text-red-700 text-gray-600 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 min-h-[44px]"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {/* ============================================================ */}
      {/*  Reject Modal                                                 */}
      {/* ============================================================ */}
      {rejectingId && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-[#0D4D4D] mb-4">Reject Application</h3>
            <p className="text-sm text-[#707070] mb-4">
              Optionally provide a reason. The applicant will <strong>not</strong> be notified.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={3}
              className="w-full border border-[#d0d0d0] rounded-lg px-4 py-3 text-sm text-[#2D3748] placeholder:text-[#a0a0a0] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3] focus:border-transparent resize-none mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setRejectingId(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-sm font-semibold text-[#707070] hover:text-[#2D3748] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(rejectingId)}
                disabled={processingIds.has(rejectingId)}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {processingIds.has(rejectingId) ? 'Rejecting...' : 'Reject Application'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  Toast Notifications                                          */}
      {/* ============================================================ */}
      <div className="fixed bottom-6 right-6 z-[70] space-y-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-[slideUp_0.3s_ease-out] ${
              toast.type === 'success'
                ? 'bg-[#0D4D4D] text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <svg className="w-5 h-5 text-[#3DD6C3] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
