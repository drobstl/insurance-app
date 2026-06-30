'use client';

import { useState } from 'react';
import {
  type LeadFilters,
  activeFilterChips,
  coerceLeadFilters,
  hasActiveFilters,
} from '../lib/lead-filters';
import { type LeadTag } from '../lib/lead-tag';

/**
 * Search box for the All-leads view with natural-language understanding.
 *
 * Typing does live keyword search (unchanged). Pressing Enter (or the sparkle)
 * sends the text to /api/leads/search-translate, which compiles it into the
 * SAME LeadFilters the manual bar uses — so "80+ leads in Texas I haven't
 * called in 30 days" becomes real, editable filter chips. The AI only maps
 * words to known fields; it never reads the leads, so it can't invent a match,
 * and anything it can't map falls back to plain keyword search. The chip row
 * shows exactly what it understood, each removable on its own.
 */
const EXAMPLE = "hot leads in Texas I haven't called in 30 days";

export function SmartLeadSearch({
  user,
  searchQuery,
  setSearchQuery,
  filters,
  setFilters,
  tags,
  availableStates,
}: {
  user: { getIdToken: () => Promise<string> } | null;
  searchQuery: string;
  setSearchQuery: (s: string) => void;
  filters: LeadFilters;
  setFilters: (f: LeadFilters) => void;
  tags: LeadTag[];
  availableStates: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState(false);

  const tagLabel = (id: string) => tags.find((t) => t.id === id)?.label ?? null;
  const chips = activeFilterChips(filters, tagLabel);

  async function runTranslate() {
    const q = searchQuery.trim();
    if (!q || !user || busy) return;
    setBusy(true);
    setError(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/leads/search-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          query: q,
          tags: tags.map((t) => ({ id: t.id, label: t.label })),
          states: availableStates,
        }),
      });
      if (!res.ok) throw new Error(`translate ${res.status}`);
      const data = await res.json();
      // Replace the working set with the understood intent — BUT only when the
      // sentence actually produced filters. A plain keyword ("john") translates
      // to empty filters; replacing then would silently wipe filters the agent
      // set by hand, so we leave those alone and just run the keyword search.
      const next = coerceLeadFilters(data.filters);
      if (hasActiveFilters(next)) setFilters(next);
      setSearchQuery(typeof data.searchQuery === 'string' ? data.searchQuery : '');
    } catch {
      // Leave searchQuery as-is — live keyword search already covers it.
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md mb-1.5">
      <div className="relative">
        <button
          type="button"
          onClick={runTranslate}
          disabled={busy || !searchQuery.trim()}
          aria-label="Search in plain English"
          title="Search in plain English"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#45bcaa] disabled:text-[#c0c0c0]"
        >
          {busy ? (
            <svg className="w-4 h-4 animate-spin text-[#45bcaa]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M11 3l1.6 4.4L17 9l-4.4 1.6L11 15l-1.6-4.4L5 9l4.4-1.6L11 3zm7 9l.9 2.4L21 15l-2.1.6L18 18l-.9-2.4L15 15l2.1-.6L18 12z" />
            </svg>
          )}
        </button>
        <input
          type="text"
          placeholder="Search leads, or describe them…"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (error) setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              runTranslate();
            }
          }}
          className="w-full pl-9 pr-8 py-1.5 bg-white rounded-[5px] border border-[#d0d0d0] text-sm text-[#000000] placeholder-[#707070] focus:outline-none focus:border-[#45bcaa]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full text-[#707070] hover:bg-gray-100 flex items-center justify-center"
            aria-label="Clear search"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Teaching subtitle — always visible, zero clicks. The (i) opens the
          full "what you can search" list for anyone who wants it. */}
      <div className="flex items-center gap-1 mt-1 px-0.5 text-[11px] text-[#9CA3AF]">
        {error ? (
          <span className="text-[#A0382A]">Couldn&rsquo;t read that one — showing keyword matches instead.</span>
        ) : (
          <span>
            Try plain English — e.g.{' '}
            <button
              type="button"
              onClick={() => {
                setSearchQuery(EXAMPLE);
              }}
              className="italic text-[#707070] hover:text-[#005851] hover:underline"
            >
              &ldquo;{EXAMPLE}&rdquo;
            </button>
            , then press Enter.
          </span>
        )}
        <span className="relative">
          <button
            type="button"
            onClick={() => setShowHelp((s) => !s)}
            aria-label="What you can search for"
            className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[#d0d0d0] text-[#9CA3AF] hover:border-[#45bcaa] hover:text-[#45bcaa] text-[10px] leading-none"
          >
            i
          </button>
          {showHelp && (
            <div className="absolute left-0 z-40 mt-1 w-72 p-3 bg-white rounded-[8px] border border-[#d0d0d0] shadow-lg text-[12px] text-[#374151] font-normal normal-case tracking-normal">
              <p className="font-semibold text-[#005851] mb-1">Search in plain English</p>
              <p className="mb-2 text-[#707070]">
                Describe the leads you want and AFL turns it into filters you can tweak. It searches by:
              </p>
              <p className="leading-relaxed">
                status, temperature (hot/warm/cool), age or 80+ lead-credit, state, city, tags, when they
                were added, call outcome, how recently you called, whether they downloaded the app, finished
                the assessment, or got an intro text, follow-ups, smoker, gender, and mortgage.
              </p>
              <p className="mt-2 text-[#707070]">Names, phone numbers, and lead codes work as plain search too.</p>
            </div>
          )}
        </span>
      </div>

      {chips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {chips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-[11px] font-semibold rounded-full bg-[#daf3f0] text-[#005851] border border-[#45bcaa]/40"
            >
              {chip.label}
              <button
                type="button"
                onClick={() => setFilters(chip.next)}
                aria-label={`Remove ${chip.label}`}
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-[#005851] hover:text-white"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
