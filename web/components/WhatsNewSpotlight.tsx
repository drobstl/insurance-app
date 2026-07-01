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
  // A compact tile that opens a dropdown panel on click (it lives in a
  // small slot in the home top-row rail).
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Hydration-safe localStorage read — can't run during render (SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeenDate(window.localStorage.getItem(SEEN_KEY));
    setReady(true);
  }, []);

  if (!ready) return null;

  const fresh = PATCH_WHATS_NEW.filter((e) => !seenDate || e.date > seenDate);

  // Nothing unseen → a calm "caught up" tile (quieter than the active
  // NEW state) so the top-row rail stays balanced instead of leaving a
  // hole next to Refer & Earn.
  if (fresh.length === 0) {
    return (
      <div className="h-full w-full bg-[#f4f9f8] rounded-xl border-2 border-[#cfe6e0] border-r-[4px] border-b-[4px] p-3 flex flex-col justify-center">
        <div className="flex items-center gap-1.5" style={{ color: '#0d8f7a' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[12px] font-bold">All caught up</span>
        </div>
        <p className="text-[10px] text-[#5f7a72] mt-1">New features land here.</p>
      </div>
    );
  }

  const newest = PATCH_WHATS_NEW.reduce((max, e) => (e.date > max ? e.date : max), '');
  const lead = fresh[0];

  const dismiss = () => {
    if (typeof window !== 'undefined') window.localStorage.setItem(SEEN_KEY, newest);
    setSeenDate(newest);
    setOpen(false);
  };

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="h-full w-full text-left bg-[#eafaf7] rounded-xl border-2 border-[#005851] border-r-[4px] border-b-[4px] p-3 flex flex-col"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wide bg-[#005851] text-white px-2 py-0.5 rounded-full">
            New
          </span>
          <svg
            className={`w-3.5 h-3.5 text-[#005851] transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <p className="text-[13px] font-bold text-[#005851] mt-1.5">What&apos;s new</p>
        <p className="text-[10px] text-[#3a3a3a] mt-auto truncate">
          {lead.title}
          {fresh.length > 1 ? ` +${fresh.length - 1} more` : ''}
        </p>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute z-50 top-full mt-2 right-0 w-[320px] max-w-[85vw] bg-white rounded-xl border-2 border-[#005851] border-r-[5px] border-b-[5px] p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide bg-[#005851] text-white px-2 py-0.5 rounded-full">
                  New
                </span>
                <span className="text-base font-bold text-[#005851]">What&apos;s new in AFL</span>
              </span>
              <button onClick={dismiss} className="text-[#005851]/70 hover:text-[#005851] text-sm font-medium shrink-0" aria-label="Dismiss what's new">
                Got it
              </button>
            </div>
            <ul className="space-y-2.5">
              {fresh.slice(0, 5).map((e) => (
                <li key={`${e.date}-${e.title}`} className="text-sm leading-snug">
                  <span className="font-semibold text-[#1a1a1a]">{e.title}</span>
                  <span className="text-[#3a3a3a]"> — {e.summary}</span>
                  {e.route && (
                    <Link href={e.route} className="text-[#0d8f7a] font-medium hover:underline whitespace-nowrap ml-1">
                      Open →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
