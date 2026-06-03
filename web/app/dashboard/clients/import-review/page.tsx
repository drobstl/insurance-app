'use client';

/**
 * /dashboard/clients/import-review
 *
 * Worklist for cleaning up a bulk import. Lists the clients flagged
 * `needsImportReview` (survivors of the duplicate merge), and for each one
 * shows its applications (policies) next to the original documents so the
 * agent can mark each: Keep active / Declined / Trash. Finishing a client
 * clears its flag; when the list empties, the import is reviewed.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard } from '../../DashboardContext';
import { formatClientDisplayName } from '../../../../lib/name-utils';
import { getStatusColor } from '../../../../lib/policyUtils';

interface FlaggedClient {
  id: string;
  name: string;
  clientCode: string | null;
  mergedRecords: number;
}

interface Policy {
  id: string;
  policyType?: string;
  insuranceCompany?: string;
  policyNumber?: string;
  coverageAmount?: number;
  premiumAmount?: number;
  status?: string;
  effectiveDate?: string | null;
}

interface SourceDoc {
  jobId: string;
  fileName: string;
  pageCount: number;
  pages: string[];
}

function money(n?: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) return '—';
  return `$${n.toLocaleString()}`;
}

export default function ImportReviewPage() {
  const { user, loading: dashLoading } = useDashboard();

  const [clients, setClients] = useState<FlaggedClient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [documents, setDocuments] = useState<SourceDoc[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busyPolicyId, setBusyPolicyId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const selected = clients.find((c) => c.id === selectedId) || null;

  // ── Load the flagged-client worklist ──
  const loadList = useCallback(async () => {
    if (!user) return;
    setLoadingList(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/clients/needs-review', { headers: { Authorization: `Bearer ${token}` } });
      const data = (await res.json()) as { clients?: FlaggedClient[] };
      const list = data.clients ?? [];
      setClients(list);
      setSelectedId((prev) => (prev && list.some((c) => c.id === prev) ? prev : list[0]?.id ?? null));
    } catch {
      setClients([]);
    } finally {
      setLoadingList(false);
    }
  }, [user]);

  useEffect(() => {
    if (dashLoading || !user) return;
    void loadList();
  }, [dashLoading, user, loadList]);

  // ── Load the selected client's policies + documents ──
  useEffect(() => {
    if (!user || !selectedId) {
      setPolicies([]);
      setDocuments([]);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    void (async () => {
      try {
        const token = await user.getIdToken();
        const [polRes, docRes] = await Promise.all([
          fetch(`/api/policies?clientId=${encodeURIComponent(selectedId)}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/clients/${encodeURIComponent(selectedId)}/documents`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const polData = (await polRes.json()) as { policies?: Policy[] };
        const docData = (await docRes.json()) as { documents?: SourceDoc[] };
        if (!cancelled) {
          setPolicies(polData.policies ?? []);
          setDocuments(docData.documents ?? []);
        }
      } catch {
        if (!cancelled) {
          setPolicies([]);
          setDocuments([]);
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, selectedId]);

  // ── Policy actions ──
  const setStatus = useCallback(async (policyId: string, status: 'Active' | 'Declined') => {
    if (!user || !selectedId) return;
    setBusyPolicyId(policyId);
    setPolicies((prev) => prev.map((p) => (p.id === policyId ? { ...p, status } : p))); // optimistic
    try {
      const token = await user.getIdToken();
      await fetch('/api/policies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId: selectedId, policyId, status }),
      });
    } finally {
      setBusyPolicyId(null);
    }
  }, [user, selectedId]);

  const trashPolicy = useCallback(async (policyId: string) => {
    if (!user || !selectedId) return;
    if (!window.confirm('Delete this application? This removes it from the client for good.')) return;
    setBusyPolicyId(policyId);
    try {
      const token = await user.getIdToken();
      await fetch('/api/policies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId: selectedId, policyId }),
      });
      setPolicies((prev) => prev.filter((p) => p.id !== policyId));
    } finally {
      setBusyPolicyId(null);
    }
  }, [user, selectedId]);

  const finishClient = useCallback(async () => {
    if (!user || !selectedId) return;
    setResolving(true);
    try {
      const token = await user.getIdToken();
      await fetch('/api/clients/needs-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId: selectedId }),
      });
      const remaining = clients.filter((c) => c.id !== selectedId);
      setClients(remaining);
      setSelectedId(remaining[0]?.id ?? null);
    } finally {
      setResolving(false);
    }
  }, [user, selectedId, clients]);

  // ── Render ──
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#000000]">Review imported clients</h1>
          <p className="text-[#707070] text-sm mt-1">
            For each client, keep the active policy, mark the ones that were declined, and throw away anything that isn’t a real application.
          </p>
        </div>
        <Link href="/dashboard/clients" className="text-sm font-semibold text-[#005851] hover:underline shrink-0 whitespace-nowrap pt-1">
          ← Back to Clients
        </Link>
      </div>

      {loadingList ? (
        <div className="rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] bg-white px-4 py-8 text-center text-sm text-[#5f5f5f]">
          Loading your list…
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] bg-white px-4 py-10 text-center">
          <p className="font-semibold text-[#000000]">All caught up 🎉</p>
          <p className="text-sm text-[#5f5f5f] mt-1">No imported clients left to review.</p>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-5">
          {/* Worklist rail */}
          <div className="md:w-64 shrink-0">
            <p className="text-xs font-semibold text-[#707070] uppercase tracking-wider mb-2">
              {clients.length} to review
            </p>
            <div className="space-y-1.5">
              {clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-2 rounded-[8px] border transition-colors ${
                    selectedId === c.id
                      ? 'border-[#005851] bg-[#daf3f0]/40'
                      : 'border-[#e2e2e2] bg-white hover:bg-[#f8f8f8]'
                  }`}
                >
                  <span className="block text-sm font-semibold text-[#000000] truncate">
                    {formatClientDisplayName(c.name) || '(no name)'}
                  </span>
                  {c.mergedRecords > 0 && (
                    <span className="block text-[11px] text-[#707070]">{c.mergedRecords + 1} records merged</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Detail */}
          <div className="flex-1 min-w-0">
            {!selected ? null : loadingDetail ? (
              <div className="rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] bg-white px-4 py-8 text-center text-sm text-[#5f5f5f]">
                Loading {formatClientDisplayName(selected.name)}…
              </div>
            ) : (
              <div className="rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] bg-white p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="text-lg font-bold text-[#000000]">{formatClientDisplayName(selected.name)}</h2>
                  <button
                    onClick={finishClient}
                    disabled={resolving}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#005851] hover:bg-[#0a6e66] disabled:opacity-50"
                  >
                    {resolving ? 'Saving…' : 'Done — next client'}
                  </button>
                </div>

                {/* Documents */}
                <h3 className="text-xs font-bold text-[#005851] uppercase tracking-wider mb-2">Uploaded documents</h3>
                {documents.length === 0 ? (
                  <p className="text-sm text-[#707070] mb-5">No matching documents found for this client.</p>
                ) : (
                  <div className="space-y-3 mb-6">
                    {documents.map((d) => (
                      <div key={d.jobId} className="border border-[#e2e2e2] rounded-[8px] p-3">
                        <p className="text-sm font-medium text-[#1A1A1A] mb-2 break-words">📄 {d.fileName}</p>
                        <div className="flex gap-2 flex-wrap">
                          {d.pages.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noreferrer" title={`Open page ${i + 1}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt={`${d.fileName} page ${i + 1}`}
                                className="h-28 w-auto rounded border border-[#d0d0d0] hover:border-[#45bcaa] object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Applications / policies */}
                <h3 className="text-xs font-bold text-[#005851] uppercase tracking-wider mb-2">Applications on this client</h3>
                {policies.length === 0 ? (
                  <p className="text-sm text-[#707070]">No policies on this client.</p>
                ) : (
                  <div className="space-y-2.5">
                    {policies.map((p) => {
                      const busy = busyPolicyId === p.id;
                      return (
                        <div key={p.id} className="border border-[#e2e2e2] rounded-[8px] p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-[#000000]">{p.insuranceCompany || 'Unknown carrier'}</span>
                              {p.policyType && <span className="text-xs text-[#707070]">· {p.policyType}</span>}
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getStatusColor(p.status || '')}`}>
                                {p.status || '—'}
                              </span>
                            </div>
                            <div className="text-xs text-[#707070] mt-0.5 flex flex-wrap gap-x-3">
                              {p.policyNumber && <span>#{p.policyNumber}</span>}
                              <span>Coverage {money(p.coverageAmount)}</span>
                              <span>Premium {money(p.premiumAmount)}</span>
                              {p.effectiveDate && <span>Eff. {p.effectiveDate}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => setStatus(p.id, 'Active')}
                              disabled={busy}
                              className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold border disabled:opacity-50 ${
                                p.status === 'Active'
                                  ? 'bg-[#005851] text-white border-[#005851]'
                                  : 'bg-white text-[#005851] border-[#005851] hover:bg-[#daf3f0]/40'
                              }`}
                            >
                              Keep active
                            </button>
                            <button
                              onClick={() => setStatus(p.id, 'Declined')}
                              disabled={busy}
                              className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold border disabled:opacity-50 ${
                                p.status === 'Declined'
                                  ? 'bg-gray-600 text-white border-gray-600'
                                  : 'bg-white text-gray-600 border-gray-400 hover:bg-gray-100'
                              }`}
                            >
                              Declined
                            </button>
                            <button
                              onClick={() => trashPolicy(p.id)}
                              disabled={busy}
                              className="px-3 py-1.5 rounded-[6px] text-xs font-semibold border border-red-300 text-red-600 bg-white hover:bg-red-50 disabled:opacity-50"
                            >
                              Trash
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
