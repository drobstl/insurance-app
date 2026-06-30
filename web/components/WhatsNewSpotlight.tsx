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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSeenDate(window.localStorage.getItem(SEEN_KEY));
    setReady(true);
  }, []);

  if (!ready) return null;

  const fresh = PATCH_WHATS_NEW.filter((e) => !seenDate || e.date > seenDate);
  if (fresh.length === 0) return null;

  const newest = PATCH_WHATS_NEW.reduce((max, e) => (e.date > max ? e.date : max), '');

  const dismiss = () => {
    if (typeof window !== 'undefined') window.localStorage.setItem(SEEN_KEY, newest);
    setSeenDate(newest);
  };

  return (
    <div className="bg-[#eafaf7] rounded-xl border-2 border-[#005851] border-r-[5px] border-b-[5px] p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide bg-[#005851] text-white px-2 py-0.5 rounded-full">
            New
          </span>
          <h2 className="text-base font-bold text-[#005851]">What&apos;s new in AFL</h2>
        </div>
        <button
          onClick={dismiss}
          className="text-[#005851]/70 hover:text-[#005851] text-sm font-medium shrink-0"
          aria-label="Dismiss what's new"
        >
          Got it
        </button>
      </div>
      <ul className="space-y-2.5">
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
    </div>
  );
}
