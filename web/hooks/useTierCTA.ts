'use client';

/**
 * useTierCTA — Track C (May 10, 2026) simplified version.
 *
 * The hook used to fetch live spot counts from `/api/spots-remaining`
 * and rotate CTA copy across the legacy founding/charter/inner_circle
 * tier ladder. With v3 pricing, that ladder is gone — every visitor
 * sees the same `/pricing` surface and picks a tier there. The hook
 * is preserved as a thin shim so the existing landing pages
 * (`/v5`, `/m`) don't need wholesale rewrites just to change CTA
 * targets; their tier-aware UI elements (banner, ticker, filled-tier
 * list) get static copy now and the "tiers" array is empty.
 *
 * The full marketing rebuild is a separate next-up project; that's
 * where the landing pages will be reworked end-to-end with new copy
 * and the new pricing page as the single CTA destination. Until then
 * this shim keeps everything compiling without ripping the existing
 * page hierarchy apart.
 */

export interface TierInfo {
  id: string;
  name: string;
  total: number;
  status: 'open' | 'full' | 'upcoming';
  spotsFilled: number;
  spotsRemaining: number;
}

export interface TierCTAData {
  /** Always 'standard' under v3 — there's no tier-ladder gating. */
  activeTier: 'standard';
  activeTierName: string;
  spotsRemaining: null;
  tiers: TierInfo[];
  filledTiers: TierInfo[];
  /** Always false under v3 — founding cohort is closed. */
  isFoundingOpen: boolean;
  loaded: boolean;

  ctaHref: string;
  ctaMobileHref: string;
  ctaText: string;
  ctaSubtext: string;
  bannerText: string;
  tickerText: string;
  tierName: string;
  tierPrice: string;
}

const STATIC_CTA: TierCTAData = {
  activeTier: 'standard',
  activeTierName: 'AgentForLife',
  spotsRemaining: null,
  tiers: [],
  filledTiers: [],
  isFoundingOpen: false,
  loaded: true,

  ctaHref: '/pricing',
  ctaMobileHref: '/pricing',
  ctaText: 'See Pricing',
  ctaSubtext: '14-day free trial · Cancel anytime',
  bannerText: 'Built to 3x your book',
  tickerText:
    '🚀 NEW PRICING IS LIVE • 14-DAY FREE TRIAL • SEE PRICING • '
    + '🚀 NEW PRICING IS LIVE • 14-DAY FREE TRIAL • SEE PRICING • ',
  tierName: 'AgentForLife',
  tierPrice: 'from $29/mo',
};

export function useTierCTA(): TierCTAData {
  return STATIC_CTA;
}
