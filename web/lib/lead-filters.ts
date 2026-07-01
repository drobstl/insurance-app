/**
 * Lead-list filter model (All-leads view).
 *
 * Types + small helpers for the filter bar and the natural-language search
 * (which compiles a typed sentence into a `LeadFilters` value — see
 * `app/api/leads/search-translate`). The actual predicates run client-side
 * inside the leads page's `filteredLeads` useMemo (they need the page's
 * in-memory appointment maps to resolve booked / no-show / outcome status),
 * so this module stays pure data + labels — no Firestore, no React.
 *
 * Status sources (where each filter reads from):
 *   - booked / no_show / thinking / no_sale → the appointment maps
 *     (`nextApptByLead`, `pastOutcomeByLead`) already computed on the page
 *   - callback / not_interested → `lead.lastDialOutcome`
 *   - converted → `lead.convertedToClientId`
 *   - new → never dialed, no appt, not converted
 * Everything else reads straight off the lead doc (age, temperature, dial
 * outcome, app/assessment/intro flags, smoker/gender, mortgage, dates).
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

/** Lead temperature from the pre-call assessment score. */
export type LeadTemperature = 'hot' | 'warm' | 'cool';

export const LEAD_TEMPERATURE_OPTIONS: { key: LeadTemperature; label: string }[] = [
  { key: 'hot', label: 'Hot' },
  { key: 'warm', label: 'Warm' },
  { key: 'cool', label: 'Cool' },
];

/**
 * Dial outcomes exposed as their own facet. `callback_requested` and
 * `not_interested` live under Status (they're how an agent thinks about the
 * lead), so they're intentionally omitted here to avoid two controls doing
 * the same thing.
 */
export type LeadDialOutcomeFilter =
  | 'no_answer'
  | 'left_vm'
  | 'wrong_number'
  | 'do_not_call'
  | 'booked';

export const LEAD_DIAL_OUTCOME_OPTIONS: { key: LeadDialOutcomeFilter; label: string }[] = [
  { key: 'no_answer', label: 'No answer' },
  { key: 'left_vm', label: 'Left voicemail' },
  { key: 'wrong_number', label: 'Wrong number' },
  { key: 'do_not_call', label: 'Do not call' },
  { key: 'booked', label: 'Booked on call' },
];

/** Three-way flag: require present, require absent, or don't care. */
export type TriState = 'yes' | 'no' | null;

export type SmokerFilter = 'Y' | 'N' | null;
export type GenderFilter = 'M' | 'F' | null;

export interface LeadFilters {
  /** OR within statuses (a lead matching ANY selected status passes). */
  statuses: LeadStatusFilter[];
  /** AND within tags (a lead must carry ALL selected tags) — "narrow down". */
  tagIds: string[];
  /** OR within states; each a 2-letter USPS code. Empty = any. */
  states: string[];
  /** Case-insensitive substring on `address.city`; null = any. */
  city: string | null;
  /** Inclusive createdAt range, YYYY-MM-DD; null = open-ended. */
  dateFrom: string | null;
  dateTo: string | null;
  /** Only leads with a follow-up due now (followUpAt <= now). */
  followUpDue: boolean;
  /** Only leads that have a follow-up scheduled at all (any time). */
  hasFollowUp: boolean;
  /** OR within temperatures. Empty = any. */
  temperatures: LeadTemperature[];
  /** OR within dial outcomes (most recent dial). Empty = any. */
  dialOutcomes: LeadDialOutcomeFilter[];
  /** Inclusive age range (resolved from ageYears, falling back to DOB). */
  ageMin: number | null;
  ageMax: number | null;
  /** Symmetry lead-credit eligible (age >= 80). */
  creditEligible: boolean;
  /** Tri-state flags off the lead doc. */
  appDownloaded: TriState;
  assessmentCompleted: TriState;
  introSent: TriState;
  /** Contact recency, in days. null = unused. */
  notContactedDays: number | null;
  contactedWithinDays: number | null;
  /** Never dialed at all. */
  neverContacted: boolean;
  smoker: SmokerFilter;
  gender: GenderFilter;
  /** Has a mortgage payment on file (monthlyMortgageAmount > 0). */
  hasMortgage: boolean;
}

export const EMPTY_LEAD_FILTERS: LeadFilters = {
  statuses: [],
  tagIds: [],
  states: [],
  city: null,
  dateFrom: null,
  dateTo: null,
  followUpDue: false,
  hasFollowUp: false,
  temperatures: [],
  dialOutcomes: [],
  ageMin: null,
  ageMax: null,
  creditEligible: false,
  appDownloaded: null,
  assessmentCompleted: null,
  introSent: null,
  notContactedDays: null,
  contactedWithinDays: null,
  neverContacted: false,
  smoker: null,
  gender: null,
  hasMortgage: false,
};

