'use client';

/**
 * /dashboard/clients/duplicates
 *
 * Review screen for the duplicate-client scanner. Agents land here from
 * the "Find duplicates" link on the Clients page. The page:
 *   1. Scans the agent's client list server-side (one POST to
 *      /api/clients/duplicates/scan).
 *   2. Renders the candidate groups grouped by confidence bucket, with
 *      smart per-group defaults pre-selected.
 *   3. Per group lets the agent pick a canonical client, then either
 *      Merge, Mark "not a duplicate," or Skip for now.
 *   4. Merge dispatches to /api/clients/merge. On success the group
 *      animates out and a toast shows the counts of what got moved.
 *
 * No layout shift on action: pending rows are kept in place with a
 * subtle disabled overlay until the API resolves, then removed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDashboard } from '../../DashboardContext';
import { formatClientDisplayName } from '../../../../lib/name-utils';

// ─── Types mirroring the API response ──────────────────────────────

type MatchBucket =
  | 'exact'
  | 'strong'
  | 'fuzzy-corroborated'
  | 'fuzzy-name-only'
  | 'weak';

interface DuplicateMatch {
  bucket: MatchBucket;
  confidence: number;
  reason: string;
}

interface ClientMember {
  id: string;
  name: string;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  notDuplicateOf?: string[];
  createdAt?: number | null;
  policyCount?: number;
}

interface DuplicateGroup {
  members: ClientMember[];
  suggestedCanonicalId: string;
  bucket: MatchBucket;
  matches: Array<{ aId: string; bId: string; match: DuplicateMatch }>;
}

interface MergeCounts {
  policies: number;
  notifications: number;
  actionItems: number;
  conversationThreads: number;
  appointments: number;
  conservationAlerts: number;
  policyReviews: number;
  leadsRewritten: number;
  notDuplicateOfMerged: number;
}

interface MergeOk {
  ok: true;
  dryRun: boolean;
  idempotent: boolean;
  journalId: string | null;
  counts: MergeCounts;
  contactGapsFilled: Record<string, { from: string; to: string }>;
  duplicateClientCode?: string;
}

interface ToastMsg {
  kind: 'success' | 'error';
  title: string;
  detail?: string;
}

// ─── Bucket presentation ───────────────────────────────────────────

const BUCKET_LABEL: Record<MatchBucket, string> = {
  exact: 'Exact match',
  strong: 'Strong match',
  'fuzzy-corroborated': 'Likely match',
  'fuzzy-name-only': 'Possible match',
  weak: 'Worth a glance',
};

/** Buckets where the default action is Merge. */
const AUTO_MERGE_BUCKETS = new Set<MatchBucket>(['exact', 'strong', 'fuzzy-corroborated']);

function bucketBadgeClass(bucket: MatchBucket): string {
  if (AUTO_MERGE_BUCKETS.has(bucket)) {
    return 'bg-[#daf3f0] text-[#005851] border border-[#005851]/30';
  }
  return 'bg-[#fff4d6] text-[#7a5800] border border-[#7a5800]/30';
}

// ─── Small formatting helpers ──────────────────────────────────────

function formatDate(ms: number | null | undefined): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return '';
  }
}

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

// ─── Component ─────────────────────────────────────────────────────

