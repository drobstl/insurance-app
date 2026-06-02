'use client';

/**
 * useTierCTA — Track C (May 10, 2026) simplified version.
 *
 * The hook used to fetch live spot counts from `/api/spots-remaining`
 * and rotate CTA copy across the legacy founding/charter/inner_circle
 * tier ladder. With v3 pricing, that ladder is gone. The hook is
 * preserved as a thin shim so the existing landing pages (`/v5`, `/m`)
 * don't need wholesale rewrites just to change CTA targets; their
 * tier-aware UI elements (banner, ticker, filled-tier list) get static
 * copy now and the "tiers" array is empty.
 *
 * Front door (Entry-mechanism cutover, June 2026): the primary CTAs
 * point at the NO-CARD trial (`/signup`, bare — no `?tier=`), not at
 * `/pricing`. Bare `/signup` renders the no-card trial form (full
 * access for 14 days, no credit card), which is what the landing-page
 * copy promises. `/pricing` is still reachable from the homepage's own
 * pricing section + nav anchor for visitors who want to compare plans
 * before starting; it no longer needs to be the CTA destination.
 *
 * The full marketing rebuild is a separate next-up project; that's
 * where the landing pages will be reworked end-to-end. Until then this
 * shim keeps everything compiling without ripping the existing page
 * hierarchy apart.
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

  ctaHref: '/signup',
  ctaMobileHref: '/signup',
  ctaText: 'Start Free Trial',
  ctaSubtext: 'No credit card · 14-day free trial',
  bannerText: 'Built to 3x your book',
  tickerText:
    '🚀 14-DAY FREE TRIAL • NO CREDIT CARD • FULL ACCESS • '
    + '🚀 14-DAY FREE TRIAL • NO CREDIT CARD • FULL ACCESS • ',
  tierName: 'AgentForLife',
  tierPrice: 'from $49/mo',
};

export function useTierCTA(): TierCTAData {
  return STATIC_CTA;
}
