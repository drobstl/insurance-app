'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  type LeadFilters,
  type LeadStatusFilter,
  LEAD_STATUS_OPTIONS,
  EMPTY_LEAD_FILTERS,
  activeFilterCount,
  hasActiveFilters,
} from '../lib/lead-filters';
import { type LeadTag, tagSwatchClass } from '../lib/lead-tag';

type OpenKey = 'status' | 'tags' | 'state' | 'date' | null;

/**
 * Filter bar for the All-leads view. Pure UI over a LeadFilters value — the
 * predicates run in the page's filteredLeads useMemo. Dropdowns are
 * absolutely positioned (the All view is a normal table, not the call-mode
 * slide-belt, so no portal needed); one open at a time, click-outside closes.
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

  const toggleStatus = (s: LeadStatusFilter) => {
    const has = filters.statuses.includes(s);
    onChange({
      ...filters,
      statuses: has ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s],
    });
  };
  const toggleTag = (id: string) => {
    const has = filters.tagIds.includes(id);
    onChange({
      ...filters,
      tagIds: has ? filters.tagIds.filter((x) => x !== id) : [...filters.tagIds, id],
    });
  };

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
    <div className="absolute left-0 z-30 mt-1 min-w-[12rem] max-w-[18rem] p-2 bg-white rounded-[8px] border border-[#d0d0d0] shadow-lg">
      {children}
    </div>
  );

  return (
    <div ref={barRef} className="relative flex items-center gap-2 flex-wrap mb-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Filter</span>

      <div className="relative">
        {btn('status', 'Status', filters.statuses.length)}
        {open === 'status' &&
          panel(
            <div className="space-y-0.5">
              {LEAD_STATUS_OPTIONS.map((o) => (
                <label
                  key={o.key}
                  className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-[#f5f5f5] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={filters.statuses.includes(o.key)}
                    onChange={() => toggleStatus(o.key)}
                  />
                  {o.label}
                </label>
              ))}
            </div>,
          )}
      </div>

      <div className="relative">
        {btn('tags', 'Tags', filters.tagIds.length)}
        {open === 'tags' &&
          panel(
            tags.length === 0 ? (
              <p className="px-2 py-1 text-xs text-[#9CA3AF]">No tags yet — add them on a lead.</p>
            ) : (
              <div className="space-y-0.5 max-h-56 overflow-auto">
                {tags.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-[#f5f5f5] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={filters.tagIds.includes(t.id)}
                      onChange={() => toggleTag(t.id)}
                    />
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${tagSwatchClass(t.color)}`} />
                    {t.label}
                  </label>
                ))}
              </div>
            ),
          )}
      </div>

      <div className="relative">
        {btn('state', filters.state ? `State · ${filters.state}` : 'State', filters.state ? 1 : 0)}
        {open === 'state' &&
          panel(
            availableStates.length === 0 ? (
              <p className="px-2 py-1 text-xs text-[#9CA3AF]">No states on file.</p>
            ) : (
              <div className="max-h-56 overflow-auto space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onChange({ ...filters, state: null });
                    setOpen(null);
                  }}
                  className="block w-full text-left px-2 py-1 text-sm rounded hover:bg-[#f5f5f5] text-[#707070]"
                >
                  Any state
                </button>
                {availableStates.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      onChange({ ...filters, state: s });
                      setOpen(null);
                    }}
                    className={`block w-full text-left px-2 py-1 text-sm rounded hover:bg-[#f5f5f5] ${
                      filters.state === s ? 'font-bold text-[#005851]' : ''
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ),
          )}
      </div>

      <div className="relative">
        {btn('date', 'Date', filters.dateFrom || filters.dateTo ? 1 : 0)}
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
