'use client';

import { useRouter } from 'next/navigation';

/**
 * Compact, static promo for the Refer & Earn affiliate program. Lives in the
 * empty space to the right of the APV hero on the dashboard home (stacks below
 * it on mobile) — a small self-contained card, deliberately NOT a full-width
 * banner so it reads as its own thing rather than competing with the page.
 *
 * Not dismissable — the whole point is to keep promoting the one place an agent
 * earns passive income. Number mirrors the refer-and-earn page (20% of year-1
 * revenue → up to $237.60/yr per Pro referral). Dark-teal brand gradient with a
 * gold accent + pulsing gold glow so it still pops.
 */
export default function ReferEarnPromoCard() {
  const router = useRouter();

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#0D4D4D] to-[#1a6868] ring-1 ring-[#f5c542]/50 animate-[goldGlow_3s_ease-in-out_infinite] p-3.5 w-full h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-[#f5c542]/20 ring-1 ring-[#f5c542]/40 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-[#f5c542]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#f5c542]">
          Refer &amp; Earn
        </p>
      </div>

      <p className="text-white font-bold text-sm leading-snug">
        Up to <span className="text-[#f5c542]">$237.60/yr</span> per agent you invite to AFL.
      </p>

      <button
        type="button"
        onClick={() => router.push('/dashboard/refer-and-earn')}
        className="mt-auto w-full bg-[#f5c542] hover:bg-[#ffd860] text-[#0D4D4D] px-4 py-2 rounded-md text-sm font-extrabold transition-colors"
      >
        Start earning →
      </button>
    </div>
  );
}
