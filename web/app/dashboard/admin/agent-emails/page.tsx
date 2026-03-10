'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '../../DashboardContext';

interface ContactRow {
  email: string;
  name: string | null;
  sources: string[];
  signedUpAt: string | null;
  appliedAt: string | null;
}

function splitName(fullName: string | null): { firstName: string; lastName: string } {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace <= 0) return { firstName: trimmed, lastName: '' };
  return {
    firstName: trimmed.slice(0, lastSpace).trim(),
    lastName: trimmed.slice(lastSpace + 1).trim(),
  };
}

export default function AdminAgentEmailsPage() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin } = useDashboard();

  const [list, setList] = useState<ContactRow[]>([]);
  const [emails, setEmails] = useState<string[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const fetchAll = useCallback(async () => {
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
      setList(data.list ?? []);
      setEmails(data.emails ?? []);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to load');
      setList([]);
      setEmails([]);
    } finally {
      setFetchLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (!isAdmin) {
      router.push('/dashboard');
      return;
    }
    fetchAll();
  }, [authLoading, user, isAdmin, router, fetchAll]);

  const handleCopyEmails = async () => {
    if (emails.length === 0) return;
    setCopyStatus('idle');
    try {
      await navigator.clipboard.writeText(emails.join('\n'));
      setCopyStatus('success');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  const handleDownloadCsv = () => {
    if (list.length === 0) return;
    const header = 'email,First Name,Last Name,source,signed_up_at,applied_at\n';
    const rows = list.map((r) => {
      const { firstName, lastName } = splitName(r.name);
      const email = (r.email ?? '').replace(/"/g, '""');
      const first = firstName.replace(/"/g, '""');
      const last = lastName.replace(/"/g, '""');
      const source = (r.sources ?? []).join('; ').replace(/"/g, '""');
      const signedUp = r.signedUpAt ?? '';
      const applied = r.appliedAt ?? '';
      return `"${email}","${first}","${last}","${source}","${signedUp}","${applied}"`;
    });
    const csv = header + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `afl-all-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatSource = (sources: string[]) => {
    return sources.map((s) => (s === 'signup' ? 'Signup' : s === 'founding_application' ? 'Founding application' : s)).join(', ');
  };

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#005851] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0D4D4D]">All AFL Contacts</h1>
        <p className="text-[#707070] text-sm mt-1">
          Everyone who signed up or came through the founding member flow. One list, deduplicated by email. Export as CSV to open in Google Sheets or Excel.
        </p>
      </div>

      {fetchLoading ? (
        <div className="bg-white rounded-xl border border-[#d0d0d0] p-8 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#005851] border-t-transparent" />
        </div>
      ) : fetchError ? (
        <div className="bg-white rounded-xl border border-[#d0d0d0] p-6">
          <p className="text-red-600 font-medium">{fetchError}</p>
          <button
            onClick={fetchAll}
            className="mt-3 px-4 py-2 bg-[#44bbaa] hover:bg-[#005751] text-white text-sm font-semibold rounded-[5px] transition-colors"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-lg font-semibold text-[#0D4D4D]">
              {list.length} contact{list.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={handleCopyEmails}
              disabled={emails.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#44bbaa] hover:bg-[#005751] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-[5px] transition-colors"
            >
              {copyStatus === 'success' && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {copyStatus === 'success' ? 'Copied!' : copyStatus === 'error' ? 'Copy failed' : 'Copy all emails'}
            </button>
            <button
              onClick={handleDownloadCsv}
              disabled={list.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#d0d0d0] hover:bg-[#f8f8f8] disabled:opacity-50 disabled:cursor-not-allowed text-[#0D4D4D] text-sm font-semibold rounded-[5px] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download CSV (for Google Sheets / Excel)
            </button>
          </div>

          <div className="bg-white rounded-xl border border-[#d0d0d0] shadow-sm overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-[#F8F9FA] border-b border-[#d0d0d0] sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">First Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Last Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Source</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Signed up</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#707070] uppercase tracking-wider">Applied</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e5e5]">
                  {list.map((row, i) => {
                    const { firstName, lastName } = splitName(row.name);
                    return (
                    <tr key={row.email ?? i} className="hover:bg-[#F8F9FA]">
                      <td className="px-4 py-3 text-sm text-[#0D4D4D]">
                        <a href={`mailto:${row.email}`} className="text-[#3DD6C3] hover:text-[#005851] underline underline-offset-1">
                          {row.email}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#2D3748]">{firstName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-[#2D3748]">{lastName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-[#707070]">{formatSource(row.sources)}</td>
                      <td className="px-4 py-3 text-sm text-[#707070]">
                        {row.signedUpAt ? new Date(row.signedUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#707070]">
                        {row.appliedAt ? new Date(row.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
            {list.length === 0 && (
              <div className="px-4 py-8 text-center text-[#707070] text-sm">No contacts yet.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