export function hasActiveFilters(f: LeadFilters): boolean {
  return activeFilterCount(f) > 0;
}

/**
 * Number of distinct active filters. A date range counts as one even with
 * both ends set; an age range likewise. Used for the "Clear all (N)" label.
 */
export function activeFilterCount(f: LeadFilters): number {
  return (
    f.statuses.length +
    f.tagIds.length +
    f.states.length +
    f.temperatures.length +
    f.dialOutcomes.length +
    (f.city ? 1 : 0) +
    (f.dateFrom || f.dateTo ? 1 : 0) +
    (f.ageMin != null || f.ageMax != null ? 1 : 0) +
    (f.creditEligible ? 1 : 0) +
    (f.followUpDue ? 1 : 0) +
    (f.hasFollowUp ? 1 : 0) +
    (f.appDownloaded ? 1 : 0) +
    (f.assessmentCompleted ? 1 : 0) +
    (f.introSent ? 1 : 0) +
    (f.notContactedDays != null ? 1 : 0) +
    (f.contactedWithinDays != null ? 1 : 0) +
    (f.neverContacted ? 1 : 0) +
    (f.smoker ? 1 : 0) +
    (f.gender ? 1 : 0) +
    (f.hasMortgage ? 1 : 0)
  );
}

const STATUS_SET = new Set<string>(LEAD_STATUS_OPTIONS.map((o) => o.key));
const TEMP_SET = new Set<string>(LEAD_TEMPERATURE_OPTIONS.map((o) => o.key));
const DIAL_SET = new Set<string>(LEAD_DIAL_OUTCOME_OPTIONS.map((o) => o.key));

function coerceTri(v: unknown): TriState {
  return v === 'yes' || v === 'no' ? v : null;
}
function coerceState2(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : null;
}
function coercePosInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}
function coerceAge(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= 0 && n <= 130 ? n : null;
}

/**
 * Coerce an untrusted value (a filter snapshot read back off a saved segment,
 * or the JSON the natural-language translator returns) into a valid
 * `LeadFilters`, dropping anything malformed. Always returns a fresh object —
 * safe to feed straight into `setFilters`.
 *
 * Back-compat: older saved segments stored a single `state: string`. We read
 * that into `states: [..]` so legacy lists keep working.
 */
export function coerceLeadFilters(value: unknown): LeadFilters {
  if (!value || typeof value !== 'object') return { ...EMPTY_LEAD_FILTERS };
  const r = value as Record<string, unknown>;

  const statuses = Array.isArray(r.statuses)
    ? (r.statuses.filter((s) => typeof s === 'string' && STATUS_SET.has(s)) as LeadStatusFilter[])
    : [];
  const tagIds = Array.isArray(r.tagIds)
    ? (r.tagIds.filter((t) => typeof t === 'string') as string[])
    : [];

  let states: string[] = [];
  if (Array.isArray(r.states)) {
    states = r.states.map(coerceState2).filter((s): s is string => !!s);
  } else if (typeof r.state === 'string') {
    const legacy = coerceState2(r.state);
    if (legacy) states = [legacy];
  }
  states = Array.from(new Set(states));

  const temperatures = Array.isArray(r.temperatures)
    ? (r.temperatures.filter((t) => typeof t === 'string' && TEMP_SET.has(t)) as LeadTemperature[])
    : [];
  const dialOutcomes = Array.isArray(r.dialOutcomes)
    ? (r.dialOutcomes.filter((d) => typeof d === 'string' && DIAL_SET.has(d)) as LeadDialOutcomeFilter[])
    : [];

  return {
    statuses,
    tagIds,
    states,
    city: typeof r.city === 'string' && r.city.trim() ? r.city.trim() : null,
    dateFrom: typeof r.dateFrom === 'string' && r.dateFrom ? r.dateFrom : null,
    dateTo: typeof r.dateTo === 'string' && r.dateTo ? r.dateTo : null,
    followUpDue: r.followUpDue === true,
    hasFollowUp: r.hasFollowUp === true,
    temperatures,
    dialOutcomes,
    ageMin: coerceAge(r.ageMin),
    ageMax: coerceAge(r.ageMax),
    creditEligible: r.creditEligible === true,
    appDownloaded: coerceTri(r.appDownloaded),
    assessmentCompleted: coerceTri(r.assessmentCompleted),
    introSent: coerceTri(r.introSent),
    notContactedDays: coercePosInt(r.notContactedDays),
    contactedWithinDays: coercePosInt(r.contactedWithinDays),
    neverContacted: r.neverContacted === true,
    smoker: r.smoker === 'Y' || r.smoker === 'N' ? r.smoker : null,
    gender: r.gender === 'M' || r.gender === 'F' ? r.gender : null,
    hasMortgage: r.hasMortgage === true,
  };
}

