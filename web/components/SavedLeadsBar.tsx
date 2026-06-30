'use client';

/**
 * Saved lead lists ("segments") bar — sits under the filter/sort row on the
 * All-leads view. Each saved list is a one-click snapshot of the current
 * search + filters + sort; clicking a chip re-applies it. "Save list" captures
 * the current view; the × deletes. Pure presentation — the page owns the view
 * state and the persistence callbacks (see DashboardContext + lib/lead-segment).
 */

import { useState } from 'react';
import {
  type SavedLeadSegment,
  segmentMatchesState,
  MAX_LEAD_SEGMENTS,
  MAX_SEGMENT_NAME_LEN,
} from '../lib/lead-segment';
import type { LeadFilters } from '../lib/lead-filters';

interface SavedLeadsBarProps {
  segments: SavedLeadSegment[];
  current: { filters: LeadFilters; searchQuery: string; sortKey: string; sortDir: string };
  /** Whether the current view has anything worth saving (non-empty search/filter/sort). */
  canSave: boolean;
  onApply: (seg: SavedLeadSegment) => void;
  onSave: (name: string) => void | Promise<unknown>;
  onDelete: (id: string) => void | Promise<unknown>;
}

export default function SavedLeadsBar({
  segments,
  current,
  canSave,
  onApply,
  onSave,
  onDelete,
}: SavedLeadsBarProps) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const atMax = segments.length >= MAX_LEAD_SEGMENTS;

  const submit = async () => {
    const clean = name.trim();
    if (!clean) return;
    await onSave(clean);
    setName('');
    setNaming(false);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap text-xs mb-2">
      <span className="font-semibold uppercase tracking-wider text-[#9CA3AF]">Lists</span>

      {segments.length === 0 && !naming && (
        <span className="text-[#9CA3AF] italic">none yet — save a search to dial that segment in one tap</span>
      )}

      {segments.map((seg) => {
        const active = segmentMatchesState(seg, current);
        return (
          <span
            key={seg.id}
            className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full border transition-colors ${
              active
                ? 'bg-[#daf3f0] border-[#44bbaa] text-[#005851]'
                : 'bg-white border-[#d0d0d0] text-[#374151] hover:border-[#45bcaa]'
            }`}
          >
            <button
              type="button"
              onClick={() => onApply(seg)}
              className="font-semibold max-w-[180px] truncate"
              title={`Apply "${seg.name}"`}
            >
              {seg.name}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete saved list "${seg.name}"?`)) onDelete(seg.id);
              }}
              aria-label={`Delete ${seg.name}`}
              className="w-4 h-4 rounded-full text-[#9CA3AF] hover:text-[#A0382A] hover:bg-rose-50 flex items-center justify-center"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        );
      })}

      {naming ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={name}
            maxLength={MAX_SEGMENT_NAME_LEN}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') {
                setNaming(false);
                setName('');
              }
            }}
            placeholder="Name this list…"
            className="px-2 py-1 border border-[#45bcaa] rounded-[5px] bg-white w-44 focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim()}
            className="px-2 py-1 rounded-[5px] bg-[#44bbaa] text-white font-semibold disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(false);
              setName('');
            }}
            className="px-1.5 py-1 text-[#707070] hover:text-[#005851]"
          >
            Cancel
          </button>
        </span>
      ) : (
        canSave &&
        !atMax && (
          <button
            type="button"
            onClick={() => setNaming(true)}
            title="Save this search, filters, and sort as a one-tap list — e.g. warm leads, or no-reply 30 days — so you start each session dialing the right leads first."
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-[#d0d0d0] text-[#707070] hover:border-[#45bcaa] hover:text-[#005851] font-semibold"
          >
            + Save list
          </button>
        )
      )}

      {atMax && <span className="text-[#9CA3AF]">max {MAX_LEAD_SEGMENTS} lists</span>}
    </div>
  );
}
