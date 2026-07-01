'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PATCH_WHATS_NEW } from '../lib/patch-knowledge';

// One source, two faces: this card and Patch's "RECENTLY SHIPPED" prompt block
// both read PATCH_WHATS_NEW. We track the newest date the agent has dismissed,
// so a fresh ship re-surfaces the card instead of it being a one-time banner.
const SEEN_KEY = 'patch-whats-new-seen-v1';

export default function WhatsNewSpotlight() {
  const [seenDate, setSeenDate] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Collapsed by default so it sits as a compact tile in the top row and
  // expands on click to read the details.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSeenDate(window.localStorage.getItem(SEEN_KEY));
    setReady(true);
  }, []);

  if (!ready) return null;

  const fresh = PATCH_WHATS_NEW.filter((e) => !seenDate || e.date > seenDate);
  if (fresh.length === 0) return null;

  const newest = PATCH_WHATS_NEW.reduce((max, e) => (e.date > max ? e.date : max), '');
  const lead = fresh[0];

  const dismiss = () => {
    if (typeof window !== 'undefined') window.localStorage.setItem(SEEN_KEY, newest);
    setSeenDate(newest);
  };

  return (
    <div className="h-full w-full bg-[#eafaf7] rounded-xl border-2 border-[#005851] border-r-[5px] border-b-[5px] p-4 flex flex-col">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-start justify-between gap-2 text-left w-full"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-wide bg-[#005851] text-white px-2 py-0.5 rounded-full">
            New
          </span>
          <span className="text-base font-bold text-[#005851]">What&apos;s new in AFL</span>
          {fresh.length > 1 && (
            <span className="text-[11px] font-semibold text-[#0d8f7a]">· {fresh.length} updates</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-[#005851] shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!expanded ? (
        <p className="text-sm leading-snug mt-2">
          <span className="font-semibold text-[#1a1a1a]">{lead.title}</span>
          <span className="text-[#3a3a3a]"> — {lead.summary}</span>
        </p>
      ) : (
        <>
          <ul className="space-y-2.5 mt-3">
            {fresh.slice(0, 5).map((e) => (
              <li key={`${e.date}-${e.title}`} className="text-sm leading-snug">
                <span className="font-semibold text-[#1a1a1a]">{e.title}</span>
                <span className="text-[#3a3a3a]"> — {e.summary}</span>
                {e.route && (
                  <Link
                    href={e.route}
                    className="text-[#0d8f7a] font-medium hover:underline whitespace-nowrap ml-1"
                  >
                    Open →
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <button
            onClick={dismiss}
            className="mt-3 self-start text-[#005851]/70 hover:text-[#005851] text-sm font-medium"
            aria-label="Dismiss what's new"
          >
            Got it
          </button>
        </>
      )}
    </div>
  );
}