/**
 * One removable chip per active filter. Drives the editable-chip row under the
 * search bar: each descriptor carries the label to show and `next` — the
 * filters with just that piece removed. Multi-select facets (statuses, tags,
 * states, temperatures, dial outcomes) yield one chip per selected value so
 * each can be cleared on its own.
 */
export interface ActiveFilterChip {
  id: string;
  label: string;
  next: LeadFilters;
}

export function activeFilterChips(
  f: LeadFilters,
  tagLabel: (id: string) => string | null,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const statusLabel = (k: LeadStatusFilter) =>
    LEAD_STATUS_OPTIONS.find((o) => o.key === k)?.label ?? k;
  const tempLabel = (k: LeadTemperature) =>
    LEAD_TEMPERATURE_OPTIONS.find((o) => o.key === k)?.label ?? k;
  const dialLabel = (k: LeadDialOutcomeFilter) =>
    LEAD_DIAL_OUTCOME_OPTIONS.find((o) => o.key === k)?.label ?? k;

  for (const s of f.statuses) {
    chips.push({ id: `status:${s}`, label: statusLabel(s), next: { ...f, statuses: f.statuses.filter((x) => x !== s) } });
  }
  for (const id of f.tagIds) {
    chips.push({ id: `tag:${id}`, label: tagLabel(id) ?? 'Tag', next: { ...f, tagIds: f.tagIds.filter((x) => x !== id) } });
  }
  for (const st of f.states) {
    chips.push({ id: `state:${st}`, label: st, next: { ...f, states: f.states.filter((x) => x !== st) } });
  }
  if (f.city) chips.push({ id: 'city', label: f.city, next: { ...f, city: null } });
  for (const t of f.temperatures) {
    chips.push({ id: `temp:${t}`, label: tempLabel(t), next: { ...f, temperatures: f.temperatures.filter((x) => x !== t) } });
  }
  for (const d of f.dialOutcomes) {
    chips.push({ id: `dial:${d}`, label: dialLabel(d), next: { ...f, dialOutcomes: f.dialOutcomes.filter((x) => x !== d) } });
  }
  if (f.creditEligible) {
    chips.push({ id: 'creditEligible', label: 'Lead credit · 80+', next: { ...f, creditEligible: false } });
  }
  if (f.ageMin != null || f.ageMax != null) {
    const label =
      f.ageMin != null && f.ageMax != null
        ? `Age ${f.ageMin}–${f.ageMax}`
        : f.ageMin != null
          ? `Age ${f.ageMin}+`
          : `Age up to ${f.ageMax}`;
    chips.push({ id: 'age', label, next: { ...f, ageMin: null, ageMax: null } });
  }
  if (f.dateFrom || f.dateTo) {
    const label =
      f.dateFrom && f.dateTo
        ? `Added ${f.dateFrom} → ${f.dateTo}`
        : f.dateFrom
          ? `Added after ${f.dateFrom}`
          : `Added before ${f.dateTo}`;
    chips.push({ id: 'date', label, next: { ...f, dateFrom: null, dateTo: null } });
  }
  if (f.neverContacted) chips.push({ id: 'neverContacted', label: 'Never called', next: { ...f, neverContacted: false } });
  if (f.notContactedDays != null)
    chips.push({ id: 'notContactedDays', label: `Not called in ${f.notContactedDays}d`, next: { ...f, notContactedDays: null } });
  if (f.contactedWithinDays != null)
    chips.push({ id: 'contactedWithinDays', label: `Called within ${f.contactedWithinDays}d`, next: { ...f, contactedWithinDays: null } });
  if (f.followUpDue) chips.push({ id: 'followUpDue', label: 'Follow-up due', next: { ...f, followUpDue: false } });
  if (f.hasFollowUp) chips.push({ id: 'hasFollowUp', label: 'Has follow-up', next: { ...f, hasFollowUp: false } });
  if (f.appDownloaded) chips.push({ id: 'appDownloaded', label: f.appDownloaded === 'yes' ? 'Has app' : 'No app', next: { ...f, appDownloaded: null } });
  if (f.assessmentCompleted)
    chips.push({ id: 'assessmentCompleted', label: f.assessmentCompleted === 'yes' ? 'Assessment done' : 'No assessment', next: { ...f, assessmentCompleted: null } });
  if (f.introSent) chips.push({ id: 'introSent', label: f.introSent === 'yes' ? 'Intro sent' : 'No intro', next: { ...f, introSent: null } });
  if (f.smoker) chips.push({ id: 'smoker', label: f.smoker === 'Y' ? 'Smoker' : 'Non-smoker', next: { ...f, smoker: null } });
  if (f.gender) chips.push({ id: 'gender', label: f.gender === 'M' ? 'Male' : 'Female', next: { ...f, gender: null } });
  if (f.hasMortgage) chips.push({ id: 'hasMortgage', label: 'Has mortgage', next: { ...f, hasMortgage: false } });

  return chips;
}
