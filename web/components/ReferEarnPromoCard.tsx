'use client';

import { useRouter } from 'next/navigation';

/**
 * Loud, static promo for the Refer & Earn affiliate program, shown on the
 * dashboard home directly under the APV hero (above the metric cards).
 *
 * Deliberately NOT dismissable — the whole point is to keep promoting the one
 * place an agent can earn passive income. Numbers are static and mirror the
 * refer-and-earn page (20% of year-1 revenue → $117.60/yr per Growth referral,
 * $237.60/yr per Pro referral). Visual: dark-teal brand gradient with a gold
 * accent + pulsing gold glow so it pops off the page and stands apart from the
 * teal banners above it.
 */
export default function ReferEarnPromoCard() {
  const router = useRouter();

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0D4D4D] to-[#1a6868] ring-1 ring-[#f5c542]/50 animate-[goldGlow_3s_ease-in-out_infinite] mt-2 mb-8 p-5 md:p-6">
      {/* Soft gold wash in the corner for depth */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full bg-[#f5c542]/15 blur-2xl"
      />

      <div className="relative flex flex-col md:flex-row md:items-center gap-5">
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-[#f5c542]/20 ring-1 ring-[#f5c542]/40 flex items-center justify-center shrink-0">
          <svg className="w-6 h-6 text-[#f5c542]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        {/* Copy */}
        <div className="flex-1 min-w-0">
          <p className="inline-block text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#f5c542] mb-1">
            Refer &amp; Earn
          </p>
          <p className="text-white font-extrabold text-lg md:text-xl leading-snug">
            Get paid for every agent you refer —{' '}
            <span className="text-[#f5c542]">20% of their first year.</span>
          </p>
          <p className="text-white/75 text-sm mt-1">
            Share AgentForLife with other agents and earn every month they pay us. No cap.
          </p>

          {/* Payout proof chips */}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="inline-flex items-center rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
              <span className="text-[#f5c542] font-bold mr-1">$117.60/yr</span> per Growth agent
            </span>
            <span className="inline-flex items-center rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
              <span className="text-[#f5c542] font-bold mr-1">$237.60/yr</span> per Pro agent
            </span>
            <span className="inline-flex items-center rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
              Refer 25 → <span className="text-[#f5c542] font-bold ml-1">$2,940+/yr</span>
            </span>
          </div>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => router.push('/dashboard/refer-and-earn')}
          className="shrink-0 w-full md:w-auto bg-[#f5c542] hover:bg-[#ffd860] text-[#0D4D4D] px-5 py-2.5 rounded-md text-sm font-extrabold whitespace-nowrap transition-colors"
        >
          Start earning →
        </button>
      </div>
    </div>
  );
}
