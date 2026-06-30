/**
 * Saved lead lists ("segments") — a named snapshot of the All-leads view's
 * search + filters + sort, so an agent can re-apply a working list with one
 * click ("Texas — hot — not yet called").
 *
 * Definitions live on the agent doc (`agents/{uid}.savedLeadSegments`,
 * mirrored into `agentProfile` via DashboardContext — the same pattern as
 * `leadTags`). Applying a segment just sets the page's filter/search/sort
 * state; nothing is persisted per-lead and no Firestore index is needed.
 *
 * A segment stores tag ids and a sort key by value. Those can drift (a tag
 * gets deleted, a sort key gets renamed) — that's fine: the filter predicates
 * already drop unknown tag ids lazily, and an unknown sort key falls back to
 * the default comparator, so a stale segment degrades gracefully.
 */

import {
  type LeadFilters,
  EMPTY_LEAD_FILTERS,
  coerceLeadFilters,
} from './lead-filters';

// Mirror of the leads page's LeadSortKey / SortDir. Redeclared here (rather
// than imported from the page) to avoid pulling the heavy page module into a
// pure lib — keep in lock-step with `LeadSortKey` in
// `app/dashboard/leads/page.tsx`.
export type LeadSegmentSortKey =
  | 'name'
  | 'createdAt'
  | 'source'
  | 'priority'
  | 'state'
  | 'temperature'
  | 'lastContacted'
  | 'followUpAt'
  | 'ageYears'
  | 'appDownloadedAt'
  | 'assessmentCompletedAt';

export type LeadSegmentSortDir = 'asc' | 'desc';

const SORT_KEYS = new Set<string>([
  'name', 'createdAt', 'source', 'priority', 'state', 'temperature',
  'lastContacted', 'followUpAt', 'ageYears', 'appDownloadedAt',
  'assessmentCompletedAt',
]);

export interface SavedLeadSegment {
  id: string;
  name: string;
  filters: LeadFilters;
  searchQuery: string;
  sortKey: LeadSegmentSortKey;
  sortDir: LeadSegmentSortDir;
}

export const MAX_LEAD_SEGMENTS = 24;
export const MAX_SEGMENT_NAME_LEN = 40;

export function normalizeSegmentName(name: string): string {
  return (name || '').trim().replace(/\s+/g, ' ').slice(0, MAX_SEGMENT_NAME_LEN);
}

export function newLeadSegmentId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `seg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** Validate + normalize a raw `savedLeadSegments` array read off the agent doc. */
export function parseLeadSegments(value: unknown): SavedLeadSegment[] {
  if (!Array.isArray(value)) return [];
  const out: SavedLeadSegment[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    const name = normalizeSegmentName(typeof r.name === 'string' ? r.name : '');
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      filters: coerceLeadFilters(r.filters),
      searchQuery: typeof r.searchQuery === 'string' ? r.searchQuery : '',
      sortKey: typeof r.sortKey === 'string' && SORT_KEYS.has(r.sortKey)
        ? (r.sortKey as LeadSegmentSortKey)
        : 'createdAt',
      sortDir: r.sortDir === 'asc' ? 'asc' : 'desc',
    });
  }
  return out.slice(0, MAX_LEAD_SEGMENTS);
}

/** True when the current view state matches a saved segment (for active highlight). */
export function segmentMatchesState(
  seg: SavedLeadSegment,
  state: { filters: LeadFilters; searchQuery: string; sortKey: string; sortDir: string },
): boolean {
  return (
    seg.searchQuery.trim() === state.searchQuery.trim() &&
    seg.sortKey === state.sortKey &&
    seg.sortDir === state.sortDir &&
    JSON.stringify(normalizeFiltersForCompare(seg.filters)) ===
      JSON.stringify(normalizeFiltersForCompare(state.filters))
  );
}

// Order-independent comparison of the multi-select fields so a re-applied
// segment still reads as "active" regardless of selection order. Runs the
// value through coerceLeadFilters first so every field is normalized and any
// added filter is automatically included in the comparison.
function normalizeFiltersForCompare(f: LeadFilters) {
  const c = coerceLeadFilters(f);
  return {
    ...c,
    statuses: [...c.statuses].sort(),
    tagIds: [...c.tagIds].sort(),
    states: [...c.states].sort(),
    temperatures: [...c.temperatures].sort(),
    dialOutcomes: [...c.dialOutcomes].sort(),
  };
}

export { EMPTY_LEAD_FILTERS };