export default function DuplicateReviewPage() {
  const { user, loading: dashLoading } = useDashboard();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [canonicalPick, setCanonicalPick] = useState<Record<string, string>>({});
  const [pendingGroupKey, setPendingGroupKey] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);

  // Keyed by sorted member ids — stable across re-renders.
  const keyForGroup = useCallback((g: DuplicateGroup) => {
    return [...g.members].map((m) => m.id).sort().join('|');
  }, []);

  const runScan = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setScanError(null);
    try {
      const token = await user.getIdToken();
      const resp = await fetch('/api/clients/duplicates/scan', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`Scan failed (${resp.status}): ${detail.slice(0, 120)}`);
      }
      const data = await resp.json() as { groups: DuplicateGroup[] };
      setGroups(data.groups ?? []);
      // Seed canonical picks from the server's suggestion.
      const seed: Record<string, string> = {};
      for (const g of data.groups ?? []) {
        seed[keyForGroup(g)] = g.suggestedCanonicalId;
      }
      setCanonicalPick(seed);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setLoading(false);
      setHasScanned(true);
    }
  }, [user, keyForGroup]);

  // Auto-scan on first mount once auth is settled.
  useEffect(() => {
    if (dashLoading || !user || hasScanned || loading) return;
    runScan();
  }, [dashLoading, user, hasScanned, loading, runScan]);

  const removeGroup = useCallback((key: string) => {
    setGroups((prev) => prev.filter((g) => keyForGroup(g) !== key));
  }, [keyForGroup]);

  const handleMerge = useCallback(async (g: DuplicateGroup) => {
    if (!user) return;
    const key = keyForGroup(g);
    const canonicalId = canonicalPick[key] ?? g.suggestedCanonicalId;
    const duplicates = g.members.filter((m) => m.id !== canonicalId);
    if (duplicates.length === 0) return;

    setPendingGroupKey(key);
    try {
      const token = await user.getIdToken();
      let totalCounts: MergeCounts | null = null;
      // Merge each duplicate sequentially into the canonical. Sequential
      // (not parallel) so the canonical sees gap-fills from the first
      // duplicate before the second is processed.
      for (const dup of duplicates) {
        const resp = await fetch('/api/clients/merge', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ canonicalId, duplicateId: dup.id }),
        });
        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          throw new Error(
            errBody?.detail || errBody?.reason || `Merge failed (${resp.status})`,
          );
        }
        const result = await resp.json() as MergeOk;
        if (!totalCounts) totalCounts = { ...result.counts };
        else {
          (Object.keys(result.counts) as Array<keyof MergeCounts>).forEach((k) => {
            totalCounts![k] += result.counts[k];
          });
        }
      }

      removeGroup(key);
      const canonicalName = g.members.find((m) => m.id === canonicalId)?.name ?? 'client';
      const summary = totalCounts ? [
        totalCounts.policies && `${totalCounts.policies} polic${totalCounts.policies === 1 ? 'y' : 'ies'}`,
        totalCounts.actionItems && `${totalCounts.actionItems} task${totalCounts.actionItems === 1 ? '' : 's'}`,
        totalCounts.appointments && `${totalCounts.appointments} appointment${totalCounts.appointments === 1 ? '' : 's'}`,
      ].filter(Boolean).join(', ') : '';
      setToast({
        kind: 'success',
        title: `Merged into ${formatClientDisplayName(canonicalName)}`,
        detail: summary ? `Moved ${summary}.` : 'No additional data to move.',
      });
    } catch (err) {
      setToast({
        kind: 'error',
        title: 'Merge failed',
        detail: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setPendingGroupKey(null);
    }
  }, [user, canonicalPick, keyForGroup, removeGroup]);

  const handleNotDuplicate = useCallback(async (g: DuplicateGroup) => {
    if (!user) return;
    if (g.members.length < 2) return;
    const key = keyForGroup(g);

    setPendingGroupKey(key);
    try {
      const token = await user.getIdToken();
      // For groups with >2 members, mark every pair as not-a-duplicate
      // so the scan doesn't resurface any of them.
      const pairs: Array<[string, string]> = [];
      for (let i = 0; i < g.members.length; i++) {
        for (let j = i + 1; j < g.members.length; j++) {
          pairs.push([g.members[i].id, g.members[j].id]);
        }
      }
      for (const [a, b] of pairs) {
        const resp = await fetch('/api/clients/not-duplicate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ clientIdA: a, clientIdB: b }),
        });
        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          throw new Error(errBody?.error || `Failed (${resp.status})`);
        }
      }
      removeGroup(key);
      setToast({
        kind: 'success',
        title: 'Marked as not a duplicate',
        detail: 'These clients won’t be flagged again.',
      });
    } catch (err) {
      setToast({
        kind: 'error',
        title: 'Could not save',
        detail: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setPendingGroupKey(null);
    }
  }, [user, keyForGroup, removeGroup]);

  // Auto-clear toast after 5 seconds.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Group view-model for rendering.
  const groupsByBucket = useMemo(() => {
    const merge: DuplicateGroup[] = [];
    const review: DuplicateGroup[] = [];
    for (const g of groups) {
      if (AUTO_MERGE_BUCKETS.has(g.bucket)) merge.push(g);
      else review.push(g);
    }
    return { merge, review };
  }, [groups]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#000000]">Find duplicates</h1>
            <p className="text-[#707070] text-sm mt-1">
              Review clients that may be the same person and merge them so policies stack on one record.
            </p>
          </div>
          <Link
            href="/dashboard/clients"
            className="text-sm font-semibold text-[#005851] hover:underline shrink-0"
          >
            ← Back to Clients
          </Link>
        </div>
      </div>

      {toast && (
        <div
          className={`mb-4 rounded-xl border-2 px-4 py-3 ${
            toast.kind === 'success'
              ? 'bg-[#daf3f0] border-[#1A1A1A] border-r-[4px] border-b-[4px]'
              : 'bg-red-50 border-red-300'
          }`}
        >
          <p className={`font-semibold text-sm ${toast.kind === 'success' ? 'text-[#005851]' : 'text-red-700'}`}>
            {toast.title}
          </p>
          {toast.detail && (
            <p className={`text-sm mt-1 ${toast.kind === 'success' ? 'text-[#0D4D4D]' : 'text-red-600'}`}>
              {toast.detail}
            </p>
          )}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] bg-white px-4 py-6 text-center">
          <svg className="w-6 h-6 text-[#45bcaa] mx-auto animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-[#5f5f5f] mt-3">Scanning your client list&hellip;</p>
        </div>
      )}

      {scanError && !loading && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 mb-4">
          <p className="font-semibold text-sm text-red-700">Scan failed</p>
          <p className="text-sm text-red-600 mt-1">{scanError}</p>
          <button
            onClick={runScan}
            className="mt-2 px-3 py-1.5 rounded-[5px] text-xs font-semibold border border-red-700 text-red-700 bg-white hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !scanError && hasScanned && groups.length === 0 && (
        <div className="rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] bg-white px-4 py-8 text-center">
          <p className="font-semibold text-[#000000]">No duplicates found.</p>
          <p className="text-sm text-[#5f5f5f] mt-1">Your client list looks clean.</p>
          <button
            onClick={runScan}
            className="mt-4 px-3 py-1.5 rounded-[5px] text-xs font-semibold border border-[#1A1A1A] text-[#000000] bg-white hover:bg-[#f8f8f8]"
          >
            Scan again
          </button>
        </div>
      )}

      {!loading && !scanError && groups.length > 0 && (
        <>
          <p className="text-sm text-[#5f5f5f] mb-4">
            Found <span className="font-semibold text-[#000000]">{groups.length}</span>{' '}
            possible duplicate{groups.length === 1 ? '' : ' groups'}.
            {groupsByBucket.merge.length > 0 && groupsByBucket.review.length > 0 && (
              <>
                {' '}
                <span className="font-semibold text-[#005851]">{groupsByBucket.merge.length}</span>{' '}
                look like real duplicates,{' '}
                <span className="font-semibold text-[#7a5800]">{groupsByBucket.review.length}</span>{' '}
                need a closer look.
              </>
            )}
          </p>

          {groupsByBucket.merge.length > 0 && (
            <Section title="Likely duplicates" subtitle="Default action: merge into one record.">
              {groupsByBucket.merge.map((g) => (
                <GroupCard
                  key={keyForGroup(g)}
                  group={g}
                  canonicalId={canonicalPick[keyForGroup(g)] ?? g.suggestedCanonicalId}
                  onCanonicalChange={(id) =>
                    setCanonicalPick((prev) => ({ ...prev, [keyForGroup(g)]: id }))
                  }
                  pending={pendingGroupKey === keyForGroup(g)}
                  defaultMerge
                  onMerge={() => handleMerge(g)}
                  onNotDuplicate={() => handleNotDuplicate(g)}
                />
              ))}
            </Section>
          )}

          {groupsByBucket.review.length > 0 && (
            <Section
              title="Possible duplicates"
              subtitle="These share a name pattern but lack matching DOB/phone/email. Default action: keep separate."
            >
              {groupsByBucket.review.map((g) => (
                <GroupCard
                  key={keyForGroup(g)}
                  group={g}
                  canonicalId={canonicalPick[keyForGroup(g)] ?? g.suggestedCanonicalId}
                  onCanonicalChange={(id) =>
                    setCanonicalPick((prev) => ({ ...prev, [keyForGroup(g)]: id }))
                  }
                  pending={pendingGroupKey === keyForGroup(g)}
                  defaultMerge={false}
                  onMerge={() => handleMerge(g)}
                  onNotDuplicate={() => handleNotDuplicate(g)}
                />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

// ─── Section + Group card ──────────────────────────────────────────

function Section({
  title, subtitle, children,
}: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-bold text-[#000000] mb-1">{title}</h2>
      <p className="text-xs text-[#707070] mb-3">{subtitle}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

interface GroupCardProps {
  group: DuplicateGroup;
  canonicalId: string;
  onCanonicalChange: (id: string) => void;
  pending: boolean;
  defaultMerge: boolean;
  onMerge: () => void;
  onNotDuplicate: () => void;
}

function GroupCard({
  group, canonicalId, onCanonicalChange, pending, defaultMerge, onMerge, onNotDuplicate,
}: GroupCardProps) {
  const reason = group.matches[0]?.match.reason ?? '';
  return (
    <div className={`relative rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] bg-white p-4 ${pending ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bucketBadgeClass(group.bucket)}`}>
            {BUCKET_LABEL[group.bucket]}
          </span>
          {reason && <span className="text-xs text-[#707070]">{reason}</span>}
        </div>
        <span className="text-xs text-[#707070]">
          {group.members.length} record{group.members.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-2 mb-3">
        {group.members.map((m) => (
          <label
            key={m.id}
            className={`flex items-start gap-3 rounded-[5px] border px-3 py-2 cursor-pointer transition-colors ${
              canonicalId === m.id
                ? 'border-[#005851] bg-[#daf3f0]/30'
                : 'border-[#d0d0d0] bg-white hover:bg-[#f8f8f8]'
            }`}
          >
            <input
              type="radio"
              name={`canonical-${group.members.map((mm) => mm.id).join('-')}`}
              checked={canonicalId === m.id}
              onChange={() => onCanonicalChange(m.id)}
              className="mt-1 accent-[#005851]"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-[#000000] truncate">
                  {formatClientDisplayName(m.name) || '(no name)'}
                </p>
                {canonicalId === m.id && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#005851] shrink-0">
                    Keep this one
                  </span>
                )}
              </div>
              <div className="text-xs text-[#5f5f5f] mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {m.dateOfBirth && <span>DOB {m.dateOfBirth}</span>}
                {m.phone && <span>{formatPhone(m.phone)}</span>}
                {m.email && <span className="truncate max-w-[200px]">{m.email}</span>}
                <span>
                  {m.policyCount ?? 0} polic{(m.policyCount ?? 0) === 1 ? 'y' : 'ies'}
                </span>
                {m.createdAt && <span>added {formatDate(m.createdAt)}</span>}
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onNotDuplicate}
          className="px-3 py-1.5 rounded-[5px] text-xs font-semibold border border-[#1A1A1A] text-[#000000] bg-white hover:bg-[#f8f8f8]"
        >
          Not a duplicate
        </button>
        <button
          type="button"
          onClick={onMerge}
          className={`px-3 py-1.5 rounded-[5px] text-xs font-semibold ${
            defaultMerge
              ? 'bg-[#005851] text-white hover:bg-[#0a6e66]'
              : 'border border-[#005851] text-[#005851] bg-white hover:bg-[#daf3f0]/40'
          }`}
        >
          Merge {group.members.length > 2 ? `${group.members.length - 1} into 1` : 'into selected'}
        </button>
      </div>

      {pending && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg className="w-6 h-6 text-[#005851] animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}
    </div>
  );
}
