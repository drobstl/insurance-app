'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  type LeadFilters,
  type LeadStatusFilter,
  type LeadTemperature,
  type LeadDialOutcomeFilter,
  type TriState,
  LEAD_STATUS_OPTIONS,
  LEAD_TEMPERATURE_OPTIONS,
  LEAD_DIAL_OUTCOME_OPTIONS,
  EMPTY_LEAD_FILTERS,
  activeFilterCount,
  hasActiveFilters,
} from '../lib/lead-filters';
import { type LeadTag, tagSwatchClass } from '../lib/lead-tag';

type OpenKey =
  | 'status'
  | 'temp'
  | 'tags'
  | 'state'
  | 'age'
  | 'date'
  | 'activity'
  | 'calls'
  | 'more'
  | null;

/**
 * Filter bar for the All-leads view. Pure UI over a LeadFilters value — the
 * predicates run in the page's filteredLeads useMemo. Dropdowns are absolutely
 * positioned; one open at a time, click-outside closes. The natural-language
 * search compiles into the same LeadFilters, so anything set here can also be
 * set by typing, and vice-versa.
 */
export function LeadFilterBar({
  filters,
  onChange,
  tags,
  availableStates,
}: {
  filters: LeadFilters;
  onChange: (f: LeadFilters) => void;
  tags: LeadTag[];
  availableStates: string[];
}) {
  const [open, setOpen] = useState<OpenKey>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function toggleIn<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  const btn = (key: Exclude<OpenKey, null>, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setOpen((o) => (o === key ? null : key))}
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-[5px] border ${
        count > 0
          ? 'border-[#45bcaa] bg-[#daf3f0] text-[#005851]'
          : 'border-[#d0d0d0] bg-white text-[#707070] hover:border-[#45bcaa]'
      }`}
    >
      {label}
      {count > 0 && <span className="px-1 rounded-full bg-[#005851] text-white text-[10px] leading-tight">{count}</span>}
      <span className="text-[8px]">▼</span>
    </button>
  );

  const panel = (children: ReactNode) => (
    <div className="absolute left-0 z-30 mt-1 min-w-[12rem] max-w-[20rem] p-2 bg-white rounded-[8px] border border-[#d0d0d0] shadow-lg">
      {children}
    </div>
  );

  function checklist<T extends string>(
    opts: { key: T; label: string }[],
    selected: T[],
    onToggle: (k: T) => void,
    swatch?: (k: T) => ReactNode,
  ) {
    return (
      <div className="space-y-0.5 max-h-56 overflow-auto">
        {opts.map((o) => (
          <label
            key={o.key}
            className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-[#f5f5f5] cursor-pointer"
          >
            <input type="checkbox" checked={selected.includes(o.key)} onChange={() => onToggle(o.key)} />
            {swatch?.(o.key)}
            {o.label}
          </label>
        ))}
      </div>
    );
  }

  const triRow = (label: string, value: TriState, set: (v: TriState) => void) => {
    const cell = (v: TriState, text: string) => (
      <button
        type="button"
        onClick={() => set(v)}
        className={`px-2 py-0.5 text-xs ${
          value === v ? 'bg-[#005851] text-white' : 'bg-white text-[#707070] hover:bg-[#f5f5f5]'
        }`}
      >
        {text}
      </button>
    );
    return (
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <span className="text-sm text-[#374151]">{label}</span>
        <div className="flex rounded border border-[#d0d0d0] overflow-hidden">
          {cell(null, 'Any')}
          {cell('yes', 'Yes')}
          {cell('no', 'No')}
        </div>
      </div>
    );
  };

  const ageCount = (filters.ageMin != null || filters.ageMax != null ? 1 : 0) + (filters.creditEligible ? 1 : 0);
  const activityCount =
    (filters.appDownloaded ? 1 : 0) + (filters.assessmentCompleted ? 1 : 0) + (filters.introSent ? 1 : 0);
  const callsCount =
    filters.dialOutcomes.length +
    (filters.neverContacted ? 1 : 0) +
    (filters.notContactedDays != null ? 1 : 0) +
    (filters.contactedWithinDays != null ? 1 : 0);
  const moreCount = (filters.smoker ? 1 : 0) + (filters.gender ? 1 : 0) + (filters.hasMortgage ? 1 : 0);

  const numField = (value: number | null, onVal: (n: number | null) => void, placeholder: string) => (
    <input
      type="number"
      inputMode="numeric"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        const n = e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value)));
        onVal(Number.isFinite(n as number) ? n : null);
      }}
      className="w-16 px-2 py-1 text-sm border border-[#d0d0d0] rounded"
    />
  );

  return (
    <div ref={barRef} className="relative flex items-center gap-2 flex-wrap mb-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Filter</span>

      <div className="relative">
        {btn('status', 'Status', filters.statuses.length)}
        {open === 'status' &&
          panel(
            checklist<LeadStatusFilter>(LEAD_STATUS_OPTIONS, filters.statuses, (k) =>
              onChange({ ...filters, statuses: toggleIn(filters.statuses, k) }),
            ),
          )}
      </div>

      <div className="relative">
        {btn('temp', 'Temperature', filters.temperatures.length)}
        {open === 'temp' &&
          panel(
            checklist<LeadTemperature>(LEAD_TEMPERATURE_OPTIONS, filters.temperatures, (k) =>
              onChange({ ...filters, temperatures: toggleIn(filters.temperatures, k) }),
            ),
          )}
      </div>

      <div className="relative">
        {btn('tags', 'Tags', filters.tagIds.length)}
        {open === 'tags' &&
          panel(
            tags.length === 0 ? (
              <p className="px-2 py-1 text-xs text-[#9CA3AF]">No tags yet — add them on a lead.</p>
            ) : (
              checklist(
                tags.map((t) => ({ key: t.id, label: t.label })),
                filters.tagIds,
                (id) => onChange({ ...filters, tagIds: toggleIn(filters.tagIds, id) }),
                (id) => {
                  const t = tags.find((x) => x.id === id);
                  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${t ? tagSwatchClass(t.color) : ''}`} />;
                },
              )
            ),
          )}
      </div>

      <div className="relative">
        {btn('state', 'State', filters.states.length)}
        {open === 'state' &&
          panel(
            availableStates.length === 0 ? (
              <p className="px-2 py-1 text-xs text-[#9CA3AF]">No states on file.</p>
            ) : (
              <>
                {filters.states.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, states: [] })}
                    className="block w-full text-left px-2 py-1 text-xs text-[#A0382A] hover:underline"
                  >
                    Clear states
                  </button>
                )}
                {checklist(
                  availableStates.map((s) => ({ key: s, label: s })),
                  filters.states,
                  (s) => onChange({ ...filters, states: toggleIn(filters.states, s) }),
                )}
              </>
            ),
          )}
      </div>

      <div className="relative">
        {btn('age', 'Age', ageCount)}
        {open === 'age' &&
          panel(
            <div className="space-y-2 p-1">
              <div className="flex items-center gap-2">
                {numField(filters.ageMin, (n) => onChange({ ...filters, ageMin: n }), 'Min')}
                <span className="text-sm text-[#707070]">to</span>
                {numField(filters.ageMax, (n) => onChange({ ...filters, ageMax: n }), 'Max')}
              </div>
              <label className="flex items-center gap-2 px-1 py-1 text-sm rounded hover:bg-[#f5f5f5] cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.creditEligible}
                  onChange={() => onChange({ ...filters, creditEligible: !filters.creditEligible })}
                />
                Lead-credit eligible (80+)
              </label>
              {ageCount > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, ageMin: null, ageMax: null, creditEligible: false })}
                  className="text-xs text-[#A0382A] hover:underline"
                >
                  Clear age
                </button>
              )}
            </div>,
          )}
      </div>

      <div className="relative">
        {btn('date', 'Date added', filters.dateFrom || filters.dateTo ? 1 : 0)}
        {open === 'date' &&
          panel(
            <div className="space-y-2 p-1">
              <label className="block text-xs text-[#707070]">
                From
                <input
                  type="date"
                  value={filters.dateFrom ?? ''}
                  onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || null })}
                  className="mt-0.5 block w-full px-2 py-1 text-sm border border-[#d0d0d0] rounded"
                />
              </label>
              <label className="block text-xs text-[#707070]">
                To
                <input
                  type="date"
                  value={filters.dateTo ?? ''}
                  onChange={(e) => onChange({ ...filters, dateTo: e.target.value || null })}
                  className="mt-0.5 block w-full px-2 py-1 text-sm border border-[#d0d0d0] rounded"
                />
              </label>
              {(filters.dateFrom || filters.dateTo) && (
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, dateFrom: null, dateTo: null })}
                  className="text-xs text-[#A0382A] hover:underline"
                >
                  Clear dates
                </button>
              )}
            </div>,
          )}
      </div>

      <div className="relative">
        {btn('calls', 'Calls', callsCount)}
        {open === 'calls' &&
          panel(
            <div className="space-y-1">
              {checklist<LeadDialOutcomeFilter>(LEAD_DIAL_OUTCOME_OPTIONS, filters.dialOutcomes, (k) =>
                onChange({ ...filters, dialOutcomes: toggleIn(filters.dialOutcomes, k) }),
              )}
              <div className="border-t border-[#eee] pt-1">
                <label className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-[#f5f5f5] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.neverContacted}
                    onChange={() => onChange({ ...filters, neverContacted: !filters.neverContacted })}
                  />
                  Never called
                </label>
                <div className="flex items-center gap-2 px-2 py-1 text-sm">
                  <span className="text-[#374151]">Not called in</span>
                  {numField(filters.notContactedDays, (n) => onChange({ ...filters, notContactedDays: n }), 'days')}
                  <span className="text-[#707070]">days</span>
                </div>
                <div className="flex items-center gap-2 px-2 py-1 text-sm">
                  <span className="text-[#374151]">Called within</span>
                  {numField(filters.contactedWithinDays, (n) => onChange({ ...filters, contactedWithinDays: n }), 'days')}
                  <span className="text-[#707070]">days</span>
                </div>
              </div>
            </div>,
          )}
      </div>

      <div className="relative">
        {btn('activity', 'Activity', activityCount)}
        {open === 'activity' &&
          panel(
            <div className="space-y-0.5">
              {triRow('Downloaded app', filters.appDownloaded, (v) => onChange({ ...filters, appDownloaded: v }))}
              {triRow('Assessment done', filters.assessmentCompleted, (v) =>
                onChange({ ...filters, assessmentCompleted: v }),
              )}
              {triRow('Intro text sent', filters.introSent, (v) => onChange({ ...filters, introSent: v }))}
            </div>,
          )}
      </div>

      <div className="relative">
        {btn('more', 'More', moreCount)}
        {open === 'more' &&
          panel(
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="text-sm text-[#374151]">Smoker</span>
                <div className="flex rounded border border-[#d0d0d0] overflow-hidden">
                  {(
                    [
                      [null, 'Any'],
                      ['Y', 'Yes'],
                      ['N', 'No'],
                    ] as const
                  ).map(([v, t]) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onChange({ ...filters, smoker: v })}
                      className={`px-2 py-0.5 text-xs ${
                        filters.smoker === v ? 'bg-[#005851] text-white' : 'bg-white text-[#707070] hover:bg-[#f5f5f5]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="text-sm text-[#374151]">Gender</span>
                <div className="flex rounded border border-[#d0d0d0] overflow-hidden">
                  {(
                    [
                      [null, 'Any'],
                      ['M', 'Male'],
                      ['F', 'Female'],
                    ] as const
                  ).map(([v, t]) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onChange({ ...filters, gender: v })}
                      className={`px-2 py-0.5 text-xs ${
                        filters.gender === v ? 'bg-[#005851] text-white' : 'bg-white text-[#707070] hover:bg-[#f5f5f5]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-[#f5f5f5] cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.hasMortgage}
                  onChange={() => onChange({ ...filters, hasMortgage: !filters.hasMortgage })}
                />
                Has mortgage on file
              </label>
            </div>,
          )}
      </div>

      <button
        type="button"
        onClick={() => onChange({ ...filters, followUpDue: !filters.followUpDue })}
        className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-[5px] border ${
          filters.followUpDue
            ? 'border-[#F0B100] bg-[#FFF4D6] text-[#92500D]'
            : 'border-[#d0d0d0] bg-white text-[#707070] hover:border-[#45bcaa]'
        }`}
      >
        Follow-ups due
      </button>

      {hasActiveFilters(filters) && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_LEAD_FILTERS)}
          className="text-xs font-semibold text-[#707070] hover:text-[#A0382A] underline"
        >
          Clear all ({activeFilterCount(filters)})
        </button>
      )}
    </div>
  );
}
