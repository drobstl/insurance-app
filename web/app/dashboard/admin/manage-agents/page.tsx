'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '../../DashboardContext';

interface AgentRow {
  id: string;
  name: string;
  email: string;
  clientCount: number;
  subscriptionStatus: string;
  isAgencyOwner?: boolean;
  agencyOwnerId?: string | null;
}

export default function ManageAgentsPage() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin, refreshProfile } = useDashboard();

  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [actionResult, setActionResult] = useState<{ agentId: string; type: 'export' | 'delete' | 'founding' | 'agency' | 'upline'; message: string } | null>(null);

  const fetchAgents = useCallback(async () => {
    if (!user) return;
    setFetchLoading(true);
    setFetchError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/agent-emails', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load');
      }
      const data = await res.json();

      const agentList: AgentRow[] = (data.list ?? [])
        .filter((r: { sources?: string[] }) => r.sources?.includes('signup'))
        .map((r: { email: string; name: string | null }) => ({
          id: '',
          name: r.name || '—',
          email: r.email,
          clientCount: 0,
          subscriptionStatus: '—',
          isAgencyOwner: false,
          agencyOwnerId: null,
        }));

      const listRes = await fetch('/api/admin/list-agents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        setAgents(listData.agents ?? []);
      } else {
        setAgents(agentList);
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to load');
      setAgents([]);
    } finally {
      setFetchLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (!isAdmin) { router.push('/dashboard'); return; }
    fetchAgents();
  }, [authLoading, user, isAdmin, router, fetchAgents]);

  const handleExport = async (agentId: string) => {
    if (!user || !agentId) return;
    setActionLoading(agentId);
    setActionResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/export-data?agentId=${agentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Export failed');
      }
      const disposition = res.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || `agent-export-${agentId}.json`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setActionResult({ agentId, type: 'export', message: 'Export downloaded.' });
    } catch (e) {
      setActionResult({ agentId, type: 'export', message: e instanceof Error ? e.message : 'Export failed' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (agentId: string) => {
    if (!user || !agentId) return;
    setActionLoading(agentId);
    setActionResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/delete-account', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setActionResult({ agentId, type: 'delete', message: data.message || 'Account deleted.' });
      setConfirmDelete(null);
      setDeleteConfirmText('');
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
    } catch (e) {
      setActionResult({ agentId, type: 'delete', message: e instanceof Error ? e.message : 'Delete failed' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleForceFounding = async (agentEmail: string, actionKey: string) => {
    if (!user || !agentEmail) return;
    setActionLoading(actionKey);
    setActionResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/founding/force-activate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: agentEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Force activation failed');
      setActionResult({
        agentId: actionKey,
        type: 'founding',
        message: data.message || 'Founding access activated.',
      });
      await fetchAgents();
    } catch (e) {
      setActionResult({
        agentId: actionKey,
        type: 'founding',
        message: e instanceof Error ? e.message : 'Force activation failed',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAgencyOwner = async (agentId: string, current: boolean) => {
    if (!user || !agentId) return;
    setActionLoading(agentId);
    setActionResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/set-agency-owner', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uid: agentId, isAgencyOwner: !current }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, isAgencyOwner: !current } : a)));
      setActionResult({
        agentId,
        type: 'agency',
        message: !current ? 'Agency owner enabled.' : 'Agency owner removed.',
      });
      // If you toggled your OWN account, refresh the live profile so the
      // "My Team" nav appears/disappears for you without a manual reload.
      if (agentId === user.uid) await refreshProfile();
    } catch (e) {
      setActionResult({
        agentId,
        type: 'agency',
        message: e instanceof Error ? e.message : 'Update failed',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Attach (or detach) an existing agent to a team owner by writing their
  // dedicated `agencyOwnerId`. ownerId === '' clears the assignment. This is
  // separate from referral credit (referredByAgent) on purpose.
  const handleAssignUpline = async (agentId: string, ownerId: string) => {
    if (!user || !agentId) return;
    setActionLoading(agentId);
    setActionResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/set-agency-upline', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uid: agentId, agencyOwnerId: ownerId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, agencyOwnerId: ownerId || null } : a)));
      const ownerName = owners.find((o) => o.id === ownerId)?.name;
      setActionResult({
        agentId,
        type: 'upline',
        message: ownerId ? `Assigned to ${ownerName || 'owner'}'s team.` : 'Removed from team.',
      });
    } catch (e) {
      setActionResult({
        agentId,
        type: 'upline',
        message: e instanceof Error ? e.message : 'Update failed',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Eligible team owners = agents flagged isAgencyOwner.
  const owners = agents.filter((a) => a.id && a.isAgencyOwner);

  const filtered = agents.filter((a) => {
    const q = search.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
  });

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#005851] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0D4D4D]">Manage Agents</h1>
        <p className="text-[#707070] text-sm mt-1">
          Export agent data or permanently delete accounts. Deletion removes all client data, policies, referrals, Stripe subscription, and Firebase Auth.
        </p>
      </div>

      {fetchLoading ? (
        <div className="bg-white rounded-xl border border-[#d0d0d0] p-8 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#005851] border-t-transparent" />
        </div>
      ) : fetchError ? (
        <div className="bg-white rounded-xl border border-[#d0d0d0] p-6">
          <p className="text-red-600 font-medium">{fetchError}</p>
          <button onClick={fetchAgents} className="mt-3 px-4 py-2 bg-[#44bbaa] hover:bg-[#005751] text-white text-sm font-semibold rounded-[5px] transition-colors">
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-sm px-4 py-2.5 border border-[#d0d0d0] rounded-[5px] text-sm text-[#0D4D4D] placeholder-[#a0a0a0] focus:outline-none focus:ring-2 focus:ring-[#44bbaa] focus:border-transparent"
            />
          </div>

          <div className="bg-white rounded-xl border border-[#d0d0d0] shadow-sm overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-[#F8F9FA] border-b border-[#d0d0d0] sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Agent</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Clients</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Subscription</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Agency team</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e5e5]">
                  {filtered.map((agent) => (
                    <tr key={agent.id || agent.email} className="hover:bg-[#F8F9FA]">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-[#0D4D4D]">{agent.name}</div>
                        <div className="text-xs text-[#707070]">{agent.email}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#2D3748]">{agent.clientCount}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                          agent.subscriptionStatus === 'active'
                            ? 'bg-green-100 text-green-700'
                            : agent.subscriptionStatus === 'canceled'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}>
                          {agent.subscriptionStatus || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {agent.id ? (
                          <select
                            value={agent.agencyOwnerId ?? ''}
                            onChange={(e) => handleAssignUpline(agent.id, e.target.value)}
                            disabled={actionLoading === (agent.id || agent.email)}
                            title="Assign this agent to a team owner's downline"
                            className="max-w-[160px] px-2 py-1.5 border border-[#d0d0d0] rounded-[5px] text-xs text-[#0D4D4D] bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#44bbaa]"
                          >
                            <option value="">— No team —</option>
                            {owners
                              .filter((o) => o.id !== agent.id)
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            {/* The agent's current owner may not be flagged as
                                an owner anymore — keep it visible so state is honest. */}
                            {agent.agencyOwnerId &&
                              !owners.some((o) => o.id === agent.agencyOwnerId) && (
                                <option value={agent.agencyOwnerId}>
                                  {agents.find((a) => a.id === agent.agencyOwnerId)?.name || 'Current owner'}
                                </option>
                              )}
                          </select>
                        ) : (
                          <span className="text-xs text-[#a0a0a0]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {agent.id && (
                            <button
                              onClick={() => handleToggleAgencyOwner(agent.id, agent.isAgencyOwner === true)}
                              disabled={actionLoading === (agent.id || agent.email)}
                              title={agent.isAgencyOwner ? 'Remove agency-owner access' : 'Grant agency-owner access (unlocks the My Team dashboard)'}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 border disabled:opacity-50 text-xs font-semibold rounded-[5px] transition-colors ${
                                agent.isAgencyOwner
                                  ? 'bg-[#005851] border-[#005851] text-white hover:bg-[#0D4D4D]'
                                  : 'bg-white border-[#44bbaa] text-[#005851] hover:bg-[#f0faf8]'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
                              </svg>
                              {agent.isAgencyOwner ? 'Agency Owner ✓' : 'Make Owner'}
                            </button>
                          )}

                          <button
                            onClick={() => handleForceFounding(agent.email, agent.id || agent.email)}
                            disabled={actionLoading === (agent.id || agent.email)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#a158ff] hover:bg-[#f4ecff] disabled:opacity-50 text-[#7b3aed] text-xs font-semibold rounded-[5px] transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Force Founding
                          </button>

                          <button
                            onClick={() => handleExport(agent.id)}
                            disabled={actionLoading === (agent.id || agent.email)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#d0d0d0] hover:bg-[#f8f8f8] disabled:opacity-50 text-[#0D4D4D] text-xs font-semibold rounded-[5px] transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Export
                          </button>

                          {confirmDelete === agent.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder='Type "DELETE" to confirm'
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                className="px-2 py-1.5 border border-red-300 rounded-[5px] text-xs w-40 focus:outline-none focus:ring-2 focus:ring-red-400"
                              />
                              <button
                                onClick={() => handleDelete(agent.id)}
                                disabled={deleteConfirmText !== 'DELETE' || actionLoading === (agent.id || agent.email)}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-[5px] transition-colors"
                              >
                                {actionLoading === (agent.id || agent.email) ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => { setConfirmDelete(null); setDeleteConfirmText(''); }}
                                className="px-2 py-1.5 text-[#707070] hover:text-[#0D4D4D] text-xs font-medium"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(agent.id)}
                              disabled={actionLoading === (agent.id || agent.email)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-300 hover:bg-red-50 disabled:opacity-50 text-red-600 text-xs font-semibold rounded-[5px] transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </button>
                          )}
                        </div>
                        {actionResult?.agentId === (agent.id || agent.email) && (
                          <p className={`text-xs mt-1.5 ${actionResult.type === 'delete' ? 'text-red-600' : actionResult.type === 'founding' ? 'text-[#7b3aed]' : 'text-green-600'}`}>
                            {actionResult.message}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-[#707070] text-sm">
                {agents.length === 0 ? 'No agents found.' : 'No agents match your search.'}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
