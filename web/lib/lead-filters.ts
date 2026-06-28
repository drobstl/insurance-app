/**
 * Lead-list filter model (All-leads view).
 *
 * Types + small helpers for the filter bar. The actual predicates run
 * client-side inside the leads page's `filteredLeads` useMemo (they need the
 * page's in-memory appointment maps to resolve booked / no-show / outcome
 * status), so this module stays pure data + labels — no Firestore, no React.
 *
 * Status sources (where each filter reads from):
 *   - booked / no_show / thinking / no_sale → the appointment maps
 *     (`nextApptByLead`, `pastOutcomeByLead`) already computed on the page
 *   - callback / not_interested → `lead.lastDialOutcome`
 *   - converted → `lead.convertedToClientId`
 *   - new → never dialed, no appt, not converted
 */

export type LeadStatusFilter =
  | 'new'
  | 'booked'
  | 'no_show'
  | 'thinking'
  | 'no_sale'
  | 'callback'
  | 'not_interested'
  | 'converted';

export const LEAD_STATUS_OPTIONS: { key: LeadStatusFilter; label: string }[] = [
  { key: 'new', label: 'Never contacted' },
  { key: 'booked', label: 'Booked' },
  { key: 'no_show', label: 'No-show' },
  { key: 'thinking', label: 'Thinking it over' },
  { key: 'no_sale', label: 'No sale' },
  { key: 'callback', label: 'Callback requested' },
  { key: 'not_interested', label: 'Not interested' },
  { key: 'converted', label: 'Converted' },
];

export interface LeadFilters {
  /** OR within statuses (a lead matching ANY selected status passes). */
  statuses: LeadStatusFilter[];
  /** AND within tags (a lead must carry ALL selected tags) — "narrow down". */
  tagIds: string[];
  /** 2-letter USPS code, or null for any. */
  state: string | null;
  /** Inclusive createdAt range, YYYY-MM-DD; null = open-ended. */
  dateFrom: string | null;
  dateTo: string | null;
}

export const EMPTY_LEAD_FILTERS: LeadFilters = {
  statuses: [],
  tagIds: [],
  state: null,
  dateFrom: null,
  dateTo: null,
};

export function hasActiveFilters(f: LeadFilters): boolean {
  return (
    f.statuses.length > 0 ||
    f.tagIds.length > 0 ||
    !!f.state ||
    !!f.dateFrom ||
    !!f.dateTo
  );
}

/** A "date" range counts as one active filter even when both ends are set. */
export function activeFilterCount(f: LeadFilters): number {
  return (
    f.statuses.length +
    f.tagIds.length +
    (f.state ? 1 : 0) +
    (f.dateFrom || f.dateTo ? 1 : 0)
  );
}
